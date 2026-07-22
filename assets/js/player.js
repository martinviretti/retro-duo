import { getRom } from './db.js';
import { loadSettings } from './config.js';
import { DirectHost, connectionLabel } from './p2p.js';
import { QuickHost, isQuickMatchAvailable } from './quickmatch.js';
import { copyText, setBusy } from './utils.js';

const params = new URLSearchParams(location.search);
const slot = params.get('slot');
const settings = loadSettings();

const headerTitle = document.getElementById('header-game-title');
const stageTitle = document.getElementById('stage-game-title');
const emulatorStatus = document.getElementById('emulator-status');
const loading = document.getElementById('emulator-loading');
const errorPanel = document.getElementById('emulator-error');
const errorMessage = document.getElementById('emulator-error-message');
const fullscreenButton = document.getElementById('fullscreen-button');
const openNetplayButton = document.getElementById('open-netplay-button');
const serverLabel = document.getElementById('server-label');
const gameIdLabel = document.getElementById('game-id-label');
const fileCode = document.getElementById('file-code');
const createDirectButton = document.getElementById('create-direct-button');
const createRoomButton = document.getElementById('create-room-button');
const roomCodeCard = document.getElementById('room-code-card');
const roomCodeValue = document.getElementById('room-code-value');
const toggleManualButton = document.getElementById('toggle-manual');
const manualDirect = document.getElementById('manual-direct');
const directAudio = document.getElementById('direct-audio');
const directStatus = document.getElementById('direct-status');
const directStatusLight = document.getElementById('direct-status-light');
const handshake = document.getElementById('handshake');
const offerCode = document.getElementById('offer-code');
const answerCode = document.getElementById('answer-code');
const copyOfferButton = document.getElementById('copy-offer-button');
const acceptAnswerButton = document.getElementById('accept-answer-button');
const directLog = document.getElementById('direct-log');
const toastStack = document.getElementById('toast-stack');

let record = null;
let romUrl = null;
let directHost = null;
let quickHost = null;
let captureStream = null;
let audioDestination = null;
let emulatorReady = false;

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.textContent = message;
  toastStack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3600);
}

function logDirect(message, type = '') {
  const line = document.createElement('p');
  line.className = type;
  line.textContent = message;
  directLog.prepend(line);
  while (directLog.children.length > 6) directLog.lastElementChild.remove();
}

function setEmulatorState(label, ready = false) {
  emulatorStatus.innerHTML = `<i></i> ${label}`;
  emulatorStatus.classList.toggle('ready', ready);
}

function setDirectState(state) {
  directStatus.textContent = connectionLabel(state);
  directStatusLight.className = '';
  if (state === 'connecting' || state === 'new') directStatusLight.classList.add('connecting');
  if (state === 'connected') directStatusLight.classList.add('connected');
  if (state === 'failed' || state === 'disconnected' || state === 'closed') directStatusLight.classList.add('failed');

  if (state === 'connected') {
    logDirect('Jugador 2 conectado. Los controles remotos ya están activos.', 'success');
    showToast('Jugador 2 conectado.');
  } else if (state === 'failed') {
    logDirect('La conexión falló. Generá una oferta nueva.', 'error');
  } else if (state === 'disconnected') {
    logDirect('La conexión se interrumpió.', 'error');
  }
}

function showError(message) {
  loading.hidden = true;
  errorMessage.textContent = message;
  errorPanel.hidden = false;
  setEmulatorState('Error al cargar');
}

function getEmulatorCanvas() {
  return window.EJS_emulator?.gameManager?.canvas
    || window.EJS_emulator?.canvas
    || document.querySelector('#game canvas');
}

function simulateRemoteInput(index, value) {
  const gameManager = window.EJS_emulator?.gameManager;
  if (!gameManager?.simulateInput) return false;
  try {
    gameManager.simulateInput(1, Number(index), Number(value));
    return true;
  } catch (error) {
    console.warn('No se pudo inyectar el control remoto.', error);
    return false;
  }
}

