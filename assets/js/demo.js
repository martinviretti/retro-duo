import { loadSettings } from './config.js';
import { DirectHost, connectionLabel } from './p2p.js';
import { copyText, setBusy } from './utils.js';

const canvas = document.getElementById('demo-canvas');
const ctx = canvas.getContext('2d');
const settings = loadSettings();
const waveLabel = document.getElementById('wave-label');
const fpsLabel = document.getElementById('fps-label');
const focusTip = document.getElementById('focus-tip');
const statusChip = document.getElementById('demo-status-chip');
const directStatus = document.getElementById('demo-direct-status');
const directLight = document.getElementById('demo-direct-light');
const createOfferButton = document.getElementById('demo-create-offer');
const handshake = document.getElementById('demo-handshake');
const offerArea = document.getElementById('demo-offer');
const answerArea = document.getElementById('demo-answer');
const acceptAnswerButton = document.getElementById('demo-accept-answer');
const demoLog = document.getElementById('demo-log');
const toastStack = document.getElementById('toast-stack');

const W = canvas.width;
const H = canvas.height;
const FLOOR_TOP = 230;
const FLOOR_BOTTOM = 485;
const localKeys = new Set();
const remoteKeys = new Set();
const particles = [];
const flashes = [];
let directHost = null;
let captureStream = null;
let lastTime = performance.now();
let fpsAccumulator = 0;
let fpsFrames = 0;
let gameState = 'title';
let wave = 1;
let transitionTimer = 0;
let message = '';
let messageTimer = 0;
let shake = 0;
let audioContext = null;
let masterGain = null;
let mediaDestination = null;

const players = [
  makePlayer(178, 375, '#ff3f86', '#ffd0e1', 'NOVA', 1),
  makePlayer(260, 402, '#35d9ff', '#c9f7ff', 'BYTE', 2)
];
let enemies = [];

function makePlayer(x, y, color, light, name, number) {
  return {
    kind: 'player', number, name, x, y, vx: 0, vy: 0, color, light,
    width: 36, height: 72, hp: 100, maxHp: 100, energy: 100,
    facing: 1, speed: 205, cooldown: 0, attackTimer: 0, attackType: '',
    invulnerable: 0, down: false, score: 0, combo: 0, comboTimer: 0
  };
}

function resetGame() {
  players.splice(0, players.length,
    makePlayer(178, 375, '#ff3f86', '#ffd0e1', 'NOVA', 1),
    makePlayer(260, 402, '#35d9ff', '#c9f7ff', 'BYTE', 2));
  enemies = [];
  particles.length = 0;
  flashes.length = 0;
  wave = 1;
  transitionTimer = 0;
  gameState = 'title';
  message = '';
  messageTimer = 0;
  updateWaveLabel();
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = .18;
    mediaDestination = audioContext.createMediaStreamDestination();
    masterGain.connect(audioContext.destination);
    masterGain.connect(mediaDestination);
  }
  audioContext.resume();
  focusTip.classList.add('hidden');
  canvas.focus({ preventScroll: true });
}

function sound(frequency = 220, duration = .08, type = 'square', volume = .7, slide = 0) {
  if (!audioContext || !masterGain) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function showToast(text, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.textContent = text;
  toastStack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3400);
}

function log(text, type = '') {
  const line = document.createElement('p');
  line.className = type;
  line.textContent = text;
  demoLog.prepend(line);
  while (demoLog.children.length > 6) demoLog.lastElementChild.remove();
}

function setDirectState(state) {
  const label = connectionLabel(state);
  directStatus.textContent = label;
  directLight.className = '';
  statusChip.classList.remove('connected', 'connecting', 'failed');
  statusChip.innerHTML = `<i></i> ${state === 'connected' ? 'Jugador 2 conectado' : label}`;
  if (state === 'new' || state === 'connecting') {
    directLight.classList.add('connecting');
    statusChip.classList.add('connecting');
  }
  if (state === 'connected') {
    directLight.classList.add('connected');
    statusChip.classList.add('connected');
    log('Jugador 2 conectado. El personaje celeste ya responde.', 'success');
    showToast('Jugador 2 conectado.');
  }
  if (['failed', 'disconnected', 'closed'].includes(state)) {
    directLight.classList.add('failed');
    statusChip.classList.add('failed');
    remoteKeys.clear();
    if (state === 'failed') log('La conexión falló. Generá una oferta nueva.', 'error');
  }
}

