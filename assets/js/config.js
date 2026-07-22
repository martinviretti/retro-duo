export const APP_NAME = 'Retro Duo';

export const DEFAULT_SETTINGS = {
  cdnChannel: 'stable',
  netplayServer: 'https://netplay.emulatorjs.org/',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  // Servidor de señalización para el modo "Código de sala".
  // null = usar el servidor gratuito público de PeerJS (0.peerjs.com).
  // Para máxima fiabilidad podés levantar tu propio PeerServer y poner aquí
  // por ejemplo: { host: 'mi-servidor.com', port: 443, path: '/', secure: true }
  peerServer: null
};

// Prefijo con el que se registran las salas en el servidor de señalización
// compartido, para que los códigos cortos no choquen con otros proyectos.
export const ROOM_ID_PREFIX = 'retro-duo-room-';

// Arma las opciones que espera el constructor de PeerJS a partir de los ajustes.
export function buildPeerOptions(settings = DEFAULT_SETTINGS) {
  const options = {
    config: { iceServers: settings.iceServers || DEFAULT_SETTINGS.iceServers },
    debug: 1
  };
  const server = settings.peerServer;
  if (server && typeof server === 'object' && server.host) {
    Object.assign(options, {
      host: server.host,
      path: server.path || '/',
      secure: server.secure !== false
    });
    if (server.port) options.port = server.port;
    if (server.key) options.key = server.key;
  }
  return options;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem('retro-duo-settings');
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      iceServers: Array.isArray(parsed.iceServers) && parsed.iceServers.length
        ? parsed.iceServers
        : structuredClone(DEFAULT_SETTINGS.iceServers)
    };
  } catch (error) {
    console.warn('No se pudieron leer los ajustes guardados.', error);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  localStorage.setItem('retro-duo-settings', JSON.stringify(settings));
}
