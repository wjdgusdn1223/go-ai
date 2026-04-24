const BOARD_SIZE = 15;
const WIN_LENGTH = 5;
const POPULATION_SIZE = 20;
const PARALLEL_MATCHES = 10;
const MAX_MOVES = BOARD_SIZE * BOARD_SIZE;

const dom = {
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  stepBtn: document.getElementById('stepBtn'),
  resetBtn: document.getElementById('resetBtn'),
  speedRange: document.getElementById('speedRange'),
  batchRange: document.getElementById('batchRange'),
  speedLabel: document.getElementById('speedLabel'),
  batchLabel: document.getElementById('batchLabel'),
  stats: document.getElementById('stats'),
  matchesGrid: document.getElementById('matchesGrid'),
  historyList: document.getElementById('historyList'),
  replayMeta: document.getElementById('replayMeta'),
  replayBoard: document.getElementById('replayBoard'),
  replaySlider: document.getElementById('replaySlider'),
  replaySliderWrap: document.getElementById('replaySliderWrap'),
  replayMoveLabel: document.getElementById('replayMoveLabel')
};

const appState = {
  generation: 1,
  population: [],
  liveMatches: [],
  history: [],
  running: false,
  loopId: null,
  lastTick: 0,
  replay: null,
  scoreBuckets: {
    black: 0,
    white: 0,
    draw: 0
  }
};

const FEATURE_COUNT = 6;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function createGenome(id) {
  return {
    id,
    genes: Array.from({ length: FEATURE_COUNT }, () => rand(-1, 1)),
    fitness: 0
  };
}

function cloneGenome(genome, newId) {
  return {
    id: newId,
    genes: [...genome.genes],
    fitness: 0
  };
}

function mutateGenome(genome, rate = 0.15, scale = 0.35) {
  for (let i = 0; i < genome.genes.length; i += 1) {
    if (Math.random() < rate) {
      genome.genes[i] = clamp(genome.genes[i] + rand(-scale, scale), -2.5, 2.5);
    }
  }
  return genome;
}

function crossoverGenome(a, b, id) {
  return {
    id,
    genes: a.genes.map((gene, i) => (Math.random() < 0.5 ? gene : b.genes[i])),
    fitness: 0
  };
}

function boardKey(x, y) {
  return y * BOARD_SIZE + x;
}

function makeEmptyBoard() {
  return new Int8Array(MAX_MOVES);
}

function getCell(board, x, y) {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
    return 0;
  }
  return board[boardKey(x, y)];
}

function place(board, x, y, color) {
  board[boardKey(x, y)] = color;
}

function countDirection(board, x, y, dx, dy, color) {
  let count = 0;
  let cx = x + dx;
  let cy = y + dy;
  while (getCell(board, cx, cy) === color) {
    count += 1;
    cx += dx;
    cy += dy;
  }
  const blocked = getCell(board, cx, cy) === -color;
  return { count, blocked };
}

function evaluateMove(board, x, y, color, genes) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  let friendly2 = 0;
  let friendly3 = 0;
  let enemy2 = 0;
  let enemy3 = 0;
  let immediateWin = 0;

  for (const [dx, dy] of dirs) {
    const a = countDirection(board, x, y, dx, dy, color);
    const b = countDirection(board, x, y, -dx, -dy, color);
    const ownLine = a.count + b.count + 1;
    if (ownLine >= 2) friendly2 += 1;
    if (ownLine >= 3) friendly3 += 1;
    if (ownLine >= WIN_LENGTH) immediateWin = 1;

    const oa = countDirection(board, x, y, dx, dy, -color);
    const ob = countDirection(board, x, y, -dx, -dy, -color);
    const enemyLine = oa.count + ob.count + 1;
    if (enemyLine >= 2) enemy2 += 1;
    if (enemyLine >= 3) enemy3 += 1;
  }

  const centerDist = Math.abs(x - BOARD_SIZE / 2) + Math.abs(y - BOARD_SIZE / 2);
  const centerScore = 1 - centerDist / BOARD_SIZE;

  const score =
    genes[0] * centerScore +
    genes[1] * friendly2 +
    genes[2] * friendly3 +
    genes[3] * enemy2 +
    genes[4] * enemy3 +
    genes[5] * Math.random() +
    immediateWin * 50;

  return score;
}