function startGame() {
  if (gameState === 'playing') return;
  if (gameState === 'gameover' || gameState === 'victory') resetGame();
  gameState = 'playing';
  wave = 1;
  players.forEach((player) => {
    player.hp = player.maxHp;
    player.energy = 100;
    player.down = false;
  });
  spawnWave();
  sound(180, .18, 'sawtooth', .6, 300);
}

function spawnWave() {
  enemies = [];
  const configurations = {
    1: [['grunt', 2]],
    2: [['grunt', 3], ['fast', 1]],
    3: [['grunt', 2], ['fast', 2], ['tank', 1]],
    4: [['fast', 3], ['tank', 2]],
    5: [['boss', 1]]
  };
  let offset = 0;
  configurations[wave].forEach(([type, count]) => {
    for (let i = 0; i < count; i += 1) {
      enemies.push(makeEnemy(type, W + 70 + offset, 285 + ((i * 63 + offset) % 175)));
      offset += 65;
    }
  });
  message = wave === 5 ? 'JEFE FINAL · VOLT' : `NIVEL ${wave}`;
  messageTimer = 1.8;
  updateWaveLabel();
}

function makeEnemy(type, x, y) {
  const stats = {
    grunt: { hp: 58, speed: 86, damage: 10, color: '#8e68ff', width: 35, height: 68, score: 150 },
    fast: { hp: 40, speed: 142, damage: 8, color: '#ffcf5b', width: 30, height: 61, score: 220 },
    tank: { hp: 125, speed: 56, damage: 18, color: '#ff6875', width: 46, height: 80, score: 350 },
    boss: { hp: 640, speed: 74, damage: 22, color: '#ff4b5f', width: 68, height: 108, score: 2500 }
  }[type];
  return {
    kind: 'enemy', type, x, y, vx: 0, vy: 0, facing: -1,
    width: stats.width, height: stats.height, color: stats.color,
    hp: stats.hp, maxHp: stats.hp, speed: stats.speed, damage: stats.damage,
    score: stats.score, cooldown: .5 + Math.random(), attackTimer: 0,
    hitFlash: 0, invulnerable: 0, dead: false, phase: 1,
    abilityCooldown: type === 'boss' ? 2.8 : 0, chargeTimer: 0
  };
}

function updateWaveLabel() {
  waveLabel.textContent = `Nivel ${wave}/5`;
}

function playerControlSet(player) {
  if (player.number === 1) {
    return {
      up: localKeys.has('ArrowUp'), down: localKeys.has('ArrowDown'),
      left: localKeys.has('ArrowLeft'), right: localKeys.has('ArrowRight')
    };
  }
  return {
    up: localKeys.has('w') || remoteKeys.has('up'),
    down: localKeys.has('s') || remoteKeys.has('down'),
    left: localKeys.has('a') || remoteKeys.has('left'),
    right: localKeys.has('d') || remoteKeys.has('right')
  };
}

function updatePlayers(dt) {
  players.forEach((player) => {
    if (player.down) return;
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.attackTimer = Math.max(0, player.attackTimer - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    if (player.comboTimer === 0) player.combo = 0;
    player.energy = Math.min(100, player.energy + dt * 6);

    const controls = playerControlSet(player);
    let dx = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    let dy = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const speedScale = player.attackTimer > 0 ? .28 : 1;
    player.vx = dx * player.speed * speedScale;
    player.vy = dy * player.speed * .66 * speedScale;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 35, W - 35);
    player.y = clamp(player.y, FLOOR_TOP + 35, FLOOR_BOTTOM);
    if (dx) player.facing = Math.sign(dx);
  });
}

