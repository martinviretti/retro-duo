// Emparejamiento automático por "Código de sala".
//
// Envuelve PeerJS para ofrecer la MISMA interfaz que DirectHost / DirectGuest
// (p2p.js), pero sin intercambio manual de oferta y respuesta: el anfitrión
// crea una sala con un código corto y el jugador 2 se une escribiéndolo.
//
// PeerJS se carga desde un <script> en la página y queda como window.Peer.

import { DEFAULT_SETTINGS, ROOM_ID_PREFIX, buildPeerOptions } from './config.js';
import { boostVideoQuality } from './p2p.js';

const CODE_DIGITS = 4;
// PeerJS no siempre avisa cuando una sala no existe: cortamos por tiempo.
const OPEN_TIMEOUT_MS = 15000;
const JOIN_TIMEOUT_MS = 20000;

export function isQuickMatchAvailable() {
  return typeof window !== 'undefined' && typeof window.Peer === 'function';
}

function requirePeer() {
  if (!isQuickMatchAvailable()) {
    throw new Error('El emparejamiento por código no está disponible: no se pudo cargar PeerJS. Revisá tu conexión y recargá la página.');
  }
  return window.Peer;
}

export function randomRoomCode() {
  const min = 10 ** (CODE_DIGITS - 1);
  const max = 10 ** CODE_DIGITS - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export function normalizeRoomCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, CODE_DIGITS);
}

function roomId(code) {
  return `${ROOM_ID_PREFIX}${code}`;
}

// Traduce los códigos de error de PeerJS a mensajes en español.
function describePeerError(error) {
  const map = {
    'browser-incompatible': 'Este navegador no es compatible. Usá Chrome o Edge actualizado.',
    'unavailable-id': 'Ese código ya está en uso. Generá una sala nueva.',
    'peer-unavailable': 'No encontramos esa sala. Revisá el código o pedí al anfitrión que cree una nueva.',
    'network': 'Se perdió la conexión con el servidor de salas. Revisá tu conexión a Internet.',
    'server-error': 'El servidor de salas no respondió. Probá de nuevo en unos segundos.',
    'socket-error': 'Se interrumpió la conexión con el servidor de salas.',
    'socket-closed': 'El servidor de salas cerró la conexión.',
    'ssl-unavailable': 'El servidor de salas requiere HTTPS.'
  };
  return map[error?.type] || error?.message || 'Error de conexión desconocido.';
}

export class QuickHost {
  constructor({
    iceServers = DEFAULT_SETTINGS.iceServers,
    peerServer = DEFAULT_SETTINGS.peerServer,
    onState = () => {},
    onMessage = () => {}
  } = {}) {
    this.options = buildPeerOptions({ iceServers, peerServer });
    this.onState = onState;
    this.onMessage = onMessage;
    this.peer = null;
    this.conn = null;
    this.mediaCall = null;
    this.stream = null;
    this.code = null;
  }

  // Crea la sala y devuelve el código corto. Reintenta si el código ya existe.
  start(stream, attemptsLeft = 5) {
    const Peer = requirePeer();
    this.close();
    this.stream = stream;
    this.code = randomRoomCode();

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.close();
        reject(new Error('El servidor de salas no respondió. Revisá tu conexión e intentá de nuevo.'));
      }, OPEN_TIMEOUT_MS);

      const peer = new Peer(roomId(this.code), this.options);
      this.peer = peer;

      peer.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(this.code);
      });

      peer.on('connection', (conn) => this.bindConnection(conn));

      peer.on('disconnected', () => {
        try { peer.reconnect(); } catch {}
      });

      peer.on('error', (error) => {
        if (error?.type === 'unavailable-id' && attemptsLeft > 0) {
          // Otro anfitrión tomó ese código: probamos con otro.
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(this.start(stream, attemptsLeft - 1));
          return;
        }
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(describePeerError(error)));
        } else {
          this.onState('failed');
        }
      });
    });
  }

  bindConnection(conn) {
    // Solo aceptamos un jugador 2 por sala.
    if (this.conn && this.conn.open) {
      try { conn.close(); } catch {}
      return;
    }
    this.conn = conn;
    this.onState('connecting');

    conn.on('open', () => {
      this.onState('connected');
      // El anfitrión inicia la llamada de video/audio hacia el jugador 2.
      try {
        this.mediaCall = this.peer.call(conn.peer, this.stream);
        // Subimos la calidad una vez que la conexión negoció los senders.
        setTimeout(() => boostVideoQuality(this.mediaCall?.peerConnection), 1500);
      } catch (error) {
        console.warn('No se pudo transmitir el video al jugador 2.', error);
      }
    });
    conn.on('data', (data) => this.onMessage(data));
    conn.on('close', () => this.onState('closed'));
    conn.on('error', () => this.onState('failed'));
  }

  send(message) {
    if (!this.conn?.open) return false;
    this.conn.send(message);
    return true;
  }

  close() {
    try { this.mediaCall?.close(); } catch {}
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.mediaCall = null;
    this.conn = null;
    this.peer = null;
    this.stream = null;
  }
}

export class QuickGuest {
  constructor({
    iceServers = DEFAULT_SETTINGS.iceServers,
    peerServer = DEFAULT_SETTINGS.peerServer,
    onState = () => {},
    onStream = () => {},
    onMessage = () => {}
  } = {}) {
    this.options = buildPeerOptions({ iceServers, peerServer });
    this.onState = onState;
    this.onStream = onStream;
    this.onMessage = onMessage;
    this.peer = null;
    this.conn = null;
  }

  // Se une a una sala por su código. Resuelve cuando el canal está listo.
  join(code) {
    const Peer = requirePeer();
    const clean = normalizeRoomCode(code);
    if (clean.length !== CODE_DIGITS) {
      return Promise.reject(new Error(`El código debe tener ${CODE_DIGITS} dígitos.`));
    }
    this.close();
    this.onState('connecting');

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.close();
        reject(new Error(message));
      };
      const timer = setTimeout(
        () => fail('No pudimos unirnos a la sala. Revisá el código o pedí uno nuevo al anfitrión.'),
        JOIN_TIMEOUT_MS
      );

      const peer = new Peer(this.options);
      this.peer = peer;

      // El anfitrión llamará para enviar el video del emulador.
      peer.on('call', (call) => {
        call.answer();
        call.on('stream', (stream) => this.onStream(stream));
      });

      peer.on('open', () => {
        const conn = peer.connect(roomId(clean), { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.onState('connected');
          this.send({ type: 'hello', role: 'guest', at: Date.now() });
          resolve();
        });
        conn.on('data', (data) => this.onMessage(data));
        conn.on('close', () => this.onState('closed'));
        conn.on('error', () => this.onState('failed'));
      });

      peer.on('disconnected', () => {
        try { peer.reconnect(); } catch {}
      });

      peer.on('error', (error) => {
        if (!this.conn?.open) {
          fail(describePeerError(error));
        } else {
          this.onState('failed');
        }
      });
    });
  }

  send(message) {
    if (!this.conn?.open) return false;
    this.conn.send(message);
    return true;
  }

  close() {
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
  }
}
