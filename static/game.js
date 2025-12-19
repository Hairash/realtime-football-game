// ===== Game Constants =====
const GAME_WIDTH = 600;
const GAME_HEIGHT = 400;
const PLAYER_RADIUS = 15;
const BALL_RADIUS = 10;
const PLAYER_SPEED = 5; // Increased for better responsiveness
const RECONCILIATION_THRESHOLD = 20;

// Colors
const BALL_COLOR = 'white';
const LOCAL_PLAYER_COLOR = 'blue';
const REMOTE_PLAYER_COLOR = 'red';
const BACKGROUND_COLOR = '#4CAF50';

// ===== DOM Elements =====
const lobbyElement = document.getElementById('lobby');
const gameElement = document.getElementById('game-container');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const roomCodeElement = document.getElementById('room-code');
const roomInputElement = document.getElementById('room-input');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const startBtn = document.getElementById('start-btn');
const leaveBtn = document.getElementById('leave-btn');
const gameStatusLbl = document.getElementById('game-status');

// ===== Game State =====
const socket = io();
localStorage.debug = 'socket.io-client:socket';
let playerId = null;
let position = {x: 100, y: 100};
let currentRoom = null;
// const playersConnected = [];
let isGameStarted = false;
let isHost = false;
const keysPressed = {};

// ===== Initialization =====
function init() {
  // Set canvas size
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;

  // Check URL for room code
  if (window.location.hash) {
    joinRoom(window.location.hash.substring(1));
  }

  // Set up event listeners
  createBtn.addEventListener('click', handleCreateRoom);
  joinBtn.addEventListener('click', handleJoinRoom);
  startBtn.addEventListener('click', handleStartGame);
  leaveBtn.addEventListener('click', handleLeaveGame);
  window.addEventListener('hashchange', handleHashChange);

  // Start game loop
  gameLoop();
}

// ===== Room Management =====
function handleCreateRoom() {
  socket.emit('create_room');
}

function handleJoinRoom() {
  const code = roomInputElement.value.trim().toUpperCase();
  if (!code) return;

  joinRoom(code);
}

function joinRoom(code) {
  socket.emit('join_room', {code});
}

function handleStartGame() {
  if (isHost) {
    socket.emit('start_game');
  }
}

function handleLeaveGame() {
  socket.emit('leave_room');
  currentRoom = null;
  window.location.hash = '';
  updateUI();
}

function handleHashChange() {
  if (!window.location.hash && currentRoom) {
    handleLeaveGame();
  }
}

// ===== Socket Events =====
socket.on('connected', (data) => {
  playerId = data.sid;
  console.log(`Connected with ID: ${playerId}`);
});

socket.on('room_created', (data) => {
  currentRoom = data.code;
  isHost = true;
  window.location.hash = data.code;
  // playersConnected.push()
  updateUI();
});

socket.on('room_joined', (data) => {
  currentRoom = data.code;
  window.location.hash = data.code;
  updatePlayerList(data.players);
  updateUI();
});

socket.on('game_started', (initialState) => {
  isGameStarted = true;
  updateUI();
  // Initialize game state if needed
});

socket.on('player_joined', (data) => {
  updatePlayerList(data.players);
});

socket.on('player_left', (players) => {
  updatePlayerList(players);
});

socket.on('game_update', (gameState) => {
  // Server reconciliation
  console.log(gameState);
  // if (gameState.players[playerId]) {
  //   // console.log(gameState.players[playerId]);
  //   const serverX = gameState.players[playerId].x;
  //   const serverY = gameState.players[playerId].y;
  //
  //   if (Math.abs(serverX - position.x) > RECONCILIATION_THRESHOLD ||
  //     Math.abs(serverY - position.y) > RECONCILIATION_THRESHOLD) {
  //     position = {x: serverX, y: serverY};
  //   }
  // }

  // renderGame(gameState);
});

// ===== UI Management =====
function updateUI() {
  if (currentRoom) {
    lobbyElement.style.display = 'none';
    gameElement.style.display = 'block';
    roomCodeElement.textContent = currentRoom;
    startBtn.style.display = (isHost && !isGameStarted) ? 'block' : 'none';
    canvas.style.display = isGameStarted ? 'block' : 'none';
    gameStatusLbl.style.display = (!isHost && !isGameStarted) ? 'block' : 'none';
  } else {
    lobbyElement.style.display = 'block';
    gameElement.style.display = 'none';
  }
}

function updatePlayerList(players) {
  const countElement = document.getElementById('player-count');
  countElement.textContent = `${players.length}/4 players`;

  if (isHost) {
    startBtn.disabled = players.length < 2;
  }
}

// function addPlayerToList(sid) {
//
// }

// ===== Input Handling =====
function handleKeyDown(e) {
  if (!currentRoom) return;

  const key = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    keysPressed[key] = true;
  }
}

function handleKeyUp(e) {
  const key = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    keysPressed[key] = false;
  }
}

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

// ===== Game Loop =====
function gameLoop() {
  if (currentRoom) {
    const prevPosition = {...position};

    // Update position
    if (keysPressed['ArrowUp']) position.y -= PLAYER_SPEED;
    if (keysPressed['ArrowDown']) position.y += PLAYER_SPEED;
    if (keysPressed['ArrowLeft']) position.x -= PLAYER_SPEED;
    if (keysPressed['ArrowRight']) position.x += PLAYER_SPEED;

    // Boundary check
    // position.x = Math.max(PLAYER_RADIUS, Math.min(GAME_WIDTH - PLAYER_RADIUS, position.x));
    // position.y = Math.max(PLAYER_RADIUS, Math.min(GAME_HEIGHT - PLAYER_RADIUS, position.y));

    // Send update if changed
    if (position.x !== prevPosition.x || position.y !== prevPosition.y) {
      // console.log(position);
      // Unsafe - better to send position delta
      socket.emit('player_move', {position});
    }
  }

  requestAnimationFrame(gameLoop);
}

// ===== Rendering =====
function renderGame(state) {
  // Clear canvas
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Draw ball
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = BALL_COLOR;
  ctx.fill();

  // Draw players
  Object.entries(state.players).forEach(([id, player]) => {
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = id === playerId ? LOCAL_PLAYER_COLOR : REMOTE_PLAYER_COLOR;
    ctx.fill();
  });
}

// Start the application
init();