function triggerPlayerAttack(player, type) {
  if (gameState !== 'playing' || player.down || player.cooldown > 0) return;
  ensureAudio();
  const attack = {
    punch: { cooldown: .25, duration: .16, range: 64, damage: 20, knock: 18, energy: 0 },
    kick: { cooldown: .48, duration: .25, range: 85, damage: 31, knock: 36, energy: 0 },
    special: { cooldown: 1.05, duration: .55, range: 145, damage: 48, knock: 65, energy: 48 }
  }[type];
  if (player.energy < attack.energy) {
    sound(90, .07, 'square', .3);
    return;
  }
  player.energy -= attack.energy;
  player.cooldown = attack.cooldown;
  player.attackTimer = attack.duration;
  player.attackType = type;
  sound(type === 'punch' ? 190 : type === 'kick' ? 130 : 390, type === 'special' ? .22 : .07, type === 'special' ? 'sawtooth' : 'square', .65, type === 'special' ? -250 : 70);

  let hitCount = 0;
  enemies.forEach((enemy) => {
    if (enemy.dead) return;
    const dx = enemy.x - player.x;
    const dy = Math.abs(enemy.y - player.y);
    const inFront = type === 'special' || Math.sign(dx || player.facing) === player.facing;
    if (Math.abs(dx) <= attack.range && dy <= (type === 'special' ? 92 : 48) && inFront) {
      damageEnemy(enemy, attack.damage, player, attack.knock * player.facing);
      hitCount += 1;
    }
  });
  if (hitCount && type === 'special') {
    flashes.push({ x: player.x, y: player.y - 30, radius: 20, max: 160, life: .35, color: player.color });
    shake = 8;
  }
}

function damageEnemy(enemy, amount, player, knockback) {
  if (enemy.invulnerable > 0 || enemy.dead) return;
  enemy.hp -= amount;
  enemy.hitFlash = .12;
  enemy.invulnerable = .06;
  enemy.x += knockback;
  player.combo += 1;
  player.comboTimer = 1.25;
  createHitParticles(enemy.x, enemy.y - enemy.height * .55, player.color, Math.min(12, 5 + player.combo));
  sound(105 + Math.random() * 35, .05, 'square', .45, -50);
  if (enemy.hp <= 0) {
    enemy.dead = true;
    player.score += enemy.score;
    createHitParticles(enemy.x, enemy.y - 40, '#ffffff', 18);
    sound(enemy.type === 'boss' ? 70 : 90, enemy.type === 'boss' ? .5 : .14, 'sawtooth', .7, -40);
  }
}

function damagePlayer(player, amount, source) {
  if (player.invulnerable > 0 || player.down) return;
  player.hp -= amount;
  player.invulnerable = .75;
  player.x += source.facing * 25;
  shake = Math.max(shake, 4);
  createHitParticles(player.x, player.y - 45, '#ffefef', 8);
  sound(82, .13, 'sawtooth', .55, -35);
  if (player.hp <= 0) {
    player.hp = 0;
    player.down = true;
  }
}

function updateEnemies(dt) {
  enemies.forEach((enemy) => {
    if (enemy.dead) return;
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.invulnerable = Math.max(0, enemy.invulnerable - dt);
    enemy.abilityCooldown = Math.max(0, enemy.abilityCooldown - dt);

    const livingPlayers = players.filter((player) => !player.down);
    if (!livingPlayers.length) return;
    const target = livingPlayers.sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    enemy.facing = Math.sign(dx || enemy.facing);

    if (enemy.type === 'boss') updateBoss(enemy, target, dt, dx, dy);
    else if (Math.abs(dx) > 58 || Math.abs(dy) > 36) {
      const length = Math.hypot(dx, dy) || 1;
      enemy.x += (dx / length) * enemy.speed * dt;
      enemy.y += (dy / length) * enemy.speed * .68 * dt;
    } else if (enemy.cooldown <= 0) {
      enemy.cooldown = enemy.type === 'fast' ? .8 : enemy.type === 'tank' ? 1.35 : 1.05;
      enemy.attackTimer = .22;
      setTimeout(() => {
        if (!enemy.dead && distance(enemy, target) < 85) damagePlayer(target, enemy.damage, enemy);
      }, 100);
    }
    enemy.y = clamp(enemy.y, FLOOR_TOP + 35, FLOOR_BOTTOM);
  });

  enemies = enemies.filter((enemy) => !enemy.dead || enemy.hitFlash > -1);
  const allDead = enemies.length > 0 && enemies.every((enemy) => enemy.dead);
  if (allDead && transitionTimer <= 0) transitionTimer = 1.5;
}

