/* NEON KOWLOON '97 — mobile input, spectator selection, and copyable rooms.
   No library required; buttons send input through the same WebSocket as keys. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const msg = $('inputFeedback');
  let hideAt = 0;
  function feedback(text, kind = 'info') {
    if (!msg) return;
    msg.textContent = text;
    msg.dataset.kind = kind;
    msg.classList.add('visible');
    clearTimeout(hideAt);
    hideAt = setTimeout(() => msg.classList.remove('visible'), 1300);
  }
  const controls = window.NKSteering = { feedback,
    ack(data) {
      if (data.accepted) feedback(data.side < 0 ? 'LEFT TURN ACCEPTED' : 'RIGHT TURN ACCEPTED', 'ok');
      else if (data.reason === 'turn_pending') feedback('TURN ALREADY QUEUED', 'info');
      else if (data.reason === 'not_playing') feedback('WAIT FOR THE ROUND TO START', 'info');
      else if (data.reason === 'not_riding') feedback('SPECTATING — WATCH THE RIDERS', 'info');
      else feedback('TURN NOT ACCEPTED', 'error');
    }
  };
  function steer(side, e) {
    if (e?.cancelable) e.preventDefault();
    e?.stopPropagation?.();
    const nk = window.NK;
    const s = nk?.state;
    if (!nk?.connected) { feedback('CONNECTING — WAIT FOR LIVE', 'error'); return; }
    if (!s || s.phase !== 'playing') { feedback('WAIT FOR THE ROUND TO START'); return; }
    const own = s.bikes.find(b => b.userId === nk.playerId);
    if (!own || !own.alive || own.impact) { feedback('SPECTATING — TAP WATCH TO SWITCH'); return; }
    nk.turn(side);
    feedback(side < 0 ? '↶ LEFT' : 'RIGHT ↷');
    if ('vibrate' in navigator) try { navigator.vibrate(12); } catch (_) {}
  }
  function bindButton(id, side) {
    const button = $(id);
    if (!button) return;
    let lastFired = -10000;
    const send = e => {
      lastFired = performance.now();
      button.classList.add('pressed');
      steer(side, e);
    };
    // Safari and Android Chrome: touchstart is consistently dispatched even if
    // the browser decides not to dispatch a pointerdown or synthetic click.
    button.addEventListener('touchstart', e => send(e), {passive:false});
    button.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;  // touchstart already sent it
      send(e);
    }, {passive:false});
    button.addEventListener('click', e => {
      if (performance.now() - lastFired > 350) send(e); // accessibility / old browsers
      else e.preventDefault();
    });
    const release = () => button.classList.remove('pressed');
    for (const event of ['pointerup','pointercancel','touchend','touchcancel','blur']) {
      button.addEventListener(event, release, {passive:true});
    }
  }
  bindButton('turnLeft', -1);
  bindButton('turnRight', 1);

  // A dead pilot or a player joining mid-round follows a living bike, and can
  // rotate between riders. Pilot selection is shared by WebGL and 2D fallback.
  let selectedSlot = null;
  const watchButton = $('spectateBtn');
  const watch = window.NKWatch = {
    pick(bikes) {
      const current = window.NK?.state;
      const own = bikes.find(b => b.userId && b.userId === window.NK.playerId);
      if (own?.alive) return own;
      if (current?.phase !== 'playing') return own || bikes.find(b=>b.alive) || bikes[0];
      const survivors = bikes.filter(b => b.alive);
      if (!survivors.length) return own || bikes[0];
      let target = survivors.find(b => b.id === selectedSlot);
      if (!target) { target = survivors[0]; selectedSlot = target.id; }
      return target;
    },
    sync(state) {
      if (!watchButton) return;
      const own = state.bikes?.find(b=>b.userId === window.NK.playerId);
      const watching = state.phase === 'playing' && (!own || !own.alive);
      const survivors = state.bikes?.filter(b => b.alive) || [];
      watchButton.hidden = !(watching && survivors.length);
      if (!watching) {selectedSlot = null;return;}
      if (!survivors.some(b => b.id === selectedSlot)) selectedSlot = survivors[0]?.id ?? null;
      const rider = survivors.find(b => b.id === selectedSlot);
      watchButton.textContent = `WATCH: ${rider?.name || 'RIDER'} ↻`;
      watchButton.title = 'Tap to follow the next surviving rider (V on keyboard)';
      const ownName = $('status')?.querySelector('.bikeid');
      if (ownName) ownName.textContent = `SPECTATING // ${rider?.name || 'RIDER'}`;
    },
    next() {
      const s = window.NK?.state;
      if (!s || s.phase !== 'playing') return;
      const living = s.bikes.filter(b => b.alive);
      if (!living.length) return;
      const index = living.findIndex(b => b.id === selectedSlot);
      selectedSlot = living[(index + 1) % living.length].id;
      watch.sync(s);
      feedback(`WATCHING ${living.find(b => b.id === selectedSlot)?.name || 'RIDER'}`);
    }
  };
  watchButton?.addEventListener('click', () => watch.next());
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'v' && !e.repeat && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) watch.next();
  });

  async function copyText(value, what = 'TEXT') {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        feedback(`${what} COPIED`, 'ok');
        return true;
      }
    } catch (_) { /* Clipboard permissions can differ in in-app browsers. */ }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;z-index:-1;font-size:16px';
    document.body.append(textarea);
    textarea.focus(); textarea.select(); textarea.setSelectionRange(0, value.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    textarea.remove();
    if (copied) feedback(`${what} COPIED`, 'ok');
    else { window.prompt(`Copy ${what.toLowerCase()} manually:`, value); feedback(`SELECT AND COPY ${what}`, 'info'); }
    return copied;
  }
  window.NKCopy = { copyText };
})();
