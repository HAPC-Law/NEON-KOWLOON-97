"""NEON KOWLOON '97 multiplayer authority and Discord Activity OAuth gateway.

Run: python server.py   (requires aiohttp)
"""
import asyncio
import json
import logging
import os
import re
import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path

# Small .env loader to avoid requiring python-dotenv just to deploy the game.
ENV_FILE = Path(__file__).resolve().parent / '.env'
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding='utf8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))

from aiohttp import ClientSession, WSMsgType, web

ROOT = Path(__file__).resolve().parent
CLIENT = ROOT / 'client'
DIST = ROOT / 'dist'
GRID = 56
DIRECTIONS = ((0, -1), (1, 0), (0, 1), (-1, 0))
STARTS = ((14, 40, 0), (41, 13, 2), (41, 41, 3), (14, 13, 1))
PALETTE = ('#48faff', '#ff48bc', '#ffd66d', '#9066ff')
BOT_NAMES = ('GHOST AI', 'LOTUS AI', 'DRAGON AI', 'VIOLET AI')
LOG = logging.getLogger('neon-kowloon')
ROOMS = {}
SESSIONS = {}
ALLOW_GUESTS = os.getenv('ALLOW_GUESTS', '1') == '1'
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID', '').strip()
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET', '').strip()
DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', '').strip()


def mono():
    return time.monotonic()


def epoch_ms():
    return int(time.time() * 1000)


@dataclass
class Rider:
    slot: int
    name: str
    user_id: str | None
    x: int
    y: int
    direction: int
    previous_x: int
    previous_y: int
    trail: list = field(default_factory=list)
    alive: bool = True
    turn: int = 0
    impact: bool = False
    impact_at: float = 1.0
    impact_deadline: float = 0.0
    crash_target: str | None = None
    impact_end: list | None = None
    died_at: float | None = None

    def payload(self):
        return dict(id=self.slot, x=self.x, y=self.y, dir=self.direction,
                    prevX=self.previous_x, prevY=self.previous_y, alive=self.alive,
                    impact=self.impact, impactAt=self.impact_at,
                    impactEnd=self.impact_end, trail=self.trail,
                    name=self.name, userId=self.user_id)


@dataclass
class Player:
    user_id: str
    name: str
    ws: web.WebSocketResponse
    slot: int | None = None
    wins: int = 0
    knockouts: int = 0
    points: int = 0
    survival: float = 0.0
    connected_at: float = field(default_factory=mono)