function chooseMove(match, genome, color) {
  const { board, empties } = match;
  let bestMove = null;
  let bestScore = -Infinity;

  for (const idx of empties) {
    const x = idx % BOARD_SIZE;
    const y = Math.floor(idx / BOARD_SIZE);
    const score = evaluateMove(board, x, y, color, genome.genes);
    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }

  return bestMove;
}

function checkWin(board, x, y, color) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];
  for (const [dx, dy] of dirs) {
    const a = countDirection(board, x, y, dx, dy, color).count;
    const b = countDirection(board, x, y, -dx, -dy, color).count;
    if (a + b + 1 >= WIN_LENGTH) {
      return true;
    }
  }
  return false;
}

function createMatch(id, blackGenome, whiteGenome, generation) {
  const empties = [];
  for (let i = 0; i < MAX_MOVES; i += 1) {
    empties.push(i);
  }
  return {
    id,
    generation,
    blackGenome,
    whiteGenome,
    board: makeEmptyBoard(),
    empties,
    toPlay: 1,
    over: false,
    winner: 0,
    moves: [],
    canvas: null,
    label: null
  };
}

function setPopulationInitial() {
  appState.population = Array.from({ length: POPULATION_SIZE }, (_, i) => createGenome(`G0-${i + 1}`));
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function prepareGenerationMatches() {
  appState.scoreBuckets = { black: 0, white: 0, draw: 0 };
  appState.population.forEach((g) => {
    g.fitness = 0;
  });

  const shuffled = shuffle(appState.population);
  appState.liveMatches = [];

  for (let i = 0; i < PARALLEL_MATCHES; i += 1) {
    const blackGenome = shuffled[i * 2];
    const whiteGenome = shuffled[i * 2 + 1];
    appState.liveMatches.push(createMatch(i + 1, blackGenome, whiteGenome, appState.generation));
  }

  buildMatchCards();
  updateStats();
}

function tickSingleMatch(match) {
  if (match.over) return;

  const color = match.toPlay;
  const genome = color === 1 ? match.blackGenome : match.whiteGenome;
  const moveKey = chooseMove(match, genome, color);
  if (moveKey == null) {
    match.over = true;
    match.winner = 0;
    return;
  }

  const idx = match.empties.indexOf(moveKey);
  if (idx >= 0) {
    match.empties.splice(idx, 1);
  }

  const x = moveKey % BOARD_SIZE;
  const y = Math.floor(moveKey / BOARD_SIZE);
  place(match.board, x, y, color);
  match.moves.push({ x, y, color, genomeId: genome.id });

  if (checkWin(match.board, x, y, color)) {
    match.over = true;
    match.winner = color;
    if (color === 1) {
      match.blackGenome.fitness += 3;
      match.whiteGenome.fitness -= 1;
      appState.scoreBuckets.black += 1;
    } else {
      match.whiteGenome.fitness += 3;
      match.blackGenome.fitness -= 1;
      appState.scoreBuckets.white += 1;
    }
    return;
  }

  if (match.moves.length >= MAX_MOVES) {
    match.over = true;
    match.winner = 0;
    match.blackGenome.fitness += 1;
    match.whiteGenome.fitness += 1;
    appState.scoreBuckets.draw += 1;
    return;
  }

  match.toPlay *= -1;
}

function allMatchesDone() {
  return appState.liveMatches.every((m) => m.over);
}

function evolvePopulation() {
  const ranked = [...appState.population].sort((a, b) => b.fitness - a.fitness);
  const eliteCount = Math.max(2, Math.floor(POPULATION_SIZE * 0.2));
  const next = [];

  for (let i = 0; i < eliteCount; i += 1) {
    next.push(cloneGenome(ranked[i], `G${appState.generation}-${i + 1}E`));
  }

  let idCounter = eliteCount;
  while (next.length < POPULATION_SIZE) {
    const parentA = ranked[Math.floor(Math.random() * (POPULATION_SIZE / 2))];
    const parentB = ranked[Math.floor(Math.random() * (POPULATION_SIZE / 2))];
    const child = mutateGenome(
      crossoverGenome(parentA, parentB, `G${appState.generation}-${idCounter + 1}C`)
    );
    next.push(child);
    idCounter += 1;
  }

  appState.population = next;
}

function pushHistoryGeneration() {
  const bundle = {
    generation: appState.generation,
    timestamp: new Date().toISOString(),
    matches: appState.liveMatches.map((m) => ({
      id: m.id,
      winner: m.winner,
      blackGenomeId: m.blackGenome.id,
      whiteGenomeId: m.whiteGenome.id,
      moveCount: m.moves.length,
      moves: m.moves.map((mv) => ({ ...mv }))
    })),
    leaderboard: [...appState.population]
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 5)
      .map((g) => ({ id: g.id, fitness: g.fitness, genes: g.genes.map((v) => Number(v.toFixed(2))) }))
  };

  appState.history.unshift(bundle);
  if (appState.history.length > 200) {
    appState.history.pop();
  }
  renderHistory();
}

