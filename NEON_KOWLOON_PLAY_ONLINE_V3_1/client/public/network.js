/* Browser networking UI. No Discord credentials or client secrets appear here. */
(() => {
  'use strict';
  const handlers = [];
  const $ = id => document.getElementById(id);
  let socket, me = null, latest = null, lastReceivedAt = performance.now(), reconnectTimer;
  let connectionConfig, closedByUser = false;
  const NK = window.NK = {
    active: true,
    playerId: null,
    state: null,
    connected: false,
    subscribe(handler) {
      handlers.push(handler);
      if (latest) handler(latest);
    },
    start() { NK.send('start'); },
    turn(side) { if (side === -1 || side === 1) NK.send('turn', {side}); },
    send(type, extra={}) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type, ...extra})); },
    interpolate() {
      if (!latest) return 0;
      if (latest.phase === 'finished') return 1;
      if (latest.phase !== 'playing') return 0;
      const tick = latest.tickMs || 142;
      // Elapsed time since the state was sent, plus server-side elapsed in this step.
      const serverPhase = latest.serverNow - latest.stepStartedAt;
      return Math.max(0, Math.min(1, (serverPhase + performance.now() - lastReceivedAt)/tick));
    },
    connectedForRound() {
      return latest?.players?.some(p=>p.id===NK.playerId && p.slot!==null && !p.spectator);
    },
    connect(config) {
      if (socket) { closedByUser = true; socket.close(); }
      closedByUser = false;
      connectionConfig = config;
      const args = new URLSearchParams({mode:config.mode});
      if (config.mode === 'discord') args.set('token', config.token);
      else { args.set('room', config.room); args.set('name', config.name); }
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const endpoint = `${proto}//${location.host}/ws?${args}`;
      socket = new WebSocket(endpoint);
      const currentSocket = socket;
      setConnection('CONNECTING TO GRID…');
      socket.addEventListener('open', () => { NK.connected = true; setConnection('● LIVE MULTIPLAYER'); });
      socket.addEventListener('message', event => {
        let data; try { data=JSON.parse(event.data); } catch (_) { return; }
        if (data.type==='welcome') { NK.playerId=data.id; NK.room=data.room; return; }
        if (data.type!=='state') return;
        latest = data; NK.state = data;
        lastReceivedAt = performance.now();
        for (const handler of handlers) try { handler(data); } catch (e) { console.error('Game state listener error',e); }
        updateBoard(data); updateOverlay(data);
      });
      socket.addEventListener('close', event => {
        if (socket !== currentSocket) return;
        NK.connected = false;
        setConnection('OFFLINE // RECONNECTING');
        if (closedByUser) return;
        clearTimeout(reconnectTimer);
        reconnectTimer=setTimeout(()=>NK.connect(connectionConfig),2200);
      });
      socket.addEventListener('error', () => setConnection('CONNECTION ERROR'));
    },
    failure(text) {
      setConnection('SETUP REQUIRED');
      const modal=$('modal'); if (modal) modal.classList.remove('hidden');
      const d=$('description'); if (d) d.textContent=text;
      const btn=$('play'); if (btn) {btn.disabled=true;btn.textContent='CHECK ACTIVITY SETUP';}
    },
  };
  function setConnection(label) { const el=$('connectionState');if (el) el.textContent=label; }
  const sanitize = value=>String(value ?? '').slice(0, 28);
  const str = (tag, text, className='') => {
    const el=document.createElement(tag);el.textContent=text;if(className) el.className=className;return el;
  };
  let lastOverlayPhase = '';
  function updateOverlay(s) {
    const panel=$('modal'),button=$('play'),desc=$('description'),foot=$('panelFoot');
    const head=$('headline'),eyebrow=$('eyebrow');
    if (!panel || !button) return;
    const own=s.players.find(p=>p.id===NK.playerId);
    const host=own?.host;
    const rider=$('status');
    if(rider && own){const title=rider.querySelector('.pilotname');if(title) title.textContent=own.name;const details=rider.querySelector('.bikeid');if(details)details.textContent=(own.spectator?'SPECTATOR':(own.color+' // RIDER '+String((own.slot||0)+1))).toUpperCase();}
    if (s.phase === 'playing') {
      panel.classList.add('hidden');
    } else {
      panel.classList.remove('hidden');
      if(s.phase==='countdown') {
        eyebrow.textContent='ALL RIDERS // PREPARE TO LAUNCH';
        head.innerHTML='ROUND<span>STARTING</span>';
        desc.textContent=`The lightcycles launch in ${Math.max(1,Math.ceil(s.countdown))}… Stay sharp. Your trail is lethal.`;
        button.disabled=true;button.textContent='READY // STANDBY';
      } else if(s.phase==='finished') {
        eyebrow.textContent='MATCH COMPLETE // HONG KONG 1997';
        head.innerHTML='ROUND<span>COMPLETE</span>';
        desc.textContent=`${sanitize(s.result?.winnerName || 'DRAW')} wins round ${s.round}. Check the live scoreboard for standings. ${host?'Start another round when everyone is ready.':'The host can start the next round.'}`;
        button.disabled=!host;button.textContent=host?'NEXT ROUND ↗':'WAITING FOR HOST';
      } else {
        eyebrow.textContent='MULTIPLAYER // KOWLOON 1997';
        head.innerHTML='NEON<span>KOWLOON</span>';
        desc.textContent=`${s.players.filter(p=>!p.bot).length} player(s) connected. Up to four friends race together; empty seats are controlled by AI. ${host?'Start when your friends have joined.':'Waiting for the room host to start.'}`;
        button.disabled=!host;button.textContent=host?'START MULTIPLAYER ↗':'WAITING FOR HOST';
      }
      foot.textContent = s.room.startsWith('d:')?'DISCORD ACTIVITY // SHARED INSTANCE':`BROWSER ROOM // ${s.room.slice(2)} // SHARE ?room=${s.room.slice(2)}`;
    }
    $('pauseBtn').disabled=true;
    $('pauseBtn').textContent='ONLINE // NO PAUSE';
    lastOverlayPhase=s.phase;
  }
  function updateBoard(s) {
    const root=$('leaderboard');if(!root) return;
    root.replaceChildren();
    const head=str('div','LIVE LEADERBOARD','lb-head');root.append(head);
    const labels=document.createElement('div');labels.className='lb-grid lb-colheads';
    for(const text of ['PILOT','W','KO','PTS'])labels.append(str('span',text));
    root.append(labels);
    const rows = [...s.players].sort((a,b)=>Number(!!a.bot)-Number(!!b.bot) || b.wins-a.wins || b.points-a.points);
    for(const player of rows){
      const row=document.createElement('div');row.className='lb-grid lb-player';
      if(player.id===NK.playerId)row.classList.add('lb-self');
      if(s.phase==='playing' && !player.alive && !player.spectator) row.classList.add('lb-dead');
      const name=str('span',`${player.host?'★ ':''}${sanitize(player.name)}${player.bot?' [AI]':''}${player.spectator?' [SPEC]':''}`,'lb-name');
      name.style.borderLeft=`3px solid ${player.color}`;name.title=player.name;
      row.append(name,str('span',String(player.wins)),str('span',String(player.knockouts)),str('span',String(player.points)));
      root.append(row);
    }
    const hint=str('div',s.phase==='playing'?`ROUND ${s.round} • ${s.bikes.filter(b=>b.alive).length} RIDERS LIVE`:
      s.phase==='countdown'?'GRID OPENS SOON':s.phase==='finished'?'ROUND ENDED':`${s.players.filter(p=>!p.bot).length}/4 PLAYERS`,'lb-foot');
    root.append(hint);
  }
})();