function updateBoss(enemy, target, dt, dx, dy) {
  const hpRatio = enemy.hp / enemy.maxHp;
  enemy.phase = hpRatio > .66 ? 1 : hpRatio > .33 ? 2 : 3;
  if (enemy.chargeTimer > 0) {
    enemy.chargeTimer -= dt;
    enemy.x += enemy.facing * (300 + enemy.phase * 55) * dt;
    players.forEach((player) => {
      if (!player.down && distance(enemy, player) < 75) damagePlayer(player, enemy.damage + 7, enemy);
    });
    return;
  }

  if (enemy.abilityCooldown <= 0) {
    if (enemy.phase === 1) {
      enemy.chargeTimer = .75;
      enemy.abilityCooldown = 3.2;
      message = 'VOLT: CARGA';
      messageTimer = .75;
      sound(62, .32, 'sawtooth', .65, 260);
    } else if (enemy.phase === 2) {
      enemy.abilityCooldown = 3.4;
      flashes.push({ x: enemy.x, y: enemy.y - 30, radius: 20, max: 250, life: .55, color: '#ffcf5b', harmful: true });
      setTimeout(() => {
        players.forEach((player) => {
          if (!player.down && distance(enemy, player) < 235) damagePlayer(player, 24, enemy);
        });
        shake = 10;
        sound(78, .35, 'sawtooth', .8, -35);
      }, 260);
      message = 'VOLT: ONDA DE CHOQUE';
      messageTimer = .9;
    } else {
      enemy.abilityCooldown = 4.1;
      enemies.push(makeEnemy('fast', W - 75, 300 + Math.random() * 160));
      enemies.push(makeEnemy('grunt', W - 110, 300 + Math.random() * 160));
      message = 'VOLT: REFUERZOS';
      messageTimer = .9;
      sound(280, .25, 'square', .55, 120);
    }
    return;
  }

  if (Math.abs(dx) > 82 || Math.abs(dy) > 45) {
    const length = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / length) * enemy.speed * dt;
    enemy.y += (dy / length) * enemy.speed * .65 * dt;
  } else if (enemy.cooldown <= 0) {
    enemy.cooldown = .9;
    enemy.attackTimer = .25;
    setTimeout(() => {
      if (!enemy.dead && distance(enemy, target) < 105) damagePlayer(target, enemy.damage, enemy);
    }, 110);
  }
}

function updateTransitions(dt) {
  if (transitionTimer > 0) {
    transitionTimer -= dt;
    if (transitionTimer <= 0) {
      if (wave >= 5) {
        gameState = 'victory';
        message = 'DISTRITO LIBERADO';
        messageTimer = 999;
        sound(220, .65, 'square', .55, 440);
      } else {
        wave += 1;
        players.forEach((player) => {
          player.hp = Math.min(player.maxHp, player.hp + 24);
          player.energy = Math.min(100, player.energy + 40);
          if (player.down) {
            player.down = false;
            player.hp = 40;
          }
        });
        spawnWave();
      }
    }
  }
  if (messageTimer > 0) messageTimer -= dt;
  if (players.every((player) => player.down) && gameState === 'playing') {
    gameState = 'gameover';
    message = 'FIN DE LA PARTIDA';
    messageTimer = 999;
  }
}

function createHitParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x, y,
      vx: (Math.random() - .5) * 260,
      vy: (Math.random() - .8) * 220,
      life: .25 + Math.random() * .35,
      size: 2 + Math.random() * 5,
      color
    });
  }
}

