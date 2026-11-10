/** Discord SDK integration and browser one-link room join flow. */
const NK = window.NK;
const params = new URLSearchParams(location.search);
const embedded = window.parent !== window || params.has('frame_id') || params.has('instance_id');
const $ = id => document.getElementById(id);

function normalizeRoom(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0,24);
}
function newRoom() {
  const values = new Uint8Array(5);
  if (window.crypto?.getRandomValues) crypto.getRandomValues(values);
  else for (let i=0;i<values.length;i++) values[i]=Math.floor(Math.random()*256);
  return 'HK' + Array.from(values, b => b.toString(36).toUpperCase().padStart(2,'0')).join('');
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
  const room = invited || newRoom();
  const link = new URL(location.href);
  link.search = new URLSearchParams({room}).toString();
  history.replaceState(null, '', link.pathname + link.search);
  const url = link.toString();
  const panel = $('joinSetup');
  const field = $('joinName');
  const status = $('joinMessage');
  let saved = '';
  try { saved = localStorage.getItem('nk_rider_name') || ''; } catch (_) {}
  field.value = saved;
  $('joinRoomLabel').textContent = room;
  panel.classList.add('visible');
  const invite = () => shareLink(url,status);
  $('shareBefore').addEventListener('click',invite);
  $('inviteBtn').addEventListener('click',invite);
  const join = () => {
    const name = field.value.trim().replace(/[^\p{L}\p{N} _.-]/gu,'').slice(0,22) || 'RIDER';
    try { localStorage.setItem('nk_rider_name',name); } catch (_) {}
    panel.classList.remove('visible');
    $('inviteBtn').style.display='block';
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
