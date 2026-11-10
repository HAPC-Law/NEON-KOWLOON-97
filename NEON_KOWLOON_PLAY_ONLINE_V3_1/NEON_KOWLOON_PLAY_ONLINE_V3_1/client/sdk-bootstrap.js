/** Discord SDK integration and browser one-link room join flow. */
const NK = window.NK;
const params = new URLSearchParams(location.search);
const embedded = window.parent !== window || params.has('frame_id') || params.has('instance_id');
const $ = id => document.getElementById(id);

function normalizeRoom(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0,24);
}
function newRoom() {
  const numbers = new Uint32Array(1);
  if (window.crypto?.getRandomValues) crypto.getRandomValues(numbers);
  else numbers[0] = Math.floor(Math.random()*0x100000000);
  return 'HK' + numbers[0].toString(36).toUpperCase().padStart(6,'0').slice(-6);
}

async function shareLink(url, status) {
  try {
    if (navigator.share) {
      await navigator.share({title:"NEON KOWLOON '97", text:'Race me in Neon Kowloon!', url});
      if (status) status.textContent='Invite ready to send.';
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      if (status) status.textContent='Invite link copied. Send it to your friend.';
    } else {
      window.prompt('Copy and send this invite link:', url);
      if (status) status.textContent='Copy the link and send it to your friend.';
    }
  } catch (error) {
    if (error?.name !== 'AbortError' && status) status.textContent='Unable to share automatically. Copy the URL from your browser.';
  }
}
function startBrowserRoom() {
  const invited = params.has('room') && normalizeRoom(params.get('room'));
  let room = invited || newRoom();
  const link = new URL(location.href);
  const panel = $('joinSetup');
  const field = $('joinName');
  const roomInput = $('joinCodeInput');
  const status = $('joinMessage');
  let saved = '';
  try { saved = localStorage.getItem('nk_rider_name') || ''; } catch (_) {}
  field.value = saved;
  function changeRoom(next) {
    room = normalizeRoom(next);
    if (!room) {status.textContent='Enter a valid room code first.'; return false;}
    link.search = new URLSearchParams({room}).toString();
    history.replaceState(null, '', link.pathname + link.search);
    $('joinRoomLabel').textContent = room;
    $('activeRoomLabel').textContent = `ROOM ${room}`;
    return true;
  }
  changeRoom(room);
  panel.classList.add('visible');
  const invite = () => shareLink(link.toString(),status);
  const copyCode = () => window.NKCopy.copyText(room,'ROOM CODE');
  const copyLink = () => window.NKCopy.copyText(link.toString(),'INVITE LINK');
  $('shareBefore').addEventListener('click',invite);
  $('inviteBtn').addEventListener('click',invite);
  $('copyCodeBefore').addEventListener('click',copyCode);
  $('copyLinkBefore').addEventListener('click',copyLink);
  $('copyCodeBtn').addEventListener('click',copyCode);
  $('copyLinkBtn').addEventListener('click',copyLink);
  const useCode = () => {
    if (changeRoom(roomInput.value)) {
      status.textContent=`Joining room ${room}. Press JOIN GAME when ready.`;
      roomInput.value = '';
    }
  };
  $('useRoomCode').addEventListener('click',useCode);
  roomInput.addEventListener('keydown', e => {if(e.key==='Enter') {e.preventDefault(); useCode();}});
  const join = () => {
    // If a code has been typed but USE CODE has not been pressed, apply it now.
    if (roomInput.value.trim() && !changeRoom(roomInput.value)) return;
    const name = field.value.trim().replace(/[^\p{L}\p{N} _.-]/gu,'').slice(0,22) || 'RIDER';
    try { localStorage.setItem('nk_rider_name',name); } catch (_) {}
    panel.classList.remove('visible');
    $('roomTools').classList.add('visible');
    NK.connect({mode:'local',room,name});
  };
  $('joinNow').addEventListener('click',join);
  field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();join()}});
}

try {
  const config = await fetch('/api/config',{cache:'no-store'}).then(r=>{
    if(!r.ok) throw new Error('Could not reach the multiplayer server.');
    return r.json();
  });
  if (embedded) {
    if (!config.clientId) throw new Error('DISCORD_CLIENT_ID is missing on the server.');
    const {DiscordSDK} = await import('@discord/embedded-app-sdk');
    const sdk = new DiscordSDK(config.clientId);
    await sdk.ready();
    const {code} = await sdk.commands.authorize({
      client_id:config.clientId, response_type:'code', state:'', prompt:'none', scope:['identify']
    });
    const authResponse = await fetch('/api/token',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code,instanceId:sdk.instanceId})
    });
    const tokens = await authResponse.json();
    if(!authResponse.ok) throw new Error(tokens.error || 'Discord OAuth exchange failed.');
    const auth = await sdk.commands.authenticate({access_token:tokens.access_token});
    if(!auth?.user?.id) throw new Error('Discord SDK could not authenticate the rider.');
    NK.connect({mode:'discord',token:tokens.game_token});
  } else if(config.guestsAllowed) {
    startBrowserRoom();
  } else {
    NK.failure('This deployment accepts verified Discord Activity sessions only. Launch the Activity through Discord.');
  }
} catch(error) {
  console.error(error);
  NK.failure(error?.message || 'Could not connect to the multiplayer server.');
}