class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = OrderedDict()
        self.phase = 'lobby'
        self.round_number = 0
        self.bikes = []
        self.occupied = {}
        self.started_at = 0.0
        self.next_step = 0.0
        self.step_started_ms = epoch_ms()
        self.tick_ms = 142
        self.countdown_end = 0.0
        self.next_countdown_broadcast = 0.0
        self.result = None
        self.last_snapshot_at = 0.0
        self.task = asyncio.create_task(self.loop())

    def first_id(self):
        return next(iter(self.players), None)

    def assign_slot(self):
        used = {p.slot for p in self.players.values() if p.slot is not None}
        return next((i for i in range(4) if i not in used), None)

    def add_player(self, user_id, name, ws):
        old = self.players.get(user_id)
        if old:
            old.ws = ws
            old.name = name
            player = old
        else:
            slot = self.assign_slot() if self.phase in ('lobby', 'countdown', 'finished') else None
            player = Player(user_id, name[:26], ws, slot=slot)
            self.players[user_id] = player
        return player

    def remove_player(self, user_id, ws):
        player = self.players.get(user_id)
        if not player or player.ws is not ws:
            return
        if self.phase == 'playing' and player.slot is not None:
            for b in self.bikes:
                if b.user_id == user_id and b.alive:
                    b.alive = False
                    b.impact = False
                    b.died_at = mono()
        del self.players[user_id]
        if self.players and self.phase in ('lobby', 'finished'):
            self.compact_slots()

    def compact_slots(self):
        for index, player in enumerate(self.players.values()):
            player.slot = index if index < 4 else None

    def lobby_start(self, requester):
        if requester != self.first_id() or self.phase not in ('lobby', 'finished'):
            return False
        self.compact_slots()
        self.phase = 'countdown'
        self.countdown_end = mono() + 3
        self.next_countdown_broadcast = 0
        self.result = None
        return True

    def initialize_round(self):
        self.phase = 'playing'
        self.round_number += 1
        self.started_at = mono()
        self.next_step = self.started_at + .142
        self.tick_ms = 142
        self.step_started_ms = epoch_ms()
        self.bikes = []
        self.occupied = {}
        for slot, (x, y, direction) in enumerate(STARTS):
            player = next((p for p in self.players.values() if p.slot == slot), None)
            rider = Rider(slot, player.name if player else BOT_NAMES[slot],
                          player.user_id if player else None,
                          x, y, direction, x, y, [[x, y]])
            self.bikes.append(rider)
            self.occupied[x, y] = rider
        self.result = None

    def clearance(self, x, y, direction, limit=10):
        dx, dy = DIRECTIONS[direction]
        found = 0
        for k in range(1, limit + 1):
            nx, ny = x + dx * k, y + dy * k
            if not (0 <= nx < GRID and 0 <= ny < GRID) or (nx, ny) in self.occupied:
                break
            found += 1
        return found

    def bot_decision(self, b):
        ahead = self.clearance(b.x, b.y, b.direction, 10)
        left_dir = (b.direction + 3) % 4
        right_dir = (b.direction + 1) % 4
        left = self.clearance(b.x, b.y, left_dir, 11)
        right = self.clearance(b.x, b.y, right_dir, 11)
        if ahead <= 2:
            if left or right:
                b.turn = -1 if left > right else 1
        elif ahead < 5 and max(left, right) > ahead + 2:
            b.turn = -1 if left > right else 1
        elif secrets.randbelow(1000) < 22:
            side = -1 if secrets.randbelow(2) == 0 else 1
            possible = self.clearance(b.x, b.y, (b.direction + side) % 4, 9)
            if possible > max(3, ahead - 2):
                b.turn = side

    def step(self, now):
        # All riders resolve proposed moves simultaneously; no player decides collisions.
        for b in self.bikes:
            if b.alive and not b.impact and b.user_id is None:
                self.bot_decision(b)
        proposals = []
        for b in self.bikes:
            if not b.alive or b.impact:
                continue
            b.direction = (b.direction + b.turn) % 4
            b.turn = 0
            dx, dy = DIRECTIONS[b.direction]
            nx, ny = b.x + dx, b.y + dy
            edge = not (0 <= nx < GRID and 0 <= ny < GRID)
            owner = self.occupied.get((nx, ny)) if not edge else None
            proposals.append({'bike': b, 'x': nx, 'y': ny, 'edge': edge,
                              'hit': edge or owner is not None,
                              'owner': owner.user_id if owner else None})
        destinations = {}
        for p in proposals:
            destinations.setdefault((p['x'], p['y']), []).append(p)
        for collision in destinations.values():
            if len(collision) > 1:
                for p in collision:
                    p['hit'] = True
                    p['owner'] = None
        self.step_started_ms = epoch_ms()
        self.tick_ms = max(89, int(142 - (now - self.started_at) * .55))
        for p in proposals:
            b = p['bike']
            b.previous_x, b.previous_y = b.x, b.y
            b.x, b.y = p['x'], p['y']
            if p['hit']:
                b.impact = True
                b.impact_at = .23 if p['edge'] else .42
                b.impact_deadline = now + self.tick_ms / 1000 * b.impact_at
                b.crash_target = p['owner']
            else:
                b.trail.append([b.x, b.y])
                self.occupied[b.x, b.y] = b
        self.next_step = now + self.tick_ms / 1000

    def resolve_crashes(self, now):
        changed = False
        for b in self.bikes:
            if not b.alive or not b.impact or now < b.impact_deadline:
                continue
            b.alive = False
            b.died_at = now
            b.impact_end = [b.previous_x + (b.x - b.previous_x) * b.impact_at,
                            b.previous_y + (b.y - b.previous_y) * b.impact_at]
            if b.user_id and b.user_id in self.players:
                self.players[b.user_id].survival += max(0, now - self.started_at)
            owner = self.players.get(b.crash_target)
            if owner and owner.user_id != b.user_id:
                owner.knockouts += 1
                owner.points += 150
            changed = True
        return changed

    def check_end(self, now):
        alive = [b for b in self.bikes if b.alive]
        if len(alive) > 1 or any(b.impact and b.alive for b in self.bikes):
            return False
        self.phase = 'finished'
        winner = alive[0] if alive else None
        if winner and winner.user_id and winner.user_id in self.players:
            p = self.players[winner.user_id]
            p.wins += 1
            p.points += 500
            p.survival += max(0, now - self.started_at)
        for b in self.bikes:
            if b.user_id and b.user_id in self.players:
                self.players[b.user_id].points += int(max(0, (b.died_at or now) - self.started_at) * 10)
        self.result = {'winnerId': winner.user_id if winner else None,
                       'winnerName': winner.name if winner else 'DRAW',
                       'duration': round(now - self.started_at, 1)}
        for p in self.players.values():
            p.slot = p.slot if p.slot is not None else self.assign_slot()
        return True

    def payload(self):
        now = mono()
        human_rows = []
        for idx, p in enumerate(self.players.values()):
            bike = next((b for b in self.bikes if b.user_id == p.user_id), None)
            human_rows.append(dict(id=p.user_id, name=p.name, slot=p.slot,
                                   wins=p.wins, knockouts=p.knockouts,
                                   points=p.points, survival=round(p.survival, 1),
                                   alive=(bike.alive if bike else False),
                                   spectator=p.slot is None or (self.phase == 'playing' and bike is None),
                                   host=idx == 0, color=PALETTE[p.slot] if p.slot is not None else '#eeeeee'))
        bots = []
        if self.phase in ('playing', 'finished'):
            for b in self.bikes:
                if b.user_id is None:
                    bots.append(dict(id=f'bot-{b.slot}', name=b.name, slot=b.slot, wins=0,
                                     knockouts=0, points=0, survival=0, alive=b.alive,
                                     spectator=False, host=False, color=PALETTE[b.slot], bot=True))
        human_rows.sort(key=lambda p: (-p['wins'], -p['points'], -p['knockouts']))
        return {'type': 'state', 'room': self.room_id, 'phase': self.phase,
                'round': self.round_number, 'tickMs': self.tick_ms,
                'serverNow': epoch_ms(), 'stepStartedAt': self.step_started_ms,
                'elapsed': round(now - self.started_at, 2) if self.phase in ('playing', 'finished') else 0,
                'countdown': max(0, self.countdown_end - now) if self.phase == 'countdown' else 0,
                'bikes': [b.payload() for b in self.bikes], 'players': human_rows + bots,
                'result': self.result, 'maxPlayers': 4}

    async def broadcast(self):
        if not self.players:
            return
        payload = self.payload()
        targets = [p.ws for p in self.players.values() if not p.ws.closed]
        if targets:
            await asyncio.gather(*(ws.send_json(payload) for ws in targets), return_exceptions=True)

    async def loop(self):
        try:
            while True:
                now = mono()
                changed = False
                if self.phase == 'countdown':
                    if now >= self.countdown_end:
                        self.initialize_round()
                        changed = True
                    elif now >= self.next_countdown_broadcast:
                        self.next_countdown_broadcast = now + .25
                        changed = True
                elif self.phase == 'playing':
                    if self.resolve_crashes(now):
                        changed = True
                    if self.check_end(now):
                        changed = True
                    elif now >= self.next_step:
                        self.step(now)
                        changed = True
                if changed:
                    await self.broadcast()
                await asyncio.sleep(.014)
        except asyncio.CancelledError:
            return
        except Exception:
            LOG.exception('room loop failed: %s', self.room_id)


