import { CATALOG } from './catalog.js';
import { createCoverflow } from './coverflow.js';
import { getRom, listRoms, removeRom, saveRom } from './db.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './config.js';
import {
  announce,
  fileExtension,
  formatBytes,
  getCustomLibrary,
  hashFile,
  makeCustomId,
  safeText,
  saveCustomLibrary,
  setBusy
} from './utils.js';

const grid = document.getElementById('game-grid');
const showcase = document.getElementById('showcase');
const emptySearch = document.getElementById('empty-search');
const searchInput = document.getElementById('game-search');
const importDialog = document.getElementById('import-dialog');
const importForm = document.getElementById('import-form');
const importSlotId = document.getElementById('import-slot-id');
const importTitleInput = document.getElementById('import-title-input');
const romFileInput = document.getElementById('rom-file-input');
const selectedFile = document.getElementById('selected-file');
const rightsCheckbox = document.getElementById('rights-checkbox');
const saveRomButton = document.getElementById('save-rom-button');
const dropZone = document.getElementById('drop-zone');
const toastStack = document.getElementById('toast-stack');

const settingsDialog = document.getElementById('settings-dialog');
const settingsForm = document.getElementById('settings-form');
const cdnChannelInput = document.getElementById('cdn-channel');
const netplayServerInput = document.getElementById('netplay-server');
const iceServersInput = document.getElementById('ice-servers');

const guideDialog = document.getElementById('guide-dialog');
const legalDialog = document.getElementById('legal-dialog');

let records = new Map();
let libraryItems = [];
let contextMenu = null;

const coverflow = createCoverflow(showcase, {
  onPlay: (item) => { location.href = `player.html?slot=${encodeURIComponent(item.id)}`; },
  onImport: (item) => openImport(item),
  onMenu: (anchor, item, record) => showCardMenu(anchor, item, record)
});

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = document.createElement('span');
  icon.textContent = type === 'error' ? '!' : '✓';
  const text = document.createElement('p');
  text.textContent = message;
  toast.append(icon, text);
  toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function closeContextMenu() {
  if (contextMenu) contextMenu.remove();
  contextMenu = null;
}

function buildLibraryItems() {
  const custom = getCustomLibrary().map((item) => ({
    ...item,
    short: item.short || 'ROM',
    genre: item.genre || 'Juego personalizado',
    note: item.note || 'Importado por vos',
    accent: 'custom',
    custom: true
  }));
  libraryItems = [...CATALOG, ...custom];
}

function gameCard(item) {
  const record = records.get(item.id);
  const article = document.createElement('article');
  article.className = 'game-card';
  article.dataset.accent = item.accent || 'custom';
  article.dataset.search = `${item.title} ${item.genre} ${item.note}`.toLowerCase();

  const art = document.createElement('div');
  art.className = 'game-art';
  const badge = document.createElement('span');
  badge.className = 'game-badge';
  badge.textContent = item.short || 'ROM';
  const status = document.createElement('span');
  status.className = `pill ${record ? 'pill-ready' : 'pill-empty'}`;
  status.textContent = record ? 'Listo' : 'Sin archivo';
  art.append(badge, status);

  const body = document.createElement('div');
  body.className = 'game-body';
  const title = document.createElement('h3');
  title.textContent = item.title;
  const meta = document.createElement('div');
  meta.className = 'game-meta';
  const genre = document.createElement('span');
  genre.textContent = item.genre;
  const note = document.createElement('span');
  note.textContent = item.note;
  meta.append(genre, note);

  const file = document.createElement('div');
  file.className = 'game-file';
  if (record) {
    const strong = document.createElement('strong');
    strong.textContent = record.filename;
    const details = document.createElement('span');
    details.textContent = `${formatBytes(record.size)} · ID ${record.gameId}`;
    file.append(strong, details);
  } else {
    file.textContent = 'Elegí tu archivo local para habilitar el juego.';
  }

  const actions = document.createElement('div');
  actions.className = 'game-actions';
  const primary = document.createElement(record ? 'a' : 'button');
  primary.className = `button ${record ? 'button-primary' : 'button-secondary'}`;
  primary.textContent = record ? 'Jugar' : 'Cargar ROM';
  if (record) {
    primary.href = `player.html?slot=${encodeURIComponent(item.id)}`;
  } else {
    primary.type = 'button';
    primary.addEventListener('click', () => openImport(item));
  }

  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'game-menu-button';
  menu.setAttribute('aria-label', `Opciones de ${item.title}`);
  menu.textContent = '•••';
  menu.addEventListener('click', (event) => showCardMenu(event.currentTarget, item, record));
  actions.append(primary, menu);
  body.append(title, meta, file, actions);
  article.append(art, body);
  return article;
}

