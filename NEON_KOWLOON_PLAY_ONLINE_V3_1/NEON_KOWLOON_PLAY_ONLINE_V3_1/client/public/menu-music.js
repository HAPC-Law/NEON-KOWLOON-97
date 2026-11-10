/* Original, procedural menu music: 'Night Ferry' (2026), composed for NEON
   KOWLOON '97. No sampled or third-party recording, no external media files. */
(() => {
  'use strict';
  let enabled = true;
  try { enabled = localStorage.getItem('nk_music_enabled') !== '0'; } catch (_) {}
  let context, master, filter, delay, feedback, timer, nextTime = 0, step = 0, phase = 'lobby';
  const $ = id => document.getElementById(id);
  const interval = 60 / 91 / 4; // 91 BPM; measured, slightly determined, melancholy
  const chord = [
    {bass:42, pad:[54,57,61,64]},  // F# minor
    {bass:38, pad:[50,54,57,61]},  // Dmaj7
    {bass:45, pad:[52,57,61,64]},  // A add9
    {bass:40, pad:[52,56,59,64]},  // E sus4
  ];
  // An original 4-bar melodic phrase, deliberately sparse and unresolved.
  const melody = {4:73, 8:71, 12:69, 18:68, 22:69, 28:66,
    34:64, 38:66, 40:69, 46:68, 52:66, 56:64, 60:61};
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  function setup() {
    if (context) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context = new Audio();
    master = context.createGain(); master.gain.value = 0;
    filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2900;
    filter.Q.value = .45;
    delay = context.createDelay(.8); delay.delayTime.value = interval * 3;
    feedback = context.createGain(); feedback.gain.value = .20;
    const wet = context.createGain(); wet.gain.value = .17;
    filter.connect(master); filter.connect(delay); delay.connect(feedback); feedback.connect(delay);
    delay.connect(wet); wet.connect(master); master.connect(context.destination);
  }
  function note(midi, start, length, gain, shape = 'triangle', brightness = 1400) {
    if (!context) return;
    const osc = context.createOscillator();
    const amp = context.createGain();
    const tone = context.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = brightness;
    osc.type = shape; osc.frequency.setValueAtTime(hz(midi),start);
    amp.gain.setValueAtTime(.0001,start);
    amp.gain.linearRampToValueAtTime(gain,start + Math.min(.055,length*.2));
    amp.gain.setTargetAtTime(.0001,start + length*.67, Math.max(.07,length*.16));
    osc.connect(tone); tone.connect(amp); amp.connect(filter);
    osc.start(start); osc.stop(start+length+.24);
    osc.onended = () => { osc.disconnect();tone.disconnect();amp.disconnect();};
  }
  function schedule(i, at) {
    const bar = Math.floor((i%64)/16), chordNotes = chord[bar], inBar = i%16;
    if (inBar === 0) for (const pitch of chordNotes.pad) note(pitch,at,interval*14,.0095,'sine',1450);
    if (inBar === 0 || inBar === 8) note(chordNotes.bass,at,interval*7,.078,'triangle',390);
    if (inBar%4 === 0) note(chordNotes.bass + 12,at,interval*1.6,.013,'sine',800);
    if (inBar===2 || inBar===6 || inBar===10 || inBar===14) {
      const arp = chordNotes.pad[(i/4 + bar)%chordNotes.pad.length | 0] + 12;
      note(arp,at,interval*1.5,.011,'triangle',1900);
    }
    const lead = melody[i%64];
    if (lead !== undefined) {
      note(lead, at, interval*3.4,.023,'sine',2400);
      note(lead-12, at, interval*3.2,.006,'triangle',1000);
    }
  }
  function pump() {
    if (!context || context.state !== 'running') return;
    // Backgrounded mobile tabs can suspend timers for minutes; never burst
    // thousands of stale notes when the player returns to the menu.
    if (nextTime < context.currentTime - .40) nextTime = context.currentTime + .05;
    while (nextTime < context.currentTime + .25) {
      schedule(step++,nextTime);
      nextTime += interval;
    }
  }
  function stop() {
    if (timer) {clearInterval(timer);timer=null;}
    if (master && context) master.gain.setTargetAtTime(0,context.currentTime,.10);
  }
  function play() {
    if (!context || context.state !== 'running' || !enabled || phase === 'playing') return;
    if (timer) return;
    nextTime = context.currentTime + .05; step = 0;
    master.gain.setTargetAtTime(.52,context.currentTime,.35);
    pump();timer = setInterval(pump,90);
  }
  async function unlock() {
    if (!enabled) return;
    try {setup();await context?.resume();play();} catch (e) {console.debug('Menu music unavailable',e);}
  }
  function updateButtons() {
    for (const id of ['musicToggleJoin','menuMusicToggle']) {
      const button = $(id);
      if (button) {button.textContent=enabled?'♪ MUSIC: ON':'♪ MUSIC: OFF';button.setAttribute('aria-pressed',String(enabled));}
    }
  }
  function toggle() {
    enabled = !enabled;
    try {localStorage.setItem('nk_music_enabled',enabled?'1':'0');} catch (_) {}
    updateButtons();
    if (enabled) unlock(); else stop();
  }
  window.NKMusic = {unlock, toggle, setPhase(value) {phase=value; if (phase==='playing')stop();else play();}};
  for (const id of ['musicToggleJoin','menuMusicToggle']) $(id)?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggle();});
  updateButtons();
  // Browser policies require audio activation by a real user gesture.
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#musicToggleJoin,#menuMusicToggle')) unlock(); }, {once:true});
  document.addEventListener('keydown', () => unlock(), {once:true});
})();
