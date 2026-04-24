const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

const width = canvas.width;
const height = canvas.height;
const cellSize = 3;
const cols = Math.floor(width / cellSize);
const rows = Math.floor(height / cellSize);
const count = cols * rows;

let uPrev = new Float32Array(count);
let uCurr = new Float32Array(count);
let uNext = new Float32Array(count);
let obstacle = new Uint8Array(count);

const state = {
  running: true,
  drawObstacle: false,
  eraseObstacle: false,
  sourceOn: false,
  substeps: 2,
  damping: 0.997,
  speed: 0.35,
  impulse: 1.6,
  sourceFreq: 3.5,
  brushSize: 4,
  time: 0,
};

const controls = {
  substeps: byId('substeps'),
  damping: byId('damping'),
  speed: byId('speed'),
  impulse: byId('impulse'),
  sourceFreq: byId('sourceFreq'),
  brushSize: byId('brushSize'),
  substepsValue: byId('substepsValue'),
  dampingValue: byId('dampingValue'),
  speedValue: byId('speedValue'),
  impulseValue: byId('impulseValue'),
  sourceFreqValue: byId('sourceFreqValue'),
  brushSizeValue: byId('brushSizeValue'),
  pauseBtn: byId('pauseBtn'),
  stepBtn: byId('stepBtn'),
  clearWaveBtn: byId('clearWaveBtn'),
  toggleSourceBtn: byId('toggleSourceBtn'),
  addPulseBtn: byId('addPulseBtn'),
  drawObstacleBtn: byId('drawObstacleBtn'),
  eraseObstacleBtn: byId('eraseObstacleBtn'),
  clearObstacleBtn: byId('clearObstacleBtn'),
};

bindRange(controls.substeps, controls.substepsValue, (v) => (state.substeps = Number(v)));
bindRange(controls.damping, controls.dampingValue, (v) => (state.damping = Number(v)));
bindRange(controls.speed, controls.speedValue, (v) => (state.speed = Number(v)));
bindRange(controls.impulse, controls.impulseValue, (v) => (state.impulse = Number(v)));
bindRange(controls.sourceFreq, controls.sourceFreqValue, (v) => (state.sourceFreq = Number(v)));
bindRange(controls.brushSize, controls.brushSizeValue, (v) => (state.brushSize = Number(v)));

controls.pauseBtn.addEventListener('click', () => {
  state.running = !state.running;
  controls.pauseBtn.textContent = state.running ? '일시정지' : '재생';
});

controls.stepBtn.addEventListener('click', () => {
  stepWave(1 / 60);
  draw();
});

controls.clearWaveBtn.addEventListener('click', clearWave);
controls.addPulseBtn.addEventListener('click', () => addImpulse(cols / 2, rows / 2, state.impulse));

controls.toggleSourceBtn.addEventListener('click', () => {
  state.sourceOn = !state.sourceOn;
  toggleBtn(controls.toggleSourceBtn, state.sourceOn, `진동 소스: ${state.sourceOn ? 'ON' : 'OFF'}`);
});

controls.drawObstacleBtn.addEventListener('click', () => {
  state.drawObstacle = !state.drawObstacle;
  if (state.drawObstacle) state.eraseObstacle = false;
  refreshModeButtons();
});

controls.eraseObstacleBtn.addEventListener('click', () => {
  state.eraseObstacle = !state.eraseObstacle;
  if (state.eraseObstacle) state.drawObstacle = true;
  refreshModeButtons();
});

controls.clearObstacleBtn.addEventListener('click', () => {
  obstacle.fill(0);
  draw();
});

function refreshModeButtons() {
  toggleBtn(controls.drawObstacleBtn, state.drawObstacle, `장애물 그리기: ${state.drawObstacle ? 'ON' : 'OFF'}`);
  toggleBtn(controls.eraseObstacleBtn, state.eraseObstacle, `지우기 모드: ${state.eraseObstacle ? 'ON' : 'OFF'}`);
}

let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  handleCanvasPointer(e);
});
window.addEventListener('pointerup', () => (dragging = false));
canvas.addEventListener('pointermove', (e) => {
  if (dragging) handleCanvasPointer(e);
});

