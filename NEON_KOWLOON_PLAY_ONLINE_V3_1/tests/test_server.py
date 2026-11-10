"""Server authority, score, guest mode, WebSocket synchronization."""
import asyncio
from types import SimpleNamespace

import pytest
from aiohttp import ClientSession
from aiohttp.test_utils import TestClient, TestServer

import server


class DummyWS:
    closed = False
    async def send_json(self, data):
        self.last = data


@pytest.mark.asyncio
async def test_collision_occurs_at_wall_and_head_on_ties():
    room = server.Room('test:physics')
    try:
        a = room.add_player('p1', 'A', DummyWS())
        b = room.add_player('p2', 'B', DummyWS())
        room.initialize_round()
        game = room.bikes
        # Direct collision with a trail cell, scheduled for the visibly contacted fraction.
        game[0].x, game[0].y, game[0].direction = 14, 20, 1
        game[0].previous_x, game[0].previous_y = 14, 20
        room.occupied[15,20] = game[1]
        game[2].alive = game[3].alive = False
        before=server.mono()
        room.step(before)
        assert game[0].impact and game[0].alive
        assert game[0].impact_at == .42
        assert not room.resolve_crashes(before)
        assert room.resolve_crashes(before+0.080)
        assert not game[0].alive
        assert room.players['p2'].knockouts==1
    finally:
        room.task.cancel()


@pytest.mark.asyncio
async def test_head_on_collision_double_eliminates():
    room = server.Room('test:head-on')
    try:
        room.add_player('p1', 'A', DummyWS())
        room.add_player('p2', 'B', DummyWS())
        room.initialize_round()
        a,b=room.bikes[:2]
        a.x,a.y,a.direction=11,12,1
        b.x,b.y,b.direction=13,12,3
        room.occupied={(11,12):a,(13,12):b}
        room.bikes[2].alive=room.bikes[3].alive=False
        now=server.mono()
        room.step(now)
        assert a.impact and b.impact
        assert (a.x,a.y)==(b.x,b.y)==(12,12)
        assert not a.crash_target and not b.crash_target
        room.resolve_crashes(now + .2)
        assert not a.alive and not b.alive
        assert room.players['p1'].knockouts == 0
    finally:
        room.task.cancel()


@pytest.mark.asyncio
async def test_real_websocket_room_shared_state():
    app=server.make_app()
    async with TestClient(TestServer(app)) as client:
        a=await client.ws_connect('/ws?mode=local&room=SMOKE&name=Alpha')
        wa=await a.receive_json(timeout=2)
        await a.receive_json(timeout=2)
        b=await client.ws_connect('/ws?mode=local&room=SMOKE&name=Beta')
        wb=await b.receive_json(timeout=2)
        sb=await b.receive_json(timeout=2)
        await a.receive_json(timeout=2)
        assert wa['id']!=wb['id']
        assert len(sb['players'])==2
        # Non-host cannot begin a round.
        await b.send_json({'type':'start'})
        assert server.ROOMS['l:SMOKE'].phase=='lobby'
        await a.send_json({'type':'start'})
        start_a=await a.receive_json(timeout=2)
        assert start_a['phase']=='countdown'
        await asyncio.sleep(3.2)
        # Pull all broadcasts until both clients see playable state.
        async def see_playing(ws):
            for _ in range(30):
                state=await ws.receive_json(timeout=3)
                if state.get('phase')=='playing':return state
            raise AssertionError('no playing state')
        state_a=await see_playing(a)
        state_b=await see_playing(b)
        assert len(state_a['bikes'])==4
        assert state_a['bikes']==state_b['bikes']
        assert {x['userId'] for x in state_a['bikes'] if x['userId']}=={wa['id'],wb['id']}
        await a.close();await b.close()
    assert 'l:SMOKE' not in server.ROOMS


@pytest.mark.asyncio
async def test_invalid_join_and_config():
    async with TestClient(TestServer(server.make_app())) as client:
        cfg=await client.get('/api/config')
        assert (await cfg.json())['guestsAllowed']
        bad=await client.get('/ws?mode=local&room=../../bad')
        assert bad.status==400
        forbidden=await client.get('/ws?mode=discord&token=unverified')
        assert forbidden.status==401
        path=await client.get('/network.js')
        assert path.status==200
        assert 'window.NK' in await path.text()

@pytest.mark.asyncio
async def test_winner_and_round_scoreboard_are_server_owned():
    room=server.Room('test:winner')
    try:
        room.add_player('p1','WINNER',DummyWS())
        room.add_player('p2','LOSER',DummyWS())
        room.initialize_round()
        for b in room.bikes[1:]:
            b.alive=False
        assert room.check_end(server.mono()+7)
        assert room.phase=='finished'
        assert room.result['winnerName']=='WINNER'
        payload=room.payload()
        winner=next(p for p in payload['players'] if p['id']=='p1')
        assert winner['wins']==1
        assert winner['points']>=500
        assert payload['round']==1
        assert room.lobby_start('p2') is False
        assert room.lobby_start('p1') is True
    finally:
        room.task.cancel()


@pytest.mark.asyncio
async def test_guest_fifth_player_is_spectator():
    room=server.Room('test:limit')
    try:
        players=[room.add_player(f'p{i}',f'Rider{i}',DummyWS()) for i in range(5)]
        assert [p.slot for p in players]==[0,1,2,3,None]
        assert room.payload()['players'][-1]['spectator']
    finally:
        room.task.cancel()
