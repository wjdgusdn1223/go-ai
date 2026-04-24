const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d', { alpha: false });

const controls = {
  resolution: document.getElementById('resolution'),
  applyResolution: document.getElementById('apply-resolution'),
  sourceMode: document.getElementById('source-mode'),
  amplitude: document.getElementById('amplitude'),
  frequency: document.getElementById('frequency'),
  speed: document.getElementById('speed'),
  damping: document.getElementById('damping'),
  timeScale: document.getElementById('time-scale'),
  brushSize: document.getElementById('brush-size'),
  tool: document.getElementById('tool'),
  toggle: document.getElementById('toggle'),
  clearWave: document.getElementById('clear-wave'),
  clearObstacles: document.getElementById('clear-obstacles'),
  ampVal: document.getElementById('amp-val'),
  freqVal: document.getElementById('freq-val'),
  speedVal: document.getElementById('speed-val'),
  dampVal: document.getElementById('damp-val'),
  timeVal: document.getElementById('time-val'),
  brushVal: document.getElementById('brush-val')
};

const sim = {
  n: Number(controls.resolution.value),
  curr: null,
  prev: null,
  next: null,
  obstacle: null,
  running: true,
  mouseDown: false,
  activeSource: null,
  time: 0
};

function idx(x, y) {
  return y * sim.n + x;
}

function allocate() {
  const size = sim.n * sim.n;
  sim.curr = new Float32Array(size);
  sim.prev = new Float32Array(size);
  sim.next = new Float32Array(size);
  sim.obstacle = new Uint8Array(size);
  canvas.width = sim.n;
  canvas.height = sim.n;
}

function setValueText() {
  controls.ampVal.textContent = Number(controls.amplitude.value).toFixed(2);
  controls.freqVal.textContent = Number(controls.frequency.value).toFixed(1);
  controls.speedVal.textContent = Number(controls.speed.value).toFixed(2);
  controls.dampVal.textContent = Number(controls.damping.value).toFixed(4);
  controls.timeVal.textContent = Number(controls.timeScale.value).toFixed(1);
  controls.brushVal.textContent = String(Number(controls.brushSize.value));
}

function clearWave() {
  sim.curr.fill(0);
  sim.prev.fill(0);
  sim.next.fill(0);
  sim.activeSource = null;
}

function clearObstacles() {
  sim.obstacle.fill(0);
}

function applyBrush(mx, my) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((mx - rect.left) / rect.width) * sim.n);
  const y = Math.floor(((my - rect.top) / rect.height) * sim.n);
  const radius = Number(controls.brushSize.value);
  const tool = controls.tool.value;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || nx >= sim.n - 1 || ny < 1 || ny >= sim.n - 1) continue;
      const i = idx(nx, ny);

      if (tool === 'obstacle-draw') {
        sim.obstacle[i] = 1;
        sim.curr[i] = 0;
        sim.prev[i] = 0;
      } else if (tool === 'obstacle-erase') {
        sim.obstacle[i] = 0;
      } else if (tool === 'wave') {
        if (controls.sourceMode.value === 'pulse') {
          sim.curr[i] += Number(controls.amplitude.value);
        } else {
          sim.activeSource = { x: nx, y: ny };
        }
      }
    }
  }
}

function step(dt) {
  const c = Number(controls.speed.value);
  const damping = Number(controls.damping.value);
  const lambda = c * c * dt * dt;

  if (sim.activeSource && controls.sourceMode.value === 'continuous') {
    const srcI = idx(sim.activeSource.x, sim.activeSource.y);
    const amp = Number(controls.amplitude.value);
    const freq = Number(controls.frequency.value);
    sim.curr[srcI] += amp * Math.sin(2 * Math.PI * freq * sim.time) * dt * 18;
  }

  for (let y = 1; y < sim.n - 1; y += 1) {
    for (let x = 1; x < sim.n - 1; x += 1) {
      const i = idx(x, y);
      if (sim.obstacle[i]) {
        sim.next[i] = 0;
        continue;
      }

      const lap =
        sim.curr[idx(x + 1, y)] +
        sim.curr[idx(x - 1, y)] +
        sim.curr[idx(x, y + 1)] +
        sim.curr[idx(x, y - 1)] -
        4 * sim.curr[i];

      sim.next[i] = 2 * sim.curr[i] - sim.prev[i] + lambda * lap - damping * (sim.curr[i] - sim.prev[i]);
    }
  }

  [sim.prev, sim.curr, sim.next] = [sim.curr, sim.next, sim.prev];
}

function render() {
  const image = ctx.createImageData(sim.n, sim.n);
  const data = image.data;

  for (let i = 0; i < sim.curr.length; i += 1) {
    const base = i * 4;

    if (sim.obstacle[i]) {
      data[base] = 30;
      data[base + 1] = 30;
      data[base + 2] = 30;
      data[base + 3] = 255;
      continue;
    }

    const v = Math.max(-1, Math.min(1, sim.curr[i]));
    const positive = Math.max(0, v);
    const negative = Math.max(0, -v);

    data[base] = Math.floor(negative * 255 + 10);
    data[base + 1] = Math.floor((1 - Math.abs(v)) * 60 + 10);
    data[base + 2] = Math.floor(positive * 255 + 25);
    data[base + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
}

let last = performance.now();
function animate(now) {
  const elapsed = (now - last) / 1000;
  last = now;
  sim.time += elapsed * Number(controls.timeScale.value);

  if (sim.running) {
    const dt = Math.min(0.025, elapsed * Number(controls.timeScale.value));
    step(dt);
  }

  render();
  requestAnimationFrame(animate);
}

function setupEvents() {
  [
    controls.amplitude,
    controls.frequency,
    controls.speed,
    controls.damping,
    controls.timeScale,
    controls.brushSize
  ].forEach((input) => input.addEventListener('input', setValueText));

  controls.toggle.addEventListener('click', () => {
    sim.running = !sim.running;
    controls.toggle.textContent = sim.running ? '일시정지' : '재생';
  });

  controls.clearWave.addEventListener('click', clearWave);
  controls.clearObstacles.addEventListener('click', clearObstacles);

  controls.applyResolution.addEventListener('click', () => {
    sim.n = Number(controls.resolution.value);
    allocate();
    setValueText();
  });

  canvas.addEventListener('mousedown', (e) => {
    sim.mouseDown = true;
    applyBrush(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => {
    sim.mouseDown = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!sim.mouseDown) return;
    applyBrush(e.clientX, e.clientY);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    controls.tool.value = 'obstacle-erase';
    applyBrush(e.clientX, e.clientY);
  });
}

allocate();
setValueText();
setupEvents();
requestAnimationFrame(animate);
