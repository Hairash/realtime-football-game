import time


class GameRoom:
    def __init__(self, code):
        self.code = code
        self.players = {}  # {socket_id: player_info}
        self.game_state = {
            'ball': {'x': 300, 'y': 200, 'vx': 0, 'vy': 0},
            'players': {},
            'status': 'waiting'  # 'waiting' | 'playing' | 'ended'
        }
        self.created_at = time.time()
        self.last_activity = time.time()
