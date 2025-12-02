// ----- Config and DOM Elements -----
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const leaderboardEl = document.getElementById("leaderboard");
const gameOverScreen = document.getElementById("gameOverScreen");
const finalScoreEl = document.getElementById("finalScore");

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const replayBtn = document.getElementById("replayBtn");
const quitBtn = document.getElementById("quitBtn");
const toggleSoundBtn = document.getElementById("toggleSound");

const moveSound = document.getElementById("moveSound");
const rotateSound = document.getElementById("rotateSound");
const dropSound = document.getElementById("dropSound");
const gameOverSound = document.getElementById("gameOverSound");
const bgm = document.getElementById("bgm");

const ROW = 20,
  COL = 10,
  SQ = 24; // square size
let board = [];
let score = 0;
let gameLoop = null;
let currentPiece = null;
let nextPiece = null;
const nextCtx = document.getElementById("nextCanvas").getContext("2d");
let isPaused = false;
let soundOn = true;

// Tetromino shapes
const SHAPES = [
  { matrix: [[1, 1, 1, 1]], color: "#06b6d4" }, // I (Cyan)
  {
    matrix: [
      [1, 1],
      [1, 1],
    ],
    color: "#f59e0b",
  }, // O (Yellow)
  {
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: "#f472b6",
  }, // T (Pink)
  {
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: "#a78bfa",
  }, // J (Purple)
  {
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: "#fb923c",
  }, // L (Orange)
  {
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: "#34d399",
  }, // S (Green)
  {
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: "#ef4444",
  }, // Z (Red)
];

// ----- Utilities and Drawing -----
function createMatrix(w, h) {
  const m = [];
  for (let y = 0; y < h; y++) m.push(new Array(w).fill(null));
  return m;
}

function drawSquare(x, y, color) {
  const squareColor = color || "#071024"; // Very dark color for empty space

  // 3D Effect using Canvas shadows
  if (color) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  } else {
    // No shadow for empty space
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Draw the main square
  ctx.fillStyle = squareColor;
  ctx.fillRect(x * SQ, y * SQ, SQ - 1, SQ - 1);

  // Optional: Draw a slight inner highlight for a "shiny" look
  if (color) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(x * SQ + 1, y * SQ + 1, SQ - 3, 2);
  }
}

function resetBoard() {
  board = createMatrix(COL, ROW);
}

// ----- Piece class -----
class Piece {
  constructor(shapeDef) {
    this.matrix = shapeDef.matrix.map((r) => r.slice());
    this.color = shapeDef.color;
    this.x = Math.floor(COL / 2) - Math.ceil(this.matrix[0].length / 2);
    this.y = 0;
  }

  draw() {
    for (let r = 0; r < this.matrix.length; r++) {
      for (let c = 0; c < this.matrix[r].length; c++) {
        if (this.matrix[r][c]) drawSquare(this.x + c, this.y + r, this.color);
      }
    }
  }

  move(dx, dy) {
    if (!this._collide(dx, dy)) {
      this.x += dx;
      this.y += dy;
      if (dx !== 0) playSound(moveSound);
      return true;
    }
    return false;
  }

  hardDrop() {
    while (this.move(0, 1)) {}
    this.lock();
  }

  rotate(dir = 1) {
    // transpose + reverse technique
    const m = this.matrix;
    const rotated = m[0].map((_, i) => m.map((row) => row[i]));
    if (dir > 0) rotated.forEach((row) => row.reverse());
    else rotated.reverse();

    // Simple wall kick mechanism (try 1 unit move left/right if collision)
    const old = this.matrix;
    this.matrix = rotated;
    let offset = 0;
    if (this._collide(0, 0)) {
      if (!this._collide(1, 0)) offset = 1;
      else if (!this._collide(-1, 0)) offset = -1;
      else this.matrix = old; // Revert if no simple kick works
    }

    if (this.matrix !== old) {
      this.x += offset;
      playSound(rotateSound);
    }
  }