async def discord_token(request):
    if not DISCORD_CLIENT_ID or not DISCORD_CLIENT_SECRET:
        return web.json_response({'error': 'Discord OAuth credentials are not configured'}, status=503)
    try:
        data = await request.json()
        code, instance = data.get('code'), data.get('instanceId')
        if not isinstance(code, str) or len(code) > 512 or not isinstance(instance, str) or not re.fullmatch(r'[\w-]{8,160}', instance):
            raise ValueError('Invalid authorization code or instance identifier')
        async with ClientSession(timeout=__import__('aiohttp').ClientTimeout(total=12)) as client:
            async with client.post('https://discord.com/api/v10/oauth2/token',
                data={'client_id': DISCORD_CLIENT_ID, 'client_secret': DISCORD_CLIENT_SECRET,
                      'grant_type': 'authorization_code', 'code': code}) as response:
                if response.status != 200:
                    return web.json_response({'error': 'Discord authorization failed'}, status=401)
                oauth = await response.json()
            access_token = oauth['access_token']
            async with client.get('https://discord.com/api/v10/users/@me',
                headers={'Authorization': f'Bearer {access_token}'}) as response:
                if response.status != 200:
                    return web.json_response({'error': 'Discord identity verification failed'}, status=401)
                user = await response.json()
            if not DISCORD_BOT_TOKEN:
                return web.json_response({'error': 'DISCORD_BOT_TOKEN required to validate Activity membership'}, status=503)
            url = f'https://discord.com/api/v10/applications/{DISCORD_CLIENT_ID}/activity-instances/{instance}'
            async with client.get(url, headers={'Authorization': f'Bot {DISCORD_BOT_TOKEN}'}) as response:
                if response.status != 200:
                    return web.json_response({'error': 'Discord Activity instance could not be verified'}, status=403)
                activity = await response.json()
                if user['id'] not in activity.get('users', []):
                    return web.json_response({'error': 'Discord user is not a member of this Activity instance'}, status=403)
        for old_token, old_session in list(SESSIONS.items()):
            if old_session['expires'] < time.time():
                del SESSIONS[old_token]
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = {'id': user['id'], 'name': (user.get('global_name') or user['username'])[:26],
                           'instance': instance, 'expires': time.time() + 3600}
        return web.json_response({'access_token': access_token, 'game_token': token})
    except (ValueError, KeyError, TypeError):
        return web.json_response({'error': 'Invalid authorization payload'}, status=400)
    except Exception:
        LOG.exception('Discord OAuth/instance validation error')
        return web.json_response({'error': 'Discord service unavailable'}, status=502)