function drawBoard(ctx, board, highlightMove = null) {
  const size = ctx.canvas.width;
  const gap = size / (BOARD_SIZE + 1);

  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = '#8d6740';
  ctx.lineWidth = 1;

  for (let i = 1; i <= BOARD_SIZE; i += 1) {
    const p = gap * i;
    ctx.beginPath();
    ctx.moveTo(gap, p);
    ctx.lineTo(gap * BOARD_SIZE, p);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p, gap);
    ctx.lineTo(p, gap * BOARD_SIZE);
    ctx.stroke();
  }

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const value = board[boardKey(x, y)];
      if (!value) continue;
      const cx = gap * (x + 1);
      const cy = gap * (y + 1);
      ctx.beginPath();
      ctx.arc(cx, cy, gap * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = value === 1 ? '#111' : '#fff';
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.stroke();
    }
  }

  if (highlightMove) {
    const cx = gap * (highlightMove.x + 1);
    const cy = gap * (highlightMove.y + 1);
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - gap * 0.42, cy - gap * 0.42, gap * 0.84, gap * 0.84);
  }
}

function buildMatchCards() {
  dom.matchesGrid.innerHTML = '';
  appState.liveMatches.forEach((match) => {
    const article = document.createElement('article');
    const title = document.createElement('h3');
    title.textContent = `Match ${match.id}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 280;

    article.append(title, meta, canvas);
    dom.matchesGrid.appendChild(article);

    match.canvas = canvas;
    match.label = meta;
    updateMatchCard(match);
  });
}

function updateMatchCard(match) {
  if (!match.canvas || !match.label) return;
  const winnerText =
    match.winner === 1 ? '흑 승' : match.winner === -1 ? '백 승' : match.over ? '무승부' : '진행중';
  match.label.textContent = `흑:${match.blackGenome.id} / 백:${match.whiteGenome.id} · ${winnerText} · ${match.moves.length}수`;
  const ctx = match.canvas.getContext('2d');
  drawBoard(ctx, match.board, match.moves[match.moves.length - 1]);
}

function updateStats() {
  const avgFitness =
    appState.population.reduce((sum, g) => sum + g.fitness, 0) / Math.max(1, appState.population.length);
  dom.stats.textContent =
    `Generation ${appState.generation} | Match ${appState.liveMatches.filter((m) => m.over).length}/${PARALLEL_MATCHES} 종료 | ` +
    `흑승 ${appState.scoreBuckets.black}, 백승 ${appState.scoreBuckets.white}, 무 ${appState.scoreBuckets.draw} | 평균 적합도 ${avgFitness.toFixed(2)}`;
}

function tick(batch = Number(dom.batchRange.value)) {
  for (let i = 0; i < batch; i += 1) {
    for (const match of appState.liveMatches) {
      if (!match.over) {
        tickSingleMatch(match);
      }
    }

    if (allMatchesDone()) {
      appState.liveMatches.forEach(updateMatchCard);
      updateStats();
      pushHistoryGeneration();
      evolvePopulation();
      appState.generation += 1;
      prepareGenerationMatches();
      return;
    }
  }

  appState.liveMatches.forEach(updateMatchCard);
  updateStats();
}

function frameLoop(ts) {
  if (!appState.running) return;
  const movesPerSecond = Number(dom.speedRange.value);
  const interval = 1000 / movesPerSecond;
  if (ts - appState.lastTick >= interval) {
    tick();
    appState.lastTick = ts;
  }
  appState.loopId = requestAnimationFrame(frameLoop);
}

function startSimulation() {
  if (appState.running) return;
  appState.running = true;
  dom.startBtn.disabled = true;
  dom.pauseBtn.disabled = false;
  appState.loopId = requestAnimationFrame(frameLoop);
}

function pauseSimulation() {
  appState.running = false;
  dom.startBtn.disabled = false;
  dom.pauseBtn.disabled = true;
  if (appState.loopId != null) {
    cancelAnimationFrame(appState.loopId);
    appState.loopId = null;
  }
}

function resetSimulation() {
  pauseSimulation();
  appState.generation = 1;
  appState.history = [];
  appState.replay = null;
  dom.replaySliderWrap.classList.add('hidden');
  dom.replayMeta.textContent = '기록을 선택하세요.';
  setPopulationInitial();
  prepareGenerationMatches();
  renderHistory();
  clearReplayBoard();
}

function renderHistory() {
  dom.historyList.innerHTML = '';
  if (appState.history.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '아직 완료된 세대가 없습니다.';
    dom.historyList.appendChild(empty);
    return;
  }

  appState.history.forEach((bundle) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const blackWins = bundle.matches.filter((m) => m.winner === 1).length;
    const whiteWins = bundle.matches.filter((m) => m.winner === -1).length;
    const draws = bundle.matches.filter((m) => m.winner === 0).length;
    const top = bundle.leaderboard[0];
    div.innerHTML = `<strong>Gen ${bundle.generation}</strong><br/>흑 ${blackWins} · 백 ${whiteWins} · 무 ${draws}<br/>Top: ${top.id} (${top.fitness})`;
    div.addEventListener('click', () => selectReplay(bundle, bundle.matches[0]));
    dom.historyList.appendChild(div);
  });
}

function buildBoardFromMoves(moves, upto) {
  const board = makeEmptyBoard();
  for (let i = 0; i <= upto; i += 1) {
    const mv = moves[i];
    if (!mv) break;
    place(board, mv.x, mv.y, mv.color);
  }
  return board;
}

function selectReplay(bundle, matchInfo) {
  appState.replay = {
    bundle,
    match: matchInfo
  };
  const moveMax = Math.max(0, matchInfo.moves.length - 1);
  dom.replaySlider.max = String(moveMax);
  dom.replaySlider.value = String(moveMax);
  dom.replaySliderWrap.classList.remove('hidden');
  dom.replayMeta.textContent = `Gen ${bundle.generation} / Match ${matchInfo.id} / 흑 ${matchInfo.blackGenomeId} vs 백 ${matchInfo.whiteGenomeId}`;
  updateReplay();
}

function updateReplay() {
  if (!appState.replay) return;
  const idx = Number(dom.replaySlider.value);
  const { match } = appState.replay;
  const board = buildBoardFromMoves(match.moves, idx);
  const ctx = dom.replayBoard.getContext('2d');
  const highlight = match.moves[idx] || null;
  drawBoard(ctx, board, highlight);
  dom.replayMoveLabel.textContent = `${idx + 1} / ${match.moves.length}`;
}

function clearReplayBoard() {
  const ctx = dom.replayBoard.getContext('2d');
  drawBoard(ctx, makeEmptyBoard());
}

function bindEvents() {
  dom.startBtn.addEventListener('click', startSimulation);
  dom.pauseBtn.addEventListener('click', pauseSimulation);
  dom.stepBtn.addEventListener('click', () => {
    pauseSimulation();
    tick(1);
  });
  dom.resetBtn.addEventListener('click', resetSimulation);

  dom.speedRange.addEventListener('input', () => {
    dom.speedLabel.textContent = `${dom.speedRange.value} moves/s`;
  });
  dom.batchRange.addEventListener('input', () => {
    dom.batchLabel.textContent = dom.batchRange.value;
  });

  dom.replaySlider.addEventListener('input', updateReplay);
}

function init() {
  bindEvents();
  dom.speedLabel.textContent = `${dom.speedRange.value} moves/s`;
  dom.batchLabel.textContent = dom.batchRange.value;
  resetSimulation();
}

init();