function renderLibrary() {
  buildLibraryItems();
  grid.textContent = '';
  const query = searchInput.value.trim().toLowerCase();
  const matchesQuery = (item) =>
    !query || `${item.title} ${item.genre} ${item.note}`.toLowerCase().includes(query);
  let count = 0;

  libraryItems.forEach((item) => {
    const card = gameCard(item);
    const matches = matchesQuery(item);
    card.hidden = !matches;
    if (matches) count += 1;
    grid.appendChild(card);
  });

  coverflow.update(libraryItems.filter(matchesQuery), records);
  emptySearch.hidden = count !== 0;
}

async function refreshRecords() {
  try {
    const all = await listRoms();
    records = new Map(all.map((record) => [record.id, record]));
    renderLibrary();
  } catch (error) {
    console.error(error);
    records = new Map();
    renderLibrary();
    showToast('No se pudo usar el almacenamiento local. La biblioteca se muestra, pero no podrá guardar archivos.', 'error');
  }
}

function openImport(item = null) {
  closeContextMenu();
  importForm.reset();
  selectedFile.hidden = true;
  selectedFile.textContent = '';
  const isCustom = !item;
  importSlotId.value = isCustom ? 'custom' : item.id;
  importTitleInput.value = isCustom ? '' : item.title;
  importTitleInput.readOnly = !isCustom;
  importDialog.showModal();
  window.setTimeout(() => (isCustom ? importTitleInput : dropZone).focus(), 50);
}

function updateSelectedFile(file) {
  if (!file) {
    selectedFile.hidden = true;
    selectedFile.textContent = '';
    return;
  }
  selectedFile.hidden = false;
  selectedFile.textContent = `${file.name} · ${formatBytes(file.size)}`;
}

function validateRomFile(file) {
  const allowed = new Set(['bin', 'gen', 'md', 'smd', 'zip', '7z']);
  if (!file) throw new Error('Seleccioná un archivo de juego.');
  if (!allowed.has(fileExtension(file.name))) {
    throw new Error('Formato no admitido. Usá .bin, .gen, .md, .smd, .zip o .7z.');
  }
  if (file.size > 128 * 1024 * 1024) {
    throw new Error('El archivo supera 128 MB. Esta versión está orientada a Sega Mega Drive.');
  }
}

async function handleImport(event) {
  event.preventDefault();
  const file = romFileInput.files?.[0];
  try {
    validateRomFile(file);
    if (!rightsCheckbox.checked) throw new Error('Debés confirmar que tenés autorización para usar el archivo.');
    const title = safeText(importTitleInput.value);
    if (!title) throw new Error('Ingresá un nombre para el juego.');

    setBusy(saveRomButton, true, 'Calculando huella…');
    const { hash, gameId } = await hashFile(file);
    const requestedSlot = importSlotId.value;
    const id = requestedSlot === 'custom' ? makeCustomId(hash) : requestedSlot;

    await saveRom({
      id,
      title,
      filename: file.name,
      extension: fileExtension(file.name),
      type: file.type || 'application/octet-stream',
      size: file.size,
      hash,
      gameId,
      blob: file,
      updatedAt: new Date().toISOString()
    });

    if (requestedSlot === 'custom') {
      const custom = getCustomLibrary();
      const existing = custom.findIndex((entry) => entry.id === id);
      const metadata = {
        id,
        title,
        short: title.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase().slice(0, 4) || 'ROM',
        genre: 'Juego personalizado',
        note: 'Importado por vos',
        accent: 'custom',
        custom: true
      };
      if (existing >= 0) custom[existing] = metadata;
      else custom.push(metadata);
      saveCustomLibrary(custom);
    }

    importDialog.close();
    showToast(`${title} quedó guardado únicamente en este navegador.`);
    announce(`${title} se agregó a la biblioteca.`);
    await refreshRecords();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo importar el archivo.', 'error');
  } finally {
    setBusy(saveRomButton, false);
  }
}

