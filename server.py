import copy
import random
import time
import threading
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
from collections import defaultdict

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app, engineio_logger=True, ping_timeout=60, ping_interval=25)

# Game constants
BALL_RESET_X = 300
BALL_RESET_Y = 200
COLLISION_DISTANCE = 25
BALL_KICK_FORCE = 0.1
UPDATE_INTERVAL = 2

# Room management
rooms = {}
player_rooms = {}  # {socket_id: room_code}


def create_room(sid):
    # TODO: Check if room with same code already exists
    code = f"{random.randint(1000, 9999)}"  # 4-digit code
    rooms[code] = {
        'host': sid,
        'thread': None,
        'players': {sid: {'position': {'x': 100, 'y': 100}}},
        # What should be sent to the client
        'game_state': {
            'players': {},
            'ball': {'x': BALL_RESET_X, 'y': BALL_RESET_Y, 'vx': 0, 'vy': 0},
            'status': 'waiting',
        },
    }
    player_rooms[sid] = code
    return code


def remove_player(sid):
    if sid not in player_rooms:
        return

    room_code = player_rooms[sid]
    if room_code not in rooms:
        return

    room = rooms[room_code]
    room['players'].pop(sid, None)

    if not room['players']:
        # Stop game thread if running
        if room['thread'] and room['game_state']['status'] == 'playing':
            room['game_state']['status'] = 'ended'
        rooms.pop(room_code, None)
    else:
        # Transfer host if needed
        if room['host'] == sid:
            room['host'] = next(iter(room['players']))

        emit('player_left', {'sid': sid}, to=room_code)

    player_rooms.pop(sid, None)


# Game loop
def game_loop(room_code):
    print("Game loop start for room:", room_code)
    room = rooms.get(room_code)
    if not room:
        return

    while room['game_state']['status'] == 'playing':
        # print("Game loop running for room:", room_code)
        prev_state = copy.deepcopy(room['game_state'])
        ball = room['game_state']['ball']

        # Update ball physics
        ball['x'] += ball['vx']
        ball['y'] += ball['vy']
        ball['vx'] *= 0.98  # friction
        ball['vy'] *= 0.98

        # Boundary checks
        if ball['x'] < 10 or ball['x'] > 590:
            ball['vx'] *= -1
        if ball['y'] < 10 or ball['y'] > 390:
            ball['vy'] *= -1

        # Broadcast state if smth changed
        # if room['game_state'] != prev_state:
        print("Game state changed, broadcasting to room:", room_code)
        print(room['game_state'])
        print(f"Clients in room {room_code}: {socketio.server.manager.rooms.get('/').get(room_code, set())}")
        socketio.emit('game_update', to=room_code)
        time.sleep(UPDATE_INTERVAL)


# Socket events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    print('Rooms:', rooms)
    emit('connected', {'sid': request.sid})


@socketio.on('disconnect')
def handle_disconnect():
    remove_player(request.sid)


@socketio.on('create_room')
def handle_create_room():
    print('Handle create room by client:', request.sid)
    print('Rooms:', rooms)
    code = create_room(request.sid)
    join_room(code)
    emit('room_created', {'code': code})


@socketio.on('join_room')
def handle_join_room(data):
    print('Handle join room by client:', request.sid)
    print('Rooms:', rooms)
    code = data.get('code')
    if code not in rooms:
        emit('room_error', {'error': 'Room not found'})
        return

    if len(rooms[code]['players']) >= 4:
        emit('room_error', {'error': 'Room full'})
        return

    rooms[code]['players'][request.sid] = {'position': {'x': 100, 'y': 100}}
    player_rooms[request.sid] = code
    join_room(code)
    # Success response to joining player
    emit('room_joined', {
        'code': code,
        'players': list(rooms[code]['players'].keys())
    })
    emit('player_joined', {'players': list(rooms[code]['players'].keys())}, to=code, skip_sid=request.sid)


@socketio.on('start_game')
def handle_start_game():
    print('Handle start game by client:', request.sid)
    if request.sid not in player_rooms:
        print("Player not in any room")
        return

    room_code = player_rooms[request.sid]
    room = rooms.get(room_code)

    print("Room:", room)
    if room and room['host'] == request.sid:
        print("Starting game in room:", room_code)
        emit('game_started', to=room_code)
        room['game_state']['status'] = 'playing'
        room['game_state']['players'] = room['players']
        room['thread'] = threading.Thread(
            target=game_loop,
            args=(room_code,),
            daemon=True
        )
        room['thread'].start()
        socketio.emit('game_update', room['game_state'], to=room_code)
        print("Game thread started")


@socketio.on('player_move')
def handle_player_move(data):
    # print("Player move data:", data)
    # print("Player ID:", request.sid)
    # print("Player rooms:", player_rooms)
    if request.sid not in player_rooms:
        print("Player not in any room")
        return

    room_code = player_rooms[request.sid]
    room = rooms.get(room_code)
    # print("Room:", room)
    if not room or room['game_state']['status'] != 'playing':
        print("Room not found or game not started")
        return

    # Update player position
    room['game_state']['players'][request.sid]['position'] = data['position']

    # Handle ball collision
    ball = room['game_state']['ball']
    if (
        (data['position']['x'] - ball['x']) ** 2 + (data['position']['y'] - ball['y']) ** 2 < COLLISION_DISTANCE ** 2
    ):
        dx = data['position']['x'] - ball['x']
        dy = data['position']['y'] - ball['y']
        ball['vx'] -= dx * BALL_KICK_FORCE
        ball['vy'] -= dy * BALL_KICK_FORCE


@app.route('/')
def index():
    return render_template('index.html')


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)