function releaseRemoteControls() {
  for (let index = 0; index <= 16; index += 1) simulateRemoteInput(index, 0);
}

function tryAttachAudio(stream) {
  if (!directAudio.checked) return false;

  try {
    const audioElement = document.querySelector('#game audio');
    const elementStream = audioElement?.captureStream?.() || audioElement?.mozCaptureStream?.();
    const track = elementStream?.getAudioTracks?.()[0];
    if (track) {
      stream.addTrack(track);
      return true;
    }
  } catch (error) {
    console.debug('No se pudo capturar audio desde un elemento.', error);
  }

  try {
    const manager = window.EJS_emulator?.gameManager;
    const module = manager?.Module;
    const audioContext = module?.AL?.currentCtx?.audioCtx
      || module?.SDL2?.audioContext
      || manager?.audioContext;
    const audioNode = module?.AL?.currentCtx?.gain
      || manager?.audioNode
      || manager?.audio?.node;

    if (audioContext?.createMediaStreamDestination && audioNode?.connect) {
      audioDestination = audioContext.createMediaStreamDestination();
      audioNode.connect(audioDestination);
      const track = audioDestination.stream.getAudioTracks()[0];
      if (track) {
        stream.addTrack(track);
        return true;
      }
    }
  } catch (error) {
    console.debug('El núcleo no expuso una salida de audio capturable.', error);
  }

  return false;
}

function createCaptureStream() {
  const canvas = getEmulatorCanvas();
  if (!canvas?.captureStream) {
    throw new Error('Este navegador no permite transmitir el canvas. Usá Chrome o Edge actualizado.');
  }
  const stream = canvas.captureStream(30);
  // "detail" le dice a WebRTC que priorice la nitidez de la imagen (texto,
  // pixel-art) sobre la fluidez del movimiento, ideal para juegos retro.
  stream.getVideoTracks().forEach((track) => { track.contentHint = 'detail'; });
  const audioAdded = tryAttachAudio(stream);
  logDirect(audioAdded
    ? 'Video y audio preparados para transmitir.'
    : 'Video preparado. El audio remoto no está disponible en este núcleo/navegador.');
  return stream;
}

function hostSend(message) {
  return quickHost?.send(message) || directHost?.send(message) || false;
}

function closeHosts() {
  quickHost?.close();
  quickHost = null;
  directHost?.close();
  directHost = null;
  captureStream?.getVideoTracks().forEach((track) => track.stop());
}

function handleDirectMessage(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'input') {
    simulateRemoteInput(message.index, message.value);
  } else if (message.type === 'release-all') {
    releaseRemoteControls();
  } else if (message.type === 'hello') {
    logDirect('La pantalla del jugador 2 respondió correctamente.', 'success');
  } else if (message.type === 'ping') {
    hostSend({ type: 'pong', at: message.at });
  }
}

async function createRoom() {
  if (!isQuickMatchAvailable()) {
    showToast('No se pudo cargar el servicio de salas. Usá el modo manual.', 'error');
    manualDirect.hidden = false;
    return;
  }
  try {
    setBusy(createRoomButton, true, 'Creando sala…');
    releaseRemoteControls();
    closeHosts();
    captureStream = createCaptureStream();
    quickHost = new QuickHost({
      iceServers: settings.iceServers,
      peerServer: settings.peerServer,
      onState: setDirectState,
      onMessage: handleDirectMessage
    });
    setDirectState('connecting');
    logDirect('Creando sala en el servidor de emparejamiento…');
    const code = await quickHost.start(captureStream);
    roomCodeValue.textContent = code.split('').join(' ');
    roomCodeCard.hidden = false;
    setDirectState('new');
    logDirect(`Sala ${code} lista. Escribí ese código en la PC del jugador 2.`, 'success');
    showToast(`Sala ${code} creada.`);
  } catch (error) {
    console.error(error);
    setDirectState('failed');
    quickHost = null;
    logDirect(error.message || 'No se pudo crear la sala.', 'error');
    showToast(error.message || 'No se pudo crear la sala.', 'error');
  } finally {
    setBusy(createRoomButton, false);
  }
}