async def websocket(request):
    mode = request.query.get('mode', '')
    if mode == 'discord':
        token = request.query.get('token', '')
        auth = SESSIONS.get(token)
        if not auth or auth['expires'] < time.time():
            raise web.HTTPUnauthorized(text='Login to Discord again')
        user_id, name, room_id = auth['id'], auth['name'], 'd:' + auth['instance']
    elif mode == 'local' and ALLOW_GUESTS:
        room = request.query.get('room', 'KOWLOON').upper()
        if not re.fullmatch(r'[A-Z0-9_-]{1,24}', room):
            raise web.HTTPBadRequest(text='Invalid room code')
        name = re.sub(r'[^\w .-]', '', request.query.get('name', 'RIDER'))[:22].strip() or 'RIDER'
        user_id = 'g:' + secrets.token_hex(8)
        room_id = 'l:' + room
    else:
        raise web.HTTPUnauthorized(text='Guest mode disabled; launch inside Discord')
    room = ROOMS.get(room_id)
    if not room:
        room = Room(room_id)
        ROOMS[room_id] = room
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=2048)
    await ws.prepare(request)
    old = room.players.get(user_id)
    if old and not old.ws.closed:
        await old.ws.close(message=b'Replaced by new connection')
    player = room.add_player(user_id, name, ws)
    await ws.send_json({'type': 'welcome', 'id': user_id, 'room': room_id, 'slot': player.slot})
    await room.broadcast()
    try:
        async for message in ws:
            if message.type != WSMsgType.TEXT:
                continue
            try:
                data = json.loads(message.data)
            except ValueError:
                continue
            if not isinstance(data, dict):
                continue
            command = data.get('type')
            if command == 'start' and room.lobby_start(user_id):
                await room.broadcast()
            elif command == 'turn' and room.phase == 'playing' and type(data.get('side')) is int and data['side'] in (-1, 1):
                for b in room.bikes:
                    if b.user_id == user_id and b.alive and not b.impact and b.turn == 0:
                        b.turn = data['side']
                        break
            elif command == 'ping':
                await ws.send_json({'type': 'pong', 'time': epoch_ms()})
    finally:
        room.remove_player(user_id, ws)
        if not room.players:
            room.task.cancel()
            ROOMS.pop(room_id, None)
        else:
            if room.phase == 'playing':
                room.check_end(mono())
            await room.broadcast()
    return ws


async def config(request):
    return web.json_response({'clientId': DISCORD_CLIENT_ID, 'guestsAllowed': ALLOW_GUESTS})


async def index(request):
    root = DIST if (DIST / 'index.html').exists() else CLIENT
    return web.FileResponse(root / 'index.html', headers={'Cache-Control': 'no-store'})


async def frontend_asset(request):
    root = DIST if (DIST / 'index.html').exists() else CLIENT
    path = request.match_info['path']
    if path.startswith('api/') or not path or '..' in path.split('/'):
        raise web.HTTPNotFound()
    file = (root / path).resolve()
    if root == CLIENT and path == 'network.js': file = (CLIENT / 'public' / 'network.js').resolve()
    if not file.is_relative_to(root.resolve()) or not file.is_file():
        raise web.HTTPNotFound()
    return web.FileResponse(file)


def make_app():
    app = web.Application(client_max_size=4096)
    app.router.add_get('/', index)
    async def health(request):
        return web.json_response({'ok': True, 'rooms': len(ROOMS)})
    app.router.add_get('/health', health)
    app.router.add_get('/api/config', config)
    app.router.add_post('/api/token', discord_token)
    app.router.add_get('/ws', websocket)
    app.router.add_get('/{path:.*}', frontend_asset)
    return app


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    port = int(os.getenv('PORT', '3000'))
    print(f"NEON KOWLOON '97 multiplayer at http://localhost:{port}")
    web.run_app(make_app(), host=os.getenv('HOST', '0.0.0.0'), port=port)