  _collide(dx, dy) {
    for (let r = 0; r < this.matrix.length; r++) {
      for (let c = 0; c < this.matrix[r].length; c++) {
        if (!this.matrix[r][c]) continue;
        const nx = this.x + c + dx;
        const ny = this.y + r + dy;

        // Wall/Floor collision
        if (nx < 0 || nx >= COL || ny >= ROW) return true;

        // Piece collision (check if board cell is already filled)
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  lock() {
    playSound(dropSound);

    for (let r = 0; r < this.matrix.length; r++) {
      for (let c = 0; c < this.matrix[r].length; c++) {
        if (this.matrix[r][c]) {
          const ny = this.y + r;
          const nx = this.x + c;
          if (ny >= 0 && ny < ROW && nx >= 0 && nx < COL)
            board[ny][nx] = this.color;
        }
      }
    }
    clearLines();
    if (this.y <= 0 && this._collide(0, 0)) {
      endGame();
    } else {
      spawnPiece();
    }
  }
}

function drawNextPiece() {
  nextCtx.clearRect(0, 0, 96, 96);
  if (!nextPiece) return;
  const m = nextPiece.matrix;
  // Calculate center offset for the Next Piece canvas (96x96 is 4x4 squares of 24x24)
  const xOffset = Math.floor((4 - m[0].length) / 2) * SQ;
  const yOffset = Math.floor((4 - m.length) / 2) * SQ;

  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (m[r][c]) {
        nextCtx.fillStyle = nextPiece.color;
        nextCtx.fillRect(c * SQ + xOffset, r * SQ + yOffset, SQ - 1, SQ - 1);
      }
    }
  }
}

// ----- Game functions -----
function spawnPiece() {
  // Use a temporary piece generation if nextPiece hasn't been created yet
  if (!nextPiece) {
    const def = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    nextPiece = new Piece(def);
  }

  // Current piece = next piece (copy properties, not reference)
  currentPiece = new Piece({
    matrix: nextPiece.matrix,
    color: nextPiece.color,
  });
  currentPiece.x =
    Math.floor(COL / 2) - Math.ceil(currentPiece.matrix[0].length / 2);

  // Generate new nextPiece
  const def2 = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  nextPiece = new Piece(def2);
  drawNextPiece();

  // Game over check immediately after spawn
  if (currentPiece._collide(0, 0)) endGame();
}

function clearLines() {
  let removed = 0;
  outer: for (let y = ROW - 1; y >= 0; y--) {
    for (let x = 0; x < COL; x++) {
      if (!board[y][x]) continue outer;
    }
    // full line found
    board.splice(y, 1); // remove the full row
    board.unshift(new Array(COL).fill(null)); // add a new empty row at the top
    removed++;
    y++; // recheck the same index after shift
  }
  if (removed > 0) {
    // Scoring system: 100/300/500/800 for 1/2/3/4 lines
    score += removed * 100 * removed;
    scoreEl.textContent = score;
  }
}

function drawBoard() {
  // Clear shadow before drawing the board background
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Draw board background and locked pieces
  for (let y = 0; y < ROW; y++) {
    for (let x = 0; x < COL; x++) {
      const color = board[y][x];
      drawSquare(x, y, color); // The updated drawSquare handles the empty color
    }
  }
  // Draw current piece with shadows
  if (currentPiece) currentPiece.draw();
}

function gameTick() {
  if (isPaused) return;
  if (currentPiece) {
    if (!currentPiece.move(0, 1)) {
      currentPiece.lock();
    }
  }
  drawBoard();
}

function startGame() {
  gameOverScreen.style.visibility = "hidden";
  resetBoard();
  score = 0;
  scoreEl.textContent = score;
  isPaused = false;
  // Reset piece for a clean start
  currentPiece = null;
  nextPiece = null;
  spawnPiece();

  if (gameLoop) clearInterval(gameLoop);
  let speed = parseInt(document.getElementById("difficulty").value);
  gameLoop = setInterval(gameTick, speed);

  // Di dalam fungsi startGame() dan toggleSoundBtn.addEventListener
  if (soundOn) {
    bgm.currentTime = 0;
    // Gunakan .play().catch() untuk menangkap kesalahan jika autoplay diblokir/gagal load
    const playPromise = bgm.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.log("BGM play was blocked or failed to load.", error);
      });
    }
  }
  loadLeaderboard();
  pauseBtn.textContent = "Pause";
}