async function createDirectConnection() {
  try {
    setBusy(createDirectButton, true, 'Generando oferta…');
    releaseRemoteControls();
    closeHosts();
    captureStream = createCaptureStream();
    directHost = new DirectHost({
      iceServers: settings.iceServers,
      onState: setDirectState,
      onMessage: handleDirectMessage
    });
    setDirectState('connecting');
    logDirect('Reuniendo rutas de conexión WebRTC…');
    const offer = await directHost.createOffer(captureStream);
    offerCode.value = offer;
    answerCode.value = '';
    handshake.hidden = false;
    setDirectState('new');
    logDirect('Oferta creada. Enviásela al jugador 2.');
    showToast('Oferta directa creada.');
  } catch (error) {
    console.error(error);
    setDirectState('failed');
    logDirect(error.message || 'No se pudo crear la conexión.', 'error');
    showToast(error.message || 'No se pudo crear la conexión.', 'error');
  } finally {
    setBusy(createDirectButton, false);
  }
}

async function acceptDirectAnswer() {
  try {
    if (!answerCode.value.trim()) throw new Error('Pegá primero la respuesta del jugador 2.');
    setBusy(acceptAnswerButton, true, 'Conectando…');
    await directHost?.acceptAnswer(answerCode.value);
    setDirectState('connecting');
    logDirect('Respuesta aceptada. Esperando el enlace directo…');
  } catch (error) {
    console.error(error);
    logDirect(error.message || 'La respuesta no es válida.', 'error');
    showToast(error.message || 'La respuesta no es válida.', 'error');
  } finally {
    setBusy(acceptAnswerButton, false);
  }
}

function findNetplayButton() {
  const candidates = [...document.querySelectorAll('#game button, #game [role="button"], #game .ejs_button')];
  return candidates.find((element) => {
    const text = `${element.textContent || ''} ${element.title || ''} ${element.getAttribute('aria-label') || ''}`.toLowerCase();
    return text.includes('netplay') || text.includes('network') || text.includes('online');
  });
}

function openNetplayMenu() {
  const emulator = window.EJS_emulator;
  const directMethods = [
    () => emulator?.netplay?.openMenu?.(),
    () => emulator?.netplay?.open?.(),
    () => emulator?.gameManager?.netplay?.openMenu?.()
  ];

  for (const call of directMethods) {
    try {
      const result = call();
      if (result !== undefined) return;
    } catch {}
  }

  const button = findNetplayButton();
  if (button) {
    button.click();
    return;
  }

  showToast('El Netplay integrado no está disponible en esta versión. Usá Duo Direct.', 'error');
  document.querySelector('[data-online-tab="direct"]')?.click();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.getElementById('emulator-frame').requestFullscreen();
    }
  } catch (error) {
    showToast('El navegador no permitió pantalla completa.', 'error');
  }
}

function bindTabs() {
  document.querySelectorAll('[data-online-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.onlineTab;
      document.querySelectorAll('[data-online-tab]').forEach((candidate) => {
        const active = candidate.dataset.onlineTab === target;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-online-panel]').forEach((panel) => {
        const active = panel.dataset.onlinePanel === target;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
    });
  });
}

function onEmulatorReady() {
  emulatorReady = true;
  loading.hidden = true;
  errorPanel.hidden = true;
  setEmulatorState('Emulador listo', true);
  openNetplayButton.disabled = false;
  createDirectButton.disabled = false;
  if (isQuickMatchAvailable()) {
    createRoomButton.disabled = false;
  } else {
    createRoomButton.disabled = true;
    createRoomButton.textContent = 'Servicio de salas no disponible';
    manualDirect.hidden = false;
    logDirect('No se pudo cargar el servicio de salas. Está disponible el modo manual.', 'error');
  }
  logDirect('Emulador listo para compartir.');

  const canvas = getEmulatorCanvas();
  canvas?.addEventListener('click', () => {
    window.EJS_emulator?.gameManager?.Module?.AL?.currentCtx?.audioCtx?.resume?.();
  }, { once: true });
}

function configureEmulator() {
  const channel = ['stable', 'latest', 'nightly'].includes(settings.cdnChannel)
    ? settings.cdnChannel
    : 'stable';
  const path = `https://cdn.emulatorjs.org/${channel}/data/`;

  window.EJS_player = '#game';
  window.EJS_core = 'segaMD';
  window.EJS_gameUrl = romUrl;
  window.EJS_gameName = record.title;
  window.EJS_gameID = Number(record.gameId);
  window.EJS_pathtodata = path;
  window.EJS_language = 'es-ES';
  window.EJS_startOnLoaded = false;
  window.EJS_noAutoFocus = false;
  window.EJS_color = '#ff3f86';
  window.EJS_backgroundColor = '#030407';
  window.EJS_netplayServer = settings.netplayServer || undefined;
  window.EJS_netplayICEServers = settings.iceServers;
  window.EJS_DEBUG_XX = Boolean(settings.netplayServer);
  window.EJS_ready = onEmulatorReady;

  const script = document.createElement('script');
  script.src = `${path}loader.js`;
  script.async = true;
  script.onerror = () => showError('No se pudo descargar EmulatorJS. Revisá tu conexión a Internet o cambiá el canal CDN en Configuración.');
  document.body.appendChild(script);

  setTimeout(() => {
    if (!emulatorReady && !errorPanel.hidden) return;
    if (!emulatorReady && !window.EJS_emulator) {
      showError('El emulador tardó demasiado en iniciar. Revisá la conexión o probá el canal estable.');
    }
  }, 30000);
}

async function initialize() {
  bindTabs();
  serverLabel.textContent = settings.netplayServer ? new URL(settings.netplayServer).host : 'No configurado';

  if (!slot) {
    showError('No se indicó qué juego abrir. Volvé a la biblioteca.');
    return;
  }

  try {
    record = await getRom(slot);
    if (!record?.blob) throw new Error('El archivo ya no está disponible en este navegador. Volvé a importarlo.');
    romUrl = URL.createObjectURL(record.blob);
    document.title = `${record.title} — Retro Duo`;
    headerTitle.textContent = record.title;
    stageTitle.textContent = record.title;
    gameIdLabel.textContent = String(record.gameId);
    fileCode.textContent = `Huella ${record.hash.slice(0, 10).toUpperCase()}`;
    configureEmulator();
  } catch (error) {
    console.error(error);
    showError(error.message || 'No se pudo recuperar el juego.');
  }
}

fullscreenButton.addEventListener('click', toggleFullscreen);
openNetplayButton.addEventListener('click', openNetplayMenu);
createRoomButton.addEventListener('click', createRoom);
toggleManualButton.addEventListener('click', () => {
  const show = manualDirect.hidden;
  manualDirect.hidden = !show;
  toggleManualButton.setAttribute('aria-expanded', String(show));
});
createDirectButton.addEventListener('click', createDirectConnection);
acceptAnswerButton.addEventListener('click', acceptDirectAnswer);
copyOfferButton.addEventListener('click', async () => {
  try {
    await copyText(offerCode.value);
    showToast('Oferta copiada.');
  } catch (error) {
    showToast(error.message || 'No se pudo copiar.', 'error');
  }
});
document.getElementById('retry-button').addEventListener('click', () => location.reload());
window.addEventListener('beforeunload', () => {
  releaseRemoteControls();
  closeHosts();
  captureStream?.getTracks().forEach((track) => track.stop());
  if (romUrl) URL.revokeObjectURL(romUrl);
});
window.addEventListener('blur', releaseRemoteControls);

initialize();
