const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

const playerId = Math.random().toString(36).substring(2);
let position = { x: 100, y: 100 };
const keysPressed = {};
const speed = 1;

// Track key states
document.addEventListener('keydown', (e) => {
  keysPressed[e.key] = true;
  // Send immediate update when key is first pressed
  socket.emit('player_move', { playerId, position });
});

document.addEventListener('keyup', (e) => {
  keysPressed[e.key] = false;
});

// Game loop for smooth local movement
function gameLoop() {
  const prevPosition = {...position};

  if (keysPressed['ArrowUp']) position.y -= speed;
  if (keysPressed['ArrowDown']) position.y += speed;
  if (keysPressed['ArrowLeft']) position.x -= speed;
  if (keysPressed['ArrowRight']) position.x += speed;

  // Only send update if position changed
  if (position.x !== prevPosition.x || position.y !== prevPosition.y) {
    socket.emit('player_move', { playerId, position });
  }

  requestAnimationFrame(gameLoop);
}

// Start game loop
gameLoop();

// Receive game state updates
socket.on('game_update', (state) => {
  // Only update position if it's not our player (server reconciliation)
  if (state.players[playerId]) {
    // Small reconciliation - you might want to make this more sophisticated
    if (Math.abs(state.players[playerId].x - position.x) > 20 ||
      Math.abs(state.players[playerId].y - position.y) > 20) {
      position = {...state.players[playerId]};
    }
  }

  renderGame(state);
});

function renderGame(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw ball
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, 10, 0, Math.PI*2);
  ctx.fillStyle = 'white';
  ctx.fill();

  // Draw players
  Object.entries(state.players).forEach(([id, player]) => {
    ctx.beginPath();
    ctx.arc(player.x, player.y, 15, 0, Math.PI*2);
    ctx.fillStyle = id === playerId ? 'blue' : 'red';
    ctx.fill();
  });
}