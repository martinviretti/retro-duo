import { loadSettings } from './config.js';
import { DirectGuest, connectionLabel } from './p2p.js';
import { QuickGuest, isQuickMatchAvailable, normalizeRoomCode } from './quickmatch.js';
import { copyText, setBusy } from './utils.js';

const settings = loadSettings();
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomButton = document.getElementById('join-room-button');
const toggleManualJoinButton = document.getElementById('toggle-manual-join');
const manualJoin = document.getElementById('manual-join');
const guestOffer = document.getElementById('guest-offer');
const guestAnswer = document.getElementById('guest-answer');
const answerBlock = document.getElementById('answer-block');
const createAnswerButton = document.getElementById('create-answer');
const copyAnswerButton = document.getElementById('copy-answer');
const connectionState = document.getElementById('connection-state');
const connectionLight = document.getElementById('connection-light');
const connectionChip = document.getElementById('connection-chip');
const remoteVideo = document.getElementById('remote-video');
const videoPlaceholder = document.getElementById('video-placeholder');
const enableAudioButton = document.getElementById('enable-audio');
const profileSelect = document.getElementById('control-profile');
const gamepadStatus = document.getElementById('gamepad-status');
const latencyLabel = document.getElementById('latency-label');
const toastStack = document.getElementById('toast-stack');

const BASE_CONTROLS = {
  up: 4,
  down: 5,
  left: 6,
  right: 7,
  select: 2,
  start: 3
};
const PROFILES = {
  classic: { a: 8, b: 0, c: 9 },
  swap: { a: 0, b: 8, c: 9 },
  alternate: { a: 0, b: 9, c: 1 }
};
const KEY_TO_CONTROL = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  z: 'a',
  Z: 'a',
  x: 'b',
  X: 'b',
  c: 'c',
  C: 'c',
  Enter: 'start',
  Shift: 'select'
};

let guest = null;
let quickGuest = null;
let connected = false;
let lastPongAt = 0;
let pingTimer = null;
const activeControls = new Set();
const gamepadButtons = new Map();

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.textContent = message;
  toastStack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3400);
}

function controlIndex(control) {
  return BASE_CONTROLS[control] ?? PROFILES[profileSelect.value]?.[control] ?? null;
}

function setStep(step) {
  ['offer', 'answer', 'play'].forEach((name) => {
    const element = document.getElementById(`step-${name}`);
    const names = ['offer', 'answer', 'play'];
    const current = names.indexOf(step);
    const index = names.indexOf(name);
    element.classList.toggle('active', index === current);
    element.classList.toggle('complete', index < current);
  });
}

function setState(state) {
  const label = connectionLabel(state);
  connectionState.textContent = label;
  connectionChip.innerHTML = `<i></i> ${label}`;
  connectionLight.className = '';
  connectionChip.classList.remove('connected', 'connecting', 'failed');

  if (state === 'new' || state === 'connecting') {
    connectionLight.classList.add('connecting');
    connectionChip.classList.add('connecting');
  }
  if (state === 'connected') {
    connected = true;
    connectionLight.classList.add('connected');
    connectionChip.classList.add('connected');
    setStep('play');
    showToast('Conectado con el anfitrión.');
    startLatencyProbe();
  }
  if (['failed', 'disconnected', 'closed'].includes(state)) {
    connected = false;
    connectionLight.classList.add('failed');
    connectionChip.classList.add('failed');
    releaseAll();
    stopLatencyProbe();
    if (state === 'failed') showToast('La conexión falló. Creá una respuesta nueva.', 'error');
  }
}

function onStream(stream) {
  remoteVideo.srcObject = stream;
  videoPlaceholder.hidden = true;
  remoteVideo.muted = false;
  enableAudioButton.hidden = true;
  remoteVideo.play().catch(() => {
    enableAudioButton.hidden = stream.getAudioTracks().length === 0;
  });
}

function handleMessage(message) {
  if (message?.type === 'pong' && message.at) {
    lastPongAt = performance.now();
    latencyLabel.textContent = `Latencia ~${Math.max(1, Math.round(lastPongAt - message.at))} ms`;
  }
}

async function createAnswer() {
  try {
    const code = guestOffer.value.trim();
    if (!code) throw new Error('Pegá primero la oferta del anfitrión.');
    setBusy(createAnswerButton, true, 'Generando…');
    releaseAll();
    closeGuests();
    guest = new DirectGuest({
      iceServers: settings.iceServers,
      onState: setState,
      onStream,
      onMessage: handleMessage
    });
    setState('connecting');
    const answer = await guest.acceptOffer(code);
    guestAnswer.value = answer;
    answerBlock.hidden = false;
    setStep('answer');
    showToast('Respuesta creada. Copiala al anfitrión.');
  } catch (error) {
    console.error(error);
    setState('failed');
    showToast(error.message || 'No se pudo leer la oferta.', 'error');
  } finally {
    setBusy(createAnswerButton, false);
  }
}

function guestSend(message) {
  return quickGuest?.send(message) || guest?.send(message) || false;
}

function closeGuests() {
  quickGuest?.close();
  quickGuest = null;
  guest?.close();
  guest = null;
}