function pauseGame() {
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  if (isPaused) bgm.pause();
  else if (soundOn) bgm.play().catch((e) => {}); // Resume BGM
}

function endGame() {
  if (gameLoop) clearInterval(gameLoop);
  finalScoreEl.innerHTML = `Final Score: **${score}**`;
  playSound(gameOverSound);
  try {
    bgm.pause();
  } catch (e) {}
  saveLeaderboard();
  loadLeaderboard();
  gameOverScreen.style.visibility = "visible";
}

function quitGame() {
  // Reload the page
  window.location.reload();
}

// ----- Leaderboard (localStorage) -----
function saveLeaderboard() {
  const raw = JSON.parse(localStorage.getItem("tetris_scores") || "[]");
  raw.push(score);
  raw.sort((a, b) => b - a);
  const top = raw.slice(0, 5);
  localStorage.setItem("tetris_scores", JSON.stringify(top));
}

function loadLeaderboard() {
  const data = JSON.parse(localStorage.getItem("tetris_scores") || "[]");
  leaderboardEl.innerHTML =
    data.map((s, i) => `<li>#${i + 1}: ${s}</li>`).join("") || "<li>—</li>";
}

// ----- Sound helper -----
function playSound(audio) {
  if (!soundOn || !audio) return;
  try {
    audio.currentTime = 0;
    // Play and suppress the error if the user hasn't interacted with the page yet
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

// ----- Input handling (Keyboard & Mobile) -----
document.addEventListener("keydown", (e) => {
  if (!currentPiece || isPaused) return;
  if (e.key === "ArrowLeft") {
    currentPiece.move(-1, 0);
  } else if (e.key === "ArrowRight") {
    currentPiece.move(1, 0);
  } else if (e.key === "ArrowDown") {
    currentPiece.move(0, 1);
  } else if (e.key === "ArrowUp") {
    currentPiece.rotate(1);
  } else if (e.code === "Space") {
    e.preventDefault(); // Prevent page scroll on space bar
    currentPiece.hardDrop();
  }
  drawBoard();
});

// Mobile Buttons
document.getElementById("leftBtn").addEventListener("click", () => {
  if (currentPiece && !isPaused) {
    currentPiece.move(-1, 0);
    drawBoard();
  }
});
document.getElementById("rightBtn").addEventListener("click", () => {
  if (currentPiece && !isPaused) {
    currentPiece.move(1, 0);
    drawBoard();
  }
});
document.getElementById("rotateBtn").addEventListener("click", () => {
  if (currentPiece && !isPaused) {
    currentPiece.rotate(1);
    drawBoard();
  }
});
document.getElementById("downBtn").addEventListener("click", () => {
  if (currentPiece && !isPaused) {
    currentPiece.move(0, 1);
    drawBoard();
  }
});
document.getElementById("dropBtn").addEventListener("click", () => {
  if (currentPiece && !isPaused) {
    currentPiece.hardDrop();
    drawBoard();
  }
});

// ----- Button bindings -----
startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", pauseGame);
replayBtn.addEventListener("click", startGame);
quitBtn.addEventListener("click", quitGame);
toggleSoundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  toggleSoundBtn.textContent = "Toggle Sound: " + (soundOn ? "ON" : "OFF");

  if (soundOn && !isPaused) {
    bgm
      .play()
      .catch((e) =>
        console.log("BGM play failed, user interaction needed.", e)
      );
  } else {
    bgm.pause();
  }
});

// ----- Init -----
resetBoard();
loadLeaderboard();
drawBoard(); // Draw the empty board initially