function updateEffects(dt) {
  particles.forEach((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 480 * dt;
  });
  for (let i = particles.length - 1; i >= 0; i -= 1) if (particles[i].life <= 0) particles.splice(i, 1);
  flashes.forEach((flash) => {
    flash.life -= dt;
    flash.radius += (flash.max - flash.radius) * Math.min(1, dt * 8);
  });
  for (let i = flashes.length - 1; i >= 0; i -= 1) if (flashes[i].life <= 0) flashes.splice(i, 1);
  shake = Math.max(0, shake - dt * 24);
}

function update(dt) {
  if (gameState === 'playing') {
    updatePlayers(dt);
    updateEnemies(dt);
    updateTransitions(dt);
  }
  updateEffects(dt);
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawBackground();
  drawHud();

  const actors = [...players, ...enemies.filter((enemy) => !enemy.dead)].sort((a, b) => a.y - b.y);
  actors.forEach((actor) => actor.kind === 'player' ? drawPlayer(actor) : drawEnemy(actor));
  drawEffects();
  drawOverlay();
  ctx.restore();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#080a1b');
  gradient.addColorStop(.58, '#15132c');
  gradient.addColorStop(1, '#07101a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#f04c9c';
  ctx.beginPath();
  ctx.arc(785, 94, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(8,10,27,.22)';
  ctx.fillRect(730, 86, 110, 8);
  ctx.fillRect(738, 106, 94, 6);

  const buildings = [
    [0, 95, 120, 160], [96, 62, 115, 193], [188, 110, 130, 145], [292, 42, 118, 213],
    [390, 88, 125, 167], [500, 25, 98, 230], [582, 103, 160, 152], [718, 66, 110, 189], [810, 112, 150, 143]
  ];
  buildings.forEach(([x, y, w, h], index) => {
    ctx.fillStyle = index % 2 ? '#0d1022' : '#10142a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = index % 3 ? 'rgba(53,217,255,.22)' : 'rgba(255,63,134,.24)';
    for (let wx = x + 14; wx < x + w - 10; wx += 25) {
      for (let wy = y + 16; wy < y + h - 10; wy += 27) {
        if ((wx + wy + index) % 4) ctx.fillRect(wx, wy, 8, 11);
      }
    }
  });

  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(0, 244, W, 296);
  const floor = ctx.createLinearGradient(0, 244, 0, 540);
  floor.addColorStop(0, '#202036');
  floor.addColorStop(1, '#101522');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 255, W, 285);
  ctx.strokeStyle = 'rgba(53,217,255,.08)';
  ctx.lineWidth = 1;
  for (let y = 285; y < 540; y += 38) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let x = -100; x < W + 100; x += 100) {
    ctx.beginPath(); ctx.moveTo(W / 2, 255); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.fillStyle = '#090b13';
  ctx.fillRect(0, 238, W, 19);
  ctx.fillStyle = '#35d9ff';
  ctx.fillRect(50, 246, 160, 3);
  ctx.fillStyle = '#ff3f86';
  ctx.fillRect(740, 246, 170, 3);

  ctx.fillStyle = 'rgba(255,255,255,.025)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

function drawHud() {
  players.forEach((player, index) => {
    const x = index === 0 ? 25 : 615;
    ctx.fillStyle = 'rgba(3,4,10,.76)';
    roundRect(x, 18, 320, 67, 12, true);
    ctx.fillStyle = player.color;
    ctx.font = '800 13px system-ui';
    ctx.fillText(`P${player.number} · ${player.name}`, x + 15, 39);
    ctx.fillStyle = '#262b3b';
    roundRect(x + 15, 49, 235, 9, 5, true);
    ctx.fillStyle = player.hp > 28 ? player.color : '#ff6875';
    roundRect(x + 15, 49, 235 * (player.hp / player.maxHp), 9, 5, true);
    ctx.fillStyle = '#262b3b';
    roundRect(x + 15, 64, 190, 5, 3, true);
    ctx.fillStyle = '#ffcf5b';
    roundRect(x + 15, 64, 190 * (player.energy / 100), 5, 3, true);
    ctx.fillStyle = '#9299aa';
    ctx.font = '650 10px system-ui';
    ctx.fillText(String(player.score).padStart(6, '0'), x + 260, 57);
    if (player.combo > 1 && player.comboTimer > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '900 13px system-ui';
      ctx.fillText(`${player.combo} HIT`, x + 260, 74);
    }
  });

  const boss = enemies.find((enemy) => enemy.type === 'boss' && !enemy.dead);
  if (boss) {
    ctx.fillStyle = 'rgba(3,4,10,.82)';
    roundRect(265, 94, 430, 34, 10, true);
    ctx.fillStyle = '#ff6875';
    ctx.font = '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`VOLT · FASE ${boss.phase}`, 480, 107);
    ctx.fillStyle = '#2b2f3d';
    roundRect(290, 114, 380, 7, 4, true);
    ctx.fillStyle = '#ff4b5f';
    roundRect(290, 114, 380 * (boss.hp / boss.maxHp), 7, 4, true);
    ctx.textAlign = 'left';
  }
}

function drawPlayer(player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(player.facing, 1);
  if (player.invulnerable > 0 && Math.floor(player.invulnerable * 16) % 2) ctx.globalAlpha = .35;
  if (player.down) ctx.rotate(Math.PI / 2);

  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 3, 27, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#141728';
  roundRect(-13, -31, 25, 36, 6, true);
  ctx.fillStyle = player.color;
  roundRect(-17, -60, 34, 33, 7, true);
  ctx.fillStyle = player.light;
  ctx.beginPath(); ctx.arc(0, -70, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#171a25';
  ctx.fillRect(-12, -75, 24, 8);
  ctx.fillStyle = player.color;
  ctx.fillRect(player.facing > 0 ? 4 : -13, -72, 9, 3);
  ctx.fillStyle = '#10131e';
  ctx.fillRect(-14, 4, 9, 24);
  ctx.fillRect(5, 4, 9, 24);

  let armReach = 0;
  if (player.attackTimer > 0) armReach = player.attackType === 'kick' ? 40 : player.attackType === 'special' ? 30 : 28;
  ctx.strokeStyle = player.light;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(14, -48); ctx.lineTo(24 + armReach, -42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-14, -47); ctx.lineTo(-24, -36); ctx.stroke();
  if (player.attackType === 'kick' && player.attackTimer > 0) {
    ctx.strokeStyle = '#10131e'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(9, 2); ctx.lineTo(46, -3); ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.scale(enemy.facing, 1);
  if (enemy.hitFlash > 0) ctx.filter = 'brightness(2.3)';
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(0, 4, enemy.width * .68, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#161925';
  roundRect(-enemy.width * .28, -enemy.height * .46, enemy.width * .56, enemy.height * .5, 6, true);
  ctx.fillStyle = enemy.color;
  roundRect(-enemy.width / 2, -enemy.height * .83, enemy.width, enemy.height * .45, 7, true);
  ctx.fillStyle = enemy.type === 'boss' ? '#ffe3dc' : '#d7d9e3';
  ctx.beginPath(); ctx.arc(0, -enemy.height * .91, enemy.width * .27, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#10131c';
  ctx.fillRect(-enemy.width * .23, -enemy.height * .96, enemy.width * .46, 7);
  ctx.fillStyle = enemy.color;
  ctx.fillRect(enemy.width * .08, -enemy.height * .94, enemy.width * .18, 3);
  ctx.fillStyle = '#10131c';
  ctx.fillRect(-enemy.width * .33, 0, enemy.width * .23, enemy.height * .3);
  ctx.fillRect(enemy.width * .1, 0, enemy.width * .23, enemy.height * .3);
  ctx.strokeStyle = enemy.color;
  ctx.lineWidth = enemy.type === 'boss' ? 14 : 9;
  ctx.lineCap = 'round';
  const attackReach = enemy.attackTimer > 0 ? 32 : 8;
  ctx.beginPath(); ctx.moveTo(enemy.width * .35, -enemy.height * .63); ctx.lineTo(enemy.width * .45 + attackReach, -enemy.height * .52); ctx.stroke();

  if (enemy.type !== 'boss') {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    roundRect(-enemy.width / 2, -enemy.height - 18, enemy.width, 5, 3, true);
    ctx.fillStyle = enemy.color;
    roundRect(-enemy.width / 2, -enemy.height - 18, enemy.width * Math.max(0, enemy.hp / enemy.maxHp), 5, 3, true);
  }
  ctx.restore();
}

function drawEffects() {
  particles.forEach((particle) => {
    ctx.globalAlpha = Math.min(1, particle.life * 4);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
  flashes.forEach((flash) => {
    ctx.globalAlpha = Math.min(.8, flash.life * 2);
    ctx.strokeStyle = flash.color;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(flash.x, flash.y, flash.radius, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawOverlay() {
  if (gameState === 'title') {
    ctx.fillStyle = 'rgba(3,4,10,.58)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3f86';
    ctx.font = '900 17px system-ui';
    ctx.fillText('RETRO DUO ORIGINAL', W / 2, 157);
    ctx.fillStyle = '#fff';
    ctx.font = '900 54px system-ui';
    ctx.fillText('NEON BRAWL', W / 2, 220);
    ctx.fillStyle = '#35d9ff';
    ctx.font = '800 18px system-ui';
    ctx.fillText('DISTRITO 88', W / 2, 252);
    ctx.fillStyle = '#d9dce7';
    ctx.font = '700 15px system-ui';
    ctx.fillText('ENTER / START PARA JUGAR', W / 2, 324);
    ctx.fillStyle = '#9299aa';
    ctx.font = '500 12px system-ui';
    ctx.fillText('Derrotá cinco niveles y descubrí las habilidades del jefe final', W / 2, 352);
    ctx.textAlign = 'left';
  } else if (gameState === 'gameover' || gameState === 'victory') {
    ctx.fillStyle = 'rgba(3,4,10,.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = gameState === 'victory' ? '#4de4a8' : '#ff6875';
    ctx.font = '900 44px system-ui';
    ctx.fillText(gameState === 'victory' ? 'DISTRITO LIBERADO' : 'FIN DE LA PARTIDA', W / 2, 235);
    ctx.fillStyle = '#d9dce7';
    ctx.font = '700 15px system-ui';
    ctx.fillText('ENTER / START PARA REINICIAR', W / 2, 284);
    ctx.fillStyle = '#9299aa';
    ctx.font = '600 13px system-ui';
    ctx.fillText(`Puntaje total: ${players.reduce((sum, player) => sum + player.score, 0)}`, W / 2, 318);
    ctx.textAlign = 'left';
  }

  if (messageTimer > 0 && gameState === 'playing') {
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, messageTimer * 2);
    ctx.fillStyle = 'rgba(3,4,10,.72)';
    roundRect(290, 160, 380, 54, 12, true);
    ctx.fillStyle = '#fff';
    ctx.font = '900 20px system-ui';
    ctx.fillText(message, W / 2, 194);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

function roundRect(x, y, width, height, radius, fill = false) {
  if (width <= 0 || height <= 0) return;
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) * 1.25); }

function loop(now) {
  const dt = Math.min(.033, (now - lastTime) / 1000);
  lastTime = now;
  fpsAccumulator += dt;
  fpsFrames += 1;
  if (fpsAccumulator >= .5) {
    fpsLabel.textContent = `${Math.round(fpsFrames / fpsAccumulator)} FPS`;
    fpsAccumulator = 0;
    fpsFrames = 0;
  }
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function keyAction(key, pressed) {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  if (pressed) localKeys.add(normalized); else localKeys.delete(normalized);
  if (!pressed) return;
  if (normalized === 'Enter' || normalized === ' ') startGame();
  if (normalized === 'z') triggerPlayerAttack(players[0], 'punch');
  if (normalized === 'x') triggerPlayerAttack(players[0], 'kick');
  if (normalized === 'c') triggerPlayerAttack(players[0], 'special');
  if (normalized === 'f') triggerPlayerAttack(players[1], 'punch');
  if (normalized === 'g') triggerPlayerAttack(players[1], 'kick');
  if (normalized === 'h') triggerPlayerAttack(players[1], 'special');
}

function remoteInput(index, value) {
  const map = { 4: 'up', 5: 'down', 6: 'left', 7: 'right' };
  if (map[index]) {
    if (value) remoteKeys.add(map[index]); else remoteKeys.delete(map[index]);
    return;
  }
  if (!value) return;
  if (index === 3) startGame();
  if (index === 8) triggerPlayerAttack(players[1], 'punch');
  if (index === 0) triggerPlayerAttack(players[1], 'kick');
  if (index === 9) triggerPlayerAttack(players[1], 'special');
}

function handleRemoteMessage(data) {
  if (data?.type === 'input') remoteInput(Number(data.index), Number(data.value));
  if (data?.type === 'release-all') remoteKeys.clear();
  if (data?.type === 'hello') log('La pantalla remota confirmó los controles.', 'success');
  if (data?.type === 'ping') directHost?.send({ type: 'pong', at: data.at });
}

function makeDemoStream() {
  ensureAudio();
  const stream = canvas.captureStream(60);
  const audioTrack = mediaDestination?.stream?.getAudioTracks?.()[0];
  if (audioTrack) stream.addTrack(audioTrack);
  return stream;
}

async function createOffer() {
  try {
    setBusy(createOfferButton, true, 'Generando oferta…');
    directHost?.close();
    captureStream?.getVideoTracks().forEach((track) => track.stop());
    captureStream = makeDemoStream();
    directHost = new DirectHost({
      iceServers: settings.iceServers,
      onState: setDirectState,
      onMessage: handleRemoteMessage
    });
    setDirectState('connecting');
    const offer = await directHost.createOffer(captureStream);
    offerArea.value = offer;
    answerArea.value = '';
    handshake.hidden = false;
    setDirectState('new');
    log('Oferta creada. Enviásela al jugador 2.');
    showToast('Oferta copiable creada.');
  } catch (error) {
    console.error(error);
    setDirectState('failed');
    log(error.message || 'No se pudo crear la conexión.', 'error');
    showToast(error.message || 'No se pudo crear la conexión.', 'error');
  } finally {
    setBusy(createOfferButton, false);
  }
}

async function acceptAnswer() {
  try {
    if (!answerArea.value.trim()) throw new Error('Pegá la respuesta del jugador 2.');
    setBusy(acceptAnswerButton, true, 'Conectando…');
    await directHost?.acceptAnswer(answerArea.value);
    setDirectState('connecting');
    log('Respuesta aceptada. Esperando el enlace P2P…');
  } catch (error) {
    console.error(error);
    log(error.message || 'Respuesta inválida.', 'error');
    showToast(error.message || 'Respuesta inválida.', 'error');
  } finally {
    setBusy(acceptAnswerButton, false);
  }
}

canvas.addEventListener('pointerdown', ensureAudio);
document.addEventListener('keydown', (event) => {
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(event.target.tagName)) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) event.preventDefault();
  ensureAudio();
  if (!event.repeat) keyAction(event.key, true);
});
document.addEventListener('keyup', (event) => {
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(event.target.tagName)) return;
  keyAction(event.key, false);
});
window.addEventListener('blur', () => localKeys.clear());

document.getElementById('restart-game').addEventListener('click', () => {
  ensureAudio();
  resetGame();
  startGame();
});
document.getElementById('demo-fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.getElementById('demo-canvas-wrap').requestFullscreen();
  } catch {
    showToast('No se pudo activar pantalla completa.', 'error');
  }
});
createOfferButton.addEventListener('click', createOffer);
acceptAnswerButton.addEventListener('click', acceptAnswer);
document.getElementById('demo-copy-offer').addEventListener('click', async () => {
  try {
    await copyText(offerArea.value);
    showToast('Oferta copiada.');
  } catch (error) {
    showToast(error.message || 'No se pudo copiar.', 'error');
  }
});
window.addEventListener('pagehide', () => {
  directHost?.close();
  captureStream?.getTracks().forEach((track) => track.stop());
});

resetGame();
requestAnimationFrame(loop);
