import eventlet

eventlet.monkey_patch()

import os
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import math
import threading
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

game_state = {
    'players': {},
    'ball': {'x': 300, 'y': 200, 'vx': 0, 'vy': 0}  # Added velocity
}


def check_collision(player_pos, ball_pos):
    distance = math.sqrt((player_pos['x'] - ball_pos['x']) ** 2 +
                         (player_pos['y'] - ball_pos['y']) ** 2)
    return distance < 25  # Player radius (15) + Ball radius (10)


def game_loop():
    """Background thread that updates game state"""
    while True:
        # Update ball position based on velocity
        game_state['ball']['x'] += game_state['ball']['vx']
        game_state['ball']['y'] += game_state['ball']['vy']

        # Apply friction
        game_state['ball']['vx'] *= 0.98
        game_state['ball']['vy'] *= 0.98

        # Keep ball within bounds
        if game_state['ball']['x'] < 10 or game_state['ball']['x'] > 590:
            game_state['ball']['vx'] *= -1
        if game_state['ball']['y'] < 10 or game_state['ball']['y'] > 390:
            game_state['ball']['vy'] *= -1
        # game_state['ball']['x'] = max(10, min(590, game_state['ball']['x']))
        # game_state['ball']['y'] = max(10, min(390, game_state['ball']['y']))

        # Broadcast update to all clients
        socketio.emit('game_update', game_state)

        # Control update rate (60 times per second)
        time.sleep(1 / 60)


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')


@socketio.on('player_move')
def handle_move(data):
    player_id = data['playerId']
    game_state['players'][player_id] = data['position']

    # Check for ball collision
    if check_collision(data['position'], game_state['ball']):
        # Apply force to ball
        dx = data['position']['x'] - game_state['ball']['x']
        dy = data['position']['y'] - game_state['ball']['y']
        game_state['ball']['vx'] += dx * 0.1
        game_state['ball']['vy'] += dy * 0.1

    # No need to emit here - game_loop handles updates


if __name__ == '__main__':
    # Start game loop thread
    threading.Thread(target=game_loop, daemon=True).start()

    # Production-ready server
    socketio.run(
        app,
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
    )