async function joinRoom() {
  const code = normalizeRoomCode(roomCodeInput.value);
  if (code.length !== 4) {
    showToast('Escribí el código de 4 dígitos que te dieron.', 'error');
    roomCodeInput.focus();
    return;
  }
  if (!isQuickMatchAvailable()) {
    showToast('No se pudo cargar el servicio de salas. Usá el modo manual.', 'error');
    manualJoin.hidden = false;
    return;
  }
  try {
    setBusy(joinRoomButton, true, 'Uniéndome…');
    releaseAll();
    closeGuests();
    quickGuest = new QuickGuest({
      iceServers: settings.iceServers,
      peerServer: settings.peerServer,
      onState: setState,
      onStream,
      onMessage: handleMessage
    });
    setState('connecting');
    await quickGuest.join(code);
  } catch (error) {
    console.error(error);
    setState('failed');
    quickGuest = null;
    showToast(error.message || 'No se pudo unir a la sala.', 'error');
  } finally {
    setBusy(joinRoomButton, false);
  }
}

function sendInput(control, value) {
  const index = controlIndex(control);
  if (index === null) return;
  guestSend({ type: 'input', index, value });
}

function pressControl(control) {
  if (activeControls.has(control)) return;
  activeControls.add(control);
  document.querySelector(`[data-control="${control}"]`)?.classList.add('pressed');
  sendInput(control, 1);
}

function releaseControl(control) {
  if (!activeControls.has(control)) return;
  activeControls.delete(control);
  document.querySelector(`[data-control="${control}"]`)?.classList.remove('pressed');
  sendInput(control, 0);
}

function releaseAll() {
  [...activeControls].forEach(releaseControl);
  document.querySelectorAll('.control-button.pressed').forEach((button) => button.classList.remove('pressed'));
  guestSend({ type: 'release-all' });
  gamepadButtons.clear();
}

function bindVirtualControls() {
  document.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.dataset.control;
    const down = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      pressControl(control);
    };
    const up = (event) => {
      event.preventDefault();
      releaseControl(control);
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
}

function bindKeyboard() {
  document.addEventListener('keydown', (event) => {
    const control = KEY_TO_CONTROL[event.key];
    if (!control || event.repeat || ['TEXTAREA', 'INPUT', 'SELECT'].includes(event.target.tagName)) return;
    event.preventDefault();
    pressControl(control);
  });
  document.addEventListener('keyup', (event) => {
    const control = KEY_TO_CONTROL[event.key];
    if (!control) return;
    event.preventDefault();
    releaseControl(control);
  });
}

function updateGamepadStatus(gamepad) {
  if (gamepad) {
    gamepadStatus.classList.add('detected');
    gamepadStatus.innerHTML = `<i></i> ${gamepad.id.slice(0, 38)}`;
  } else {
    gamepadStatus.classList.remove('detected');
    gamepadStatus.innerHTML = '<i></i> Sin joystick detectado';
  }
}

function pollGamepads() {
  const gamepad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  updateGamepadStatus(gamepad);
  if (gamepad) {
    const mapping = [
      [0, 'b'], [1, 'a'], [2, 'c'], [8, 'select'], [9, 'start'],
      [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']
    ];
    mapping.forEach(([buttonIndex, control]) => {
      const pressed = Boolean(gamepad.buttons[buttonIndex]?.pressed || gamepad.buttons[buttonIndex]?.value > .5);
      const key = `${gamepad.index}:${buttonIndex}`;
      const previous = gamepadButtons.get(key) || false;
      if (pressed !== previous) {
        gamepadButtons.set(key, pressed);
        if (pressed) pressControl(control);
        else releaseControl(control);
      }
    });

    const axes = gamepad.axes || [];
    const axisStates = {
      left: axes[0] < -.55,
      right: axes[0] > .55,
      up: axes[1] < -.55,
      down: axes[1] > .55
    };
    Object.entries(axisStates).forEach(([control, pressed]) => {
      const key = `${gamepad.index}:axis:${control}`;
      const previous = gamepadButtons.get(key) || false;
      if (pressed !== previous) {
        gamepadButtons.set(key, pressed);
        if (pressed) pressControl(control);
        else releaseControl(control);
      }
    });
  }
  requestAnimationFrame(pollGamepads);
}

function startLatencyProbe() {
  stopLatencyProbe();
  pingTimer = setInterval(() => {
    const at = performance.now();
    guestSend({ type: 'ping', at });
  }, 2000);
}

function stopLatencyProbe() {
  clearInterval(pingTimer);
  pingTimer = null;
  latencyLabel.textContent = 'Latencia —';
}

joinRoomButton.addEventListener('click', joinRoom);
roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = normalizeRoomCode(roomCodeInput.value);
});
roomCodeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});
toggleManualJoinButton.addEventListener('click', () => {
  const show = manualJoin.hidden;
  manualJoin.hidden = !show;
  toggleManualJoinButton.setAttribute('aria-expanded', String(show));
});
createAnswerButton.addEventListener('click', createAnswer);
copyAnswerButton.addEventListener('click', async () => {
  try {
    await copyText(guestAnswer.value);
    showToast('Respuesta copiada.');
  } catch (error) {
    showToast(error.message || 'No se pudo copiar.', 'error');
  }
});
enableAudioButton.addEventListener('click', async () => {
  remoteVideo.muted = false;
  try {
    await remoteVideo.play();
    enableAudioButton.hidden = true;
  } catch {
    showToast('El navegador sigue bloqueando el audio.', 'error');
  }
});
document.getElementById('video-fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.getElementById('video-wrap').requestFullscreen();
  } catch {
    showToast('No se pudo activar pantalla completa.', 'error');
  }
});
document.getElementById('release-controls').addEventListener('click', releaseAll);
profileSelect.addEventListener('change', releaseAll);
window.addEventListener('blur', releaseAll);
window.addEventListener('pagehide', () => {
  releaseAll();
  stopLatencyProbe();
  closeGuests();
});
window.addEventListener('gamepaddisconnected', releaseAll);

bindVirtualControls();
bindKeyboard();
requestAnimationFrame(pollGamepads);
