// Vitrina 3D estilo CoverFlow para elegir juegos.
//
// Renderiza las portadas en perspectiva: la central al frente y las laterales
// rotadas en 3D con un reflejo debajo. Se navega con las flechas del teclado,
// los botones ‹ ›, la rueda del mouse, arrastre táctil o haciendo clic en una
// portada lateral. Todo con transforms de CSS, sin librerías 3D.

import { formatBytes } from './utils.js';

const MAX_VISIBLE = 4; // portadas visibles a cada lado del centro

export function createCoverflow(root, { onPlay, onImport, onMenu } = {}) {
  const track = root.querySelector('#coverflow');
  const info = root.querySelector('#showcase-info');
  const dots = root.querySelector('#showcase-dots');
  const prevButton = root.querySelector('#showcase-prev');
  const nextButton = root.querySelector('#showcase-next');

  let items = [];
  let records = new Map();
  let index = 0;
  const covers = [];

  function coverArt(item, record) {
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'cover';
    cover.dataset.accent = item.accent || 'custom';
    cover.setAttribute('aria-label', item.title);

    const face = document.createElement('span');
    face.className = 'cover-face';
    const shine = document.createElement('span');
    shine.className = 'cover-shine';
    const grid = document.createElement('span');
    grid.className = 'cover-grid';
    const short = document.createElement('strong');
    short.className = 'cover-short';
    short.textContent = item.short || 'ROM';
    const name = document.createElement('span');
    name.className = 'cover-name';
    name.textContent = item.title;
    const state = document.createElement('span');
    state.className = `cover-state ${record ? 'ready' : 'empty'}`;
    state.textContent = record ? '● LISTO' : '○ SIN ARCHIVO';
    face.append(grid, shine, short, name, state);

    const reflection = document.createElement('span');
    reflection.className = 'cover-reflection';
    reflection.setAttribute('aria-hidden', 'true');
    reflection.dataset.accent = item.accent || 'custom';
    const rShort = document.createElement('strong');
    rShort.className = 'cover-short';
    rShort.textContent = item.short || 'ROM';
    reflection.append(rShort);

    cover.append(face, reflection);
    return cover;
  }

  function layout() {
    covers.forEach((cover, i) => {
      const offset = i - index;
      const abs = Math.abs(offset);
      const visible = abs <= MAX_VISIBLE;
      const sign = Math.sign(offset);
      const x = offset * 172 - sign * Math.min(abs, 1) * 46;
      const rotate = offset === 0 ? 0 : -sign * 42;
      const z = offset === 0 ? 60 : -abs * 60;
      const scale = offset === 0 ? 1 : Math.max(0.7, 0.92 - abs * 0.05);

      cover.style.transform =
        `translate(-50%, -50%) translateX(${x}px) translateZ(${z}px) rotateY(${rotate}deg) scale(${scale})`;
      cover.style.opacity = visible ? String(Math.max(0.25, 1 - abs * 0.22)) : '0';
      cover.style.zIndex = String(100 - abs);
      cover.style.pointerEvents = visible ? 'auto' : 'none';
      cover.classList.toggle('is-active', offset === 0);
      cover.tabIndex = offset === 0 ? 0 : -1;
    });
    renderInfo();
    renderDots();
  }

  function renderInfo() {
    const item = items[index];
    if (!item) { info.innerHTML = ''; return; }
    const record = records.get(item.id);
    info.innerHTML = '';

    const meta = document.createElement('div');
    meta.className = 'showcase-meta';
    const kicker = document.createElement('p');
    kicker.className = 'kicker';
    kicker.textContent = item.genre || 'Juego';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const note = document.createElement('p');
    note.className = 'showcase-note';
    note.textContent = record
      ? `${record.filename} · ${formatBytes(record.size)}`
      : item.note || 'Cargá tu archivo local para habilitarlo.';
    meta.append(kicker, title, note);

    const actions = document.createElement('div');
    actions.className = 'showcase-actions';
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = `button ${record ? 'button-primary' : 'button-secondary'}`;
    primary.textContent = record ? '▶ Jugar' : '＋ Cargar ROM';
    primary.addEventListener('click', () => (record ? onPlay?.(item) : onImport?.(item)));
    const options = document.createElement('button');
    options.type = 'button';
    options.className = 'button button-ghost showcase-options';
    options.textContent = '•••';
    options.setAttribute('aria-label', `Opciones de ${item.title}`);
    options.addEventListener('click', () => onMenu?.(options, item, records.get(item.id)));
    actions.append(primary, options);

    info.append(meta, actions);
  }

  function renderDots() {
    dots.innerHTML = '';
    items.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `showcase-dot ${i === index ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Ir al juego ${i + 1}`);
      dot.addEventListener('click', () => setIndex(i));
      dots.appendChild(dot);
    });
  }

  function setIndex(next) {
    if (!items.length) return;
    index = Math.max(0, Math.min(items.length - 1, next));
    layout();
  }

  function move(delta) { setIndex(index + delta); }

  function update(newItems, newRecords) {
    items = newItems;
    records = newRecords;
    track.innerHTML = '';
    covers.length = 0;
    if (index >= items.length) index = Math.max(0, items.length - 1);

    items.forEach((item, i) => {
      const cover = coverArt(item, records.get(item.id));
      cover.addEventListener('click', () => {
        if (i === index) {
          const record = records.get(item.id);
          record ? onPlay?.(item) : onImport?.(item);
        } else {
          setIndex(i);
        }
      });
      covers.push(cover);
      track.appendChild(cover);
    });

    root.classList.toggle('is-empty', items.length === 0);
    layout();
  }

  // Navegación
  prevButton?.addEventListener('click', () => move(-1));
  nextButton?.addEventListener('click', () => move(1));

  let wheelLock = false;
  track.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) && event.deltaY === 0) return;
    event.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    move((event.deltaX || event.deltaY) > 0 ? 1 : -1);
    setTimeout(() => { wheelLock = false; }, 220);
  }, { passive: false });

  let dragStartX = null;
  track.addEventListener('pointerdown', (event) => { dragStartX = event.clientX; });
  track.addEventListener('pointerup', (event) => {
    if (dragStartX === null) return;
    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) > 48) move(delta > 0 ? -1 : 1);
    dragStartX = null;
  });

  return { update, move, setIndex, get index() { return index; } };
}