function showCardMenu(anchor, item, record) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');

  const replace = document.createElement('button');
  replace.type = 'button';
  replace.textContent = record ? '↻ Reemplazar archivo' : '＋ Cargar archivo';
  replace.addEventListener('click', () => openImport(item.custom ? { ...item, id: item.id } : item));
  menu.appendChild(replace);

  if (record) {
    const play = document.createElement('button');
    play.type = 'button';
    play.textContent = '▶ Abrir juego';
    play.addEventListener('click', () => {
      location.href = `player.html?slot=${encodeURIComponent(item.id)}`;
    });
    menu.prepend(play);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = '× Quitar de este navegador';
    remove.addEventListener('click', async () => {
      closeContextMenu();
      const ok = confirm(`¿Quitar “${item.title}” de este navegador? El archivo local original no se modifica.`);
      if (!ok) return;
      try {
        await removeRom(item.id);
        if (item.custom) {
          saveCustomLibrary(getCustomLibrary().filter((entry) => entry.id !== item.id));
        }
        showToast(`${item.title} fue quitado de la biblioteca.`);
        await refreshRecords();
      } catch (error) {
        console.error(error);
        showToast('No se pudo quitar el juego.', 'error');
      }
    });
    menu.appendChild(remove);
  }

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 10);
  const top = Math.min(rect.bottom + 6, window.innerHeight - menuRect.height - 10);
  menu.style.left = `${Math.max(10, left)}px`;
  menu.style.top = `${Math.max(10, top)}px`;
  contextMenu = menu;
}

function openSettings() {
  const settings = loadSettings();
  cdnChannelInput.value = settings.cdnChannel;
  netplayServerInput.value = settings.netplayServer;
  iceServersInput.value = JSON.stringify(settings.iceServers, null, 2);
  settingsDialog.showModal();
}

function handleSettings(event) {
  event.preventDefault();
  try {
    const iceServers = JSON.parse(iceServersInput.value);
    if (!Array.isArray(iceServers) || !iceServers.length) throw new Error('Los servidores ICE deben ser un array JSON no vacío.');
    const netplayServer = netplayServerInput.value.trim();
    if (netplayServer) new URL(netplayServer);

    saveSettings({
      cdnChannel: cdnChannelInput.value,
      netplayServer,
      iceServers
    });
    settingsDialog.close();
    showToast('Configuración guardada en este navegador.');
  } catch (error) {
    showToast(error.message || 'La configuración no es válida.', 'error');
  }
}

function resetSettings() {
  cdnChannelInput.value = DEFAULT_SETTINGS.cdnChannel;
  netplayServerInput.value = DEFAULT_SETTINGS.netplayServer;
  iceServersInput.value = JSON.stringify(DEFAULT_SETTINGS.iceServers, null, 2);
}

function openGuide() { guideDialog.showModal(); }
function openLegal() { legalDialog.showModal(); }

function bindGuideTabs() {
  document.querySelectorAll('[data-guide-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.guideTab;
      document.querySelectorAll('[data-guide-tab]').forEach((candidate) => {
        const active = candidate.dataset.guideTab === target;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-guide-panel]').forEach((panel) => {
        const active = panel.dataset.guidePanel === target;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
    });
  });
}

romFileInput.addEventListener('change', () => updateSelectedFile(romFileInput.files?.[0]));
['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
}));
dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  romFileInput.files = transfer.files;
  updateSelectedFile(file);
});

importForm.addEventListener('submit', handleImport);
document.getElementById('cancel-import').addEventListener('click', () => importDialog.close());
document.getElementById('import-main-button').addEventListener('click', () => openImport());
document.getElementById('import-custom-button').addEventListener('click', () => openImport());
searchInput.addEventListener('input', renderLibrary);

settingsForm.addEventListener('submit', handleSettings);
document.getElementById('settings-button').addEventListener('click', openSettings);
document.getElementById('cancel-settings').addEventListener('click', () => settingsDialog.close());
document.getElementById('reset-settings').addEventListener('click', resetSettings);

document.getElementById('help-button').addEventListener('click', openGuide);
document.getElementById('footer-help-button').addEventListener('click', openGuide);
document.getElementById('close-guide').addEventListener('click', () => guideDialog.close());
document.getElementById('guide-done').addEventListener('click', () => guideDialog.close());
document.getElementById('footer-legal-button').addEventListener('click', openLegal);
document.getElementById('close-legal').addEventListener('click', () => legalDialog.close());
document.getElementById('legal-done').addEventListener('click', () => legalDialog.close());
bindGuideTabs();

function setView(view) {
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
}
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

document.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  if (document.querySelector('dialog[open]')) return;
  if (showcase.hidden) return;
  if (event.key === 'ArrowLeft') { coverflow.move(-1); event.preventDefault(); }
  if (event.key === 'ArrowRight') { coverflow.move(1); event.preventDefault(); }
  if (event.key === 'Enter') {
    showcase.querySelector('.showcase-actions .button')?.click();
  }
});

document.addEventListener('click', (event) => {
  if (contextMenu && !contextMenu.contains(event.target) && !event.target.closest('.game-menu-button') && !event.target.closest('.showcase-options')) closeContextMenu();
});
window.addEventListener('resize', closeContextMenu);
window.addEventListener('scroll', closeContextMenu, { passive: true });

refreshRecords();