function handleCanvasPointer(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * width;
  const y = ((e.clientY - rect.top) / rect.height) * height;
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);

  if (!inside(cx, cy)) return;

  if (state.drawObstacle) {
    paintObstacle(cx, cy, state.brushSize, !state.eraseObstacle);
  } else {
    addImpulse(cx, cy, state.impulse);
  }
}

function paintObstacle(cx, cy, radius, value) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!inside(x, y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        obstacle[idx(x, y)] = value ? 1 : 0;
        if (value) {
          uCurr[idx(x, y)] = 0;
          uPrev[idx(x, y)] = 0;
        }
      }
    }
  }
  draw();
}

function clearWave() {
  uPrev.fill(0);
  uCurr.fill(0);
  uNext.fill(0);
  draw();
}

function addImpulse(cx, cy, amount) {
  const spread = 5;
  for (let y = cy - spread; y <= cy + spread; y++) {
    for (let x = cx - spread; x <= cx + spread; x++) {
      if (!inside(x, y) || obstacle[idx(x, y)]) continue;
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const gaussian = Math.exp(-d2 / (2 * spread));
      uCurr[idx(x, y)] += amount * gaussian;
    }
  }
}

function stepWave(dt) {
  const c2 = state.speed * state.speed;

  if (state.sourceOn) {
    const sx = Math.floor(cols * 0.2);
    const sy = Math.floor(rows * 0.5);
    const oscillation = Math.sin(2 * Math.PI * state.sourceFreq * state.time) * state.impulse;
    addImpulse(sx, sy, oscillation * 0.5);
  }

  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = idx(x, y);
      if (obstacle[i]) {
        uNext[i] = 0;
        continue;
      }

      const laplacian =
        uCurr[idx(x + 1, y)] +
        uCurr[idx(x - 1, y)] +
        uCurr[idx(x, y + 1)] +
        uCurr[idx(x, y - 1)] -
        4 * uCurr[i];

      const next = 2 * uCurr[i] - uPrev[i] + c2 * laplacian;
      uNext[i] = next * state.damping;
    }
  }

  for (let x = 0; x < cols; x++) {
    uNext[idx(x, 0)] = 0;
    uNext[idx(x, rows - 1)] = 0;
  }
  for (let y = 0; y < rows; y++) {
    uNext[idx(0, y)] = 0;
    uNext[idx(cols - 1, y)] = 0;
  }

  [uPrev, uCurr, uNext] = [uCurr, uNext, uPrev];
  state.time += dt;
}

function draw() {
  const image = ctx.createImageData(cols, rows);

  for (let i = 0; i < count; i++) {
    const v = uCurr[i];
    const base = i * 4;

    if (obstacle[i]) {
      image.data[base] = 220;
      image.data[base + 1] = 220;
      image.data[base + 2] = 220;
      image.data[base + 3] = 255;
      continue;
    }

    const positive = Math.max(v, 0);
    const negative = Math.max(-v, 0);
    image.data[base] = clamp(40 + positive * 240);
    image.data[base + 1] = clamp(20 + (positive + negative) * 110);
    image.data[base + 2] = clamp(40 + negative * 255);
    image.data[base + 3] = 255;
  }

  const bitmap = new ImageData(image.data, cols, rows);
  const offscreen = document.createElement('canvas');
  offscreen.width = cols;
  offscreen.height = rows;
  offscreen.getContext('2d').putImageData(bitmap, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(offscreen, 0, 0, width, height);
}

function animate() {
  if (state.running) {
    const dt = 1 / 60;
    for (let i = 0; i < state.substeps; i++) stepWave(dt / state.substeps);
    draw();
  }

  requestAnimationFrame(animate);
}

function bindRange(inputEl, outputEl, onValue) {
  const update = () => {
    outputEl.textContent = inputEl.value;
    onValue(inputEl.value);
  };
  inputEl.addEventListener('input', update);
  update();
}

function toggleBtn(btn, active, label) {
  btn.classList.toggle('active', active);
  btn.textContent = label;
}

function byId(id) {
  return document.getElementById(id);
}

function idx(x, y) {
  return y * cols + x;
}

function inside(x, y) {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

function clamp(v) {
  return Math.max(0, Math.min(255, v | 0));
}

refreshModeButtons();
draw();
animate();
