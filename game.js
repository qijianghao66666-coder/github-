(() => {
  "use strict";

  const CONFIG = Object.freeze({
    durationMs: 30_000,
    firstSpawnDelayMs: 380,
    spawnMinMs: 540,
    spawnMaxMs: 860,
    docVisibleMinMs: 760,
    docVisibleMaxMs: 1120,
    coffeeVisibleMinMs: 900,
    coffeeVisibleMaxMs: 1260,
    coffeeChance: 0.18,
    maxActive: 2,
    warningMs: 10_000,
    scoreDoc: 10,
    scoreCoffee: -5,
    highScoreKey: "approval-doc-catcher.high-score.v1",
  });

  const board = document.getElementById("board");
  const cells = Array.from(board.querySelectorAll(".cell"));
  const startOverlay = document.getElementById("startOverlay");
  const resultOverlay = document.getElementById("resultOverlay");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");
  const scoreValue = document.getElementById("scoreValue");
  const highScoreValue = document.getElementById("highScoreValue");
  const timeValue = document.getElementById("timeValue");
  const timerFill = document.getElementById("timerFill");
  const timerTrack = document.querySelector(".timer-track");
  const timeCard = document.getElementById("timeCard");
  const scoreCard = document.getElementById("scoreCard");
  const statusPill = document.getElementById("statusPill");
  const statusText = document.getElementById("statusText");
  const statusSub = document.getElementById("statusSub");
  const resultScore = document.getElementById("resultScore");
  const resultHigh = document.getElementById("resultHigh");
  const resultTitle = document.getElementById("resultTitle");
  const newRecordBadge = document.getElementById("newRecordBadge");
  const announcer = document.getElementById("announcer");

  const state = {
    phase: "idle",
    score: 0,
    highScore: readHighScore(),
    endAt: 0,
    spawnCount: 0,
    lastType: "doc",
    active: new Map(),
    spawnTimer: 0,
    tickTimer: 0,
    scoreBumpTimer: 0,
    resultTimer: 0,
  };

  function randomBetween(min, max) {
    return Math.round(min + Math.random() * (max - min));
  }

  function readHighScore() {
    try {
      const stored = window.localStorage.getItem(CONFIG.highScoreKey);
      const parsed = Number.parseInt(stored ?? "0", 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  function writeHighScore(score) {
    try {
      window.localStorage.setItem(CONFIG.highScoreKey, String(score));
    } catch {
      // file:// storage can be restricted in some browsers; the game still works.
    }
  }

  function setStatus(phase) {
    statusPill.classList.remove(
      "status-pill--idle",
      "status-pill--playing",
      "status-pill--ended"
    );

    if (phase === "playing") {
      statusPill.classList.add("status-pill--playing");
      statusText.textContent = "진행 중";
      statusSub.textContent = "/ 进行中";
      return;
    }

    if (phase === "ended") {
      statusPill.classList.add("status-pill--ended");
      statusText.textContent = "종료";
      statusSub.textContent = "/ 已结束";
      return;
    }

    statusPill.classList.add("status-pill--idle");
    statusText.textContent = "대기 중";
    statusSub.textContent = "/ 待开始";
  }

  function setCellIdle(index) {
    const cell = cells[index];
    const emoji = cell.querySelector(".cell-emoji");
    const label = cell.querySelector(".cell-label");

    cell.classList.remove("active", "is-doc", "is-coffee", "is-hit");
    delete cell.dataset.item;
    emoji.textContent = "";
    label.textContent = "";
    cell.setAttribute("aria-label", `${index + 1}번 칸, 비어 있음`);
  }

  function clearAllCells() {
    for (const item of state.active.values()) {
      window.clearTimeout(item.timeout);
    }
    state.active.clear();

    cells.forEach((cell, index) => {
      window.clearTimeout(cell._missTimer);
      setCellIdle(index);
    });
  }

  function resetHud() {
    state.score = 0;
    scoreValue.textContent = "0";
    highScoreValue.textContent = String(state.highScore);
    timeValue.textContent = "30.0";
    timerFill.style.transform = "scaleX(1)";
    timerTrack.classList.remove("is-warning");
    timeCard.classList.remove("is-warning");
    scoreValue.classList.remove("is-bumping");
    scoreCard.classList.remove("is-celebrating");
  }

  function startGame() {
    window.clearTimeout(state.spawnTimer);
    window.clearInterval(state.tickTimer);
    window.clearTimeout(state.resultTimer);
    window.clearTimeout(state.scoreBumpTimer);

    state.phase = "playing";
    state.endAt = performance.now() + CONFIG.durationMs;
    state.spawnCount = 0;
    state.lastType = "doc";

    clearAllCells();
    resetHud();

    startOverlay.hidden = true;
    resultOverlay.hidden = true;
    newRecordBadge.hidden = true;
    setStatus("playing");
    board.classList.remove("is-shaking");

    announcer.textContent =
      "결재가 시작되었습니다. 30초 동안 서류를 잡으세요. 커피는 피하세요.";

    state.tickTimer = window.setInterval(tick, 50);
    scheduleSpawn(CONFIG.firstSpawnDelayMs);
    tick();
  }

  function scheduleSpawn(delay = randomBetween(CONFIG.spawnMinMs, CONFIG.spawnMaxMs)) {
    window.clearTimeout(state.spawnTimer);
    state.spawnTimer = window.setTimeout(() => {
      if (state.phase !== "playing") {
        return;
      }

      spawnItem();
      scheduleSpawn();
    }, delay);
  }

  function spawnItem() {
    if (state.phase !== "playing" || state.active.size >= CONFIG.maxActive) {
      return;
    }

    const occupied = new Set(state.active.keys());
    const emptyIndexes = cells
      .map((_, index) => index)
      .filter((index) => !occupied.has(index));

    if (emptyIndexes.length === 0) {
      return;
    }

    const index = emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
    let type = "doc";

    if (state.spawnCount >= 2 && Math.random() < CONFIG.coffeeChance) {
      type = "coffee";
    }

    if (type === "coffee" && state.lastType === "coffee") {
      type = "doc";
    }

    state.spawnCount += 1;
    state.lastType = type;
    showItem(index, type);
  }

  function showItem(index, type) {
    const cell = cells[index];
    const emoji = cell.querySelector(".cell-emoji");
    const label = cell.querySelector(".cell-label");
    const isDoc = type === "doc";
    const visibleFor = isDoc
      ? randomBetween(CONFIG.docVisibleMinMs, CONFIG.docVisibleMaxMs)
      : randomBetween(CONFIG.coffeeVisibleMinMs, CONFIG.coffeeVisibleMaxMs);

    cell.classList.remove("is-hit", "is-missed");
    cell.classList.add("active", isDoc ? "is-doc" : "is-coffee");
    cell.dataset.item = type;
    emoji.textContent = isDoc ? "📄" : "☕";
    label.textContent = isDoc ? "결재" : "커피";
    cell.setAttribute(
      "aria-label",
      isDoc
        ? `${index + 1}번 칸, 결재 서류, 클릭하면 10점 획득`
        : `${index + 1}번 칸, 커피, 클릭하면 5점 감점`
    );

    const timeout = window.setTimeout(() => {
      hideItem(index);
    }, visibleFor);

    state.active.set(index, { type, timeout });
  }

  function hideItem(index) {
    const item = state.active.get(index);
    if (!item) {
      return;
    }

    window.clearTimeout(item.timeout);
    state.active.delete(index);
    setCellIdle(index);
  }

  function activateCell(index) {
    if (state.phase !== "playing") {
      return;
    }

    const cell = cells[index];
    const item = state.active.get(index);

    if (!item) {
      cell.classList.remove("is-missed");
      void cell.offsetWidth;
      cell.classList.add("is-missed");
      window.clearTimeout(cell._missTimer);
      cell._missTimer = window.setTimeout(() => {
        cell.classList.remove("is-missed");
      }, 260);
      return;
    }

    window.clearTimeout(item.timeout);
    state.active.delete(index);
    setCellIdle(index);

    const isDoc = item.type === "doc";
    const points = isDoc ? CONFIG.scoreDoc : CONFIG.scoreCoffee;

    cell.classList.remove("is-hit");
    void cell.offsetWidth;
    cell.classList.add("is-hit");
    window.setTimeout(() => cell.classList.remove("is-hit"), 260);

    addScore(points);
    showScorePop(cell, points);

    if (isDoc) {
      announcer.textContent = `결재 성공, 10점 획득. 현재 ${state.score}점.`;
    } else {
      announcer.textContent = `커피를 건드렸습니다, 5점 감점. 현재 ${state.score}점.`;
      shakeBoard();
    }
  }

  function addScore(points) {
    state.score += points;
    scoreValue.textContent = String(state.score);

    scoreValue.classList.remove("is-bumping");
    scoreCard.classList.remove("is-celebrating");
    void scoreValue.offsetWidth;
    scoreValue.classList.add("is-bumping");

    if (points > 0) {
      scoreCard.classList.add("is-celebrating");
    }

    window.clearTimeout(state.scoreBumpTimer);
    state.scoreBumpTimer = window.setTimeout(() => {
      scoreValue.classList.remove("is-bumping");
      scoreCard.classList.remove("is-celebrating");
    }, 320);
  }

  function showScorePop(cell, points) {
    const pop = document.createElement("span");
    const isPlus = points > 0;

    pop.className = `score-pop ${isPlus ? "score-pop--plus" : "score-pop--minus"}`;
    pop.textContent = isPlus ? `+${points}` : `−${Math.abs(points)}`;
    pop.setAttribute("aria-hidden", "true");
    cell.appendChild(pop);

    window.setTimeout(() => {
      pop.remove();
    }, 800);
  }

  function shakeBoard() {
    board.classList.remove("is-shaking");
    void board.offsetWidth;
    board.classList.add("is-shaking");
    window.setTimeout(() => board.classList.remove("is-shaking"), 380);
  }

  function tick() {
    if (state.phase !== "playing") {
      return;
    }

    const remainingMs = Math.max(0, state.endAt - performance.now());
    timeValue.textContent = (Math.ceil(remainingMs / 100) / 10).toFixed(1);
    timerFill.style.transform = `scaleX(${remainingMs / CONFIG.durationMs})`;

    const isWarning = remainingMs <= CONFIG.warningMs;
    timerTrack.classList.toggle("is-warning", isWarning);
    timeCard.classList.toggle("is-warning", isWarning);

    if (remainingMs <= 0) {
      endGame();
    }
  }

  function endGame() {
    if (state.phase !== "playing") {
      return;
    }

    state.phase = "ended";
    window.clearInterval(state.tickTimer);
    window.clearTimeout(state.spawnTimer);
    window.clearTimeout(state.resultTimer);

    for (const item of state.active.values()) {
      window.clearTimeout(item.timeout);
    }
    state.active.clear();
    cells.forEach((cell, index) => setCellIdle(index));

    timeValue.textContent = "0.0";
    timerFill.style.transform = "scaleX(0)";
    timerTrack.classList.remove("is-warning");
    timeCard.classList.remove("is-warning");
    setStatus("ended");

    const isNewRecord = state.score > state.highScore;
    if (isNewRecord) {
      state.highScore = state.score;
      writeHighScore(state.highScore);
    }

    highScoreValue.textContent = String(state.highScore);
    resultScore.textContent = String(state.score);
    resultHigh.textContent = String(state.highScore);
    newRecordBadge.hidden = !isNewRecord;

    if (state.score >= 200) {
      resultTitle.textContent = "결재의 달인!";
    } else if (state.score >= 100) {
      resultTitle.textContent = "오늘의 결재 완료!";
    } else if (state.score >= 0) {
      resultTitle.textContent = "야근 종료!";
    } else {
      resultTitle.textContent = "커피가 너무 많아요...";
    }

    announcer.textContent = `결재 종료. 이번 점수 ${state.score}점, 최고 기록 ${state.highScore}점.${
      isNewRecord ? " 신기록입니다!" : ""
    }`;

    state.resultTimer = window.setTimeout(() => {
      if (state.phase === "ended") {
        resultOverlay.hidden = false;
        restartButton.focus({ preventScroll: true });
      }
    }, 380);
  }

  cells.forEach((cell, index) => {
    cell.addEventListener("click", () => activateCell(index));
  });

  startButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);

  document.addEventListener("keydown", (event) => {
    if (event.repeat || state.phase !== "playing" || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const number = Number(event.key);
    if (Number.isInteger(number) && number >= 1 && number <= 9) {
      event.preventDefault();
      activateCell(number - 1);
    }
  });

  const snapshot = () => ({
    phase: state.phase,
    score: state.score,
    highScore: state.highScore,
    remainingMs:
      state.phase === "playing" ? Math.max(0, state.endAt - performance.now()) : 0,
    activeCells: Array.from(state.active.entries()).map(([index, item]) => ({
      index,
      type: item.type,
    })),
  });

  Object.defineProperty(window, "__approvalGame", {
    value: Object.freeze({ snapshot }),
    configurable: true,
  });

  resetHud();
  setStatus("idle");
})();
