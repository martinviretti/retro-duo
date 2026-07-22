import { DEFAULT_SETTINGS } from './config.js';

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function compress(bytes) {
  if (!('CompressionStream' in window)) return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes) {
  if (!('DecompressionStream' in window)) {
    throw new Error('Este navegador no puede descomprimir el código de conexión.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeSignal(description) {
  const json = JSON.stringify(description);
  const plain = new TextEncoder().encode(json);
  const zipped = await compress(plain);
  if (zipped && zipped.length < plain.length) return `gz.${bytesToBase64Url(zipped)}`;
  return `b64.${bytesToBase64Url(plain)}`;
}

export async function decodeSignal(code) {
  const clean = String(code || '').trim();
  const separator = clean.indexOf('.');
  if (separator < 1) throw new Error('El código de conexión no tiene un formato válido.');

  const prefix = clean.slice(0, separator);
  const payload = clean.slice(separator + 1);
  let bytes = base64UrlToBytes(payload);
  if (prefix === 'gz') bytes = await decompress(bytes);
  if (prefix !== 'gz' && prefix !== 'b64') throw new Error('Formato de conexión desconocido.');

  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed?.type || !parsed?.sdp) throw new Error('El código no contiene una sesión WebRTC válida.');
  return parsed;
}

export function waitForIceComplete(peer, timeoutMs = 15000) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      peer.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (peer.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    peer.addEventListener('icegatheringstatechange', onChange);
  });
}

export function connectionLabel(state) {
  const labels = {
    new: 'Preparando',
    connecting: 'Conectando',
    connected: 'Conectado',
    disconnected: 'Interrumpido',
    failed: 'Falló',
    closed: 'Cerrado'
  };
  return labels[state] || state || 'Sin conexión';
}

export class DirectHost {
  constructor({
    iceServers = DEFAULT_SETTINGS.iceServers,
    onState = () => {},
    onMessage = () => {}
  } = {}) {
    this.iceServers = iceServers;
    this.onState = onState;
    this.onMessage = onMessage;
    this.peer = null;
    this.channel = null;
    this.stream = null;
  }

  async createOffer(stream) {
    this.close();
    this.stream = stream;
    this.peer = new RTCPeerConnection({ iceServers: this.iceServers, iceCandidatePoolSize: 2 });
    this.peer.addEventListener('connectionstatechange', () => {
      this.onState(this.peer.connectionState);
    });

    stream.getTracks().forEach((track) => this.peer.addTrack(track, stream));
    this.channel = this.peer.createDataChannel('retro-duo-controls', {
      ordered: true
    });
    this.bindChannel(this.channel);

    const offer = await this.peer.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });
    await this.peer.setLocalDescription(offer);
    await waitForIceComplete(this.peer);
    if (!this.peer.localDescription?.sdp?.includes('a=candidate:')) {
      this.close();
      throw new Error('El navegador no pudo reunir una ruta WebRTC. Desactivá VPN o proxy, revisá el firewall y volvé a intentarlo.');
    }
    return encodeSignal(this.peer.localDescription);
  }

  async acceptAnswer(code) {
    if (!this.peer) throw new Error('Primero generá una oferta.');
    const answer = await decodeSignal(code);
    if (answer.type !== 'answer') throw new Error('El código pegado no es una respuesta.');
    await this.peer.setRemoteDescription(answer);
  }

  bindChannel(channel) {
    this.channel = channel;
    channel.addEventListener('open', () => this.onState('connected'));
    channel.addEventListener('close', () => this.onState('closed'));
    channel.addEventListener('error', () => this.onState('failed'));
    channel.addEventListener('message', (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch (error) {
        console.warn('Mensaje P2P inválido.', error);
      }
    });
  }

  send(message) {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(message));
    return true;
  }

  close() {
    if (this.channel) {
      try { this.channel.close(); } catch {}
    }
    if (this.peer) {
      try { this.peer.close(); } catch {}
    }
    this.channel = null;
    this.peer = null;
    this.stream = null;
  }
}

export class DirectGuest {
  constructor({
    iceServers = DEFAULT_SETTINGS.iceServers,
    onState = () => {},
    onStream = () => {},
    onMessage = () => {}
  } = {}) {
    this.iceServers = iceServers;
    this.onState = onState;
    this.onStream = onStream;
    this.onMessage = onMessage;
    this.peer = null;
    this.channel = null;
  }

  async acceptOffer(code) {
    this.close();
    const offer = await decodeSignal(code);
    if (offer.type !== 'offer') throw new Error('El código pegado no es una oferta.');

    this.peer = new RTCPeerConnection({ iceServers: this.iceServers, iceCandidatePoolSize: 2 });
    this.peer.addEventListener('connectionstatechange', () => {
      this.onState(this.peer.connectionState);
    });
    this.peer.addEventListener('track', (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      this.onStream(stream);
    });
    this.peer.addEventListener('datachannel', (event) => this.bindChannel(event.channel));

    await this.peer.setRemoteDescription(offer);
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    await waitForIceComplete(this.peer);
    if (!this.peer.localDescription?.sdp?.includes('a=candidate:')) {
      this.close();
      throw new Error('El navegador no pudo reunir una ruta WebRTC. Desactivá VPN o proxy, revisá el firewall y volvé a intentarlo.');
    }
    return encodeSignal(this.peer.localDescription);
  }

  bindChannel(channel) {
    this.channel = channel;
    channel.addEventListener('open', () => {
      this.onState('connected');
      this.send({ type: 'hello', role: 'guest', at: Date.now() });
    });
    channel.addEventListener('close', () => this.onState('closed'));
    channel.addEventListener('error', () => this.onState('failed'));
    channel.addEventListener('message', (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch (error) {
        console.warn('Mensaje P2P inválido.', error);
      }
    });
  }

  send(message) {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(message));
    return true;
  }

  close() {
    if (this.channel) {
      try { this.channel.close(); } catch {}
    }
    if (this.peer) {
      try { this.peer.close(); } catch {}
    }
    this.channel = null;
    this.peer = null;
  }
}
