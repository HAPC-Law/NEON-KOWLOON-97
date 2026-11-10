# NEON KOWLOON '97 — Online Multiplayer V3.2

A 3D TRON-style multiplayer light-cycle game set in neon-lit 1990s Hong Kong. Includes a live match scoreboard, up to **4 human players**, and AI players filling empty seats. Both **desktop browsers and mobile browsers** can play in the same real-time match. This package also contains the Discord Embedded App SDK integration, although Discord deployment has additional configuration.

## UPDATE YOUR EXISTING RENDER GAME (IMPORTANT)

The download ZIP for V3.2 contains the folder `NEON_KOWLOON_PLAY_ONLINE_V3_1` **on purpose**. Your live GitHub repository currently uses that exact directory name and your Render Blueprint has `rootDir: NEON_KOWLOON_PLAY_ONLINE_V3_1`. **Do not rename the directory or create a second Render service.**

1. Extract the V3.2 ZIP.
2. Open your existing `HAPC-Law/NEON-KOWLOON-97` GitHub repository, then the **`NEON_KOWLOON_PLAY_ONLINE_V3_1`** directory.
3. Replace the updated files with the contents of the V3.2 ZIP's directory, preserving `client/public/`, `client/index.html`, `client/sdk-bootstrap.js`, `server.py`, `render.yaml` and all other subfolders. If GitHub's browser upload does not overwrite existing files, edit or delete/replace them individually, or upload with Git on your computer. Keep the exact directory structure.
4. **Commit** the changes to `main`. Render should rebuild the existing web service; if not, use **Manual Deploy → Deploy latest commit**.
5. Wait until Render reports **Live** and reload https://neon-kowloon-97.onrender.com. On your girlfriend's phone, fully reload the page (close/reopen the browser tab if needed).

The original live URL stays the same. No local Python installation is required.

## CHANGES IN V3.2

- **Phone steering:** iOS `touchstart` input, Android pointer support, click fallback, large accessible buttons and a server `turn_ack` indicator. After tapping a steering button, the screen reports whether the server accepted the turn. Press the buttons while a round is **PLAYING**, not while waiting in the lobby or after your rider is eliminated.
- **Spectator camera:** follows a living rider automatically after you crash or if you join mid-round. Use **WATCH: ... ↻** on mobile, or **V** on desktop, to cycle between survivors. **C** still changes camera angle.
- **Room codes:** dedicated **COPY ROOM CODE**, **COPY LINK** and optional **JOIN BY CODE** controls in the lobby; copy buttons persist during a match. Newly created room codes are shorter, but existing longer room-code URLs remain valid.
- **Menu music:** *Night Ferry*, an original melancholic/determined 91-BPM synthesized score. Composed for this game, generated live in the browser without any third-party recording. Music plays in the menus, fades away while playing, and can be switched off. Browsers only enable sound after you tap or click the page.
- **Cache:** serving gameplay scripts with `no-store` so players receive a newly deployed version.

### Phone testing

1. Both players enter the same room, join, and the host clicks **START MULTIPLAYER**. Wait for the three-second countdown.
2. On the phone, confirm the **LEFT** and **RIGHT** buttons are visible at the bottom during play. Tap **LEFT** and look for **LEFT TURN ACCEPTED**. If the game says **WAIT FOR THE ROUND TO START**, you are still in the lobby/countdown. If it says **SPECTATING**, the rider is already eliminated.
3. Test **COPY CODE**, then paste the copied code into a message. Test **COPY LINK** and send the link to your second device.
4. After elimination, press **WATCH** to follow surviving bikes.

**Verification note:** The Python server unit tests pass; the mobile-browser screen and input wiring are tested in a headless browser simulation. Actual iOS/Android devices and live Render deployment still need confirmation.

---

## Simplest way for two people to play from different locations

**Only the person putting the game online needs to do these steps. Guests need nothing except a link.**

1. Create a free account at [GitHub](https://github.com) and a **new repository** (e.g., `neon-kowloon`).
2. Upload **the contents of this folder** to the repository (not the ZIP itself), preserving the directories. The root of your repository must contain `Dockerfile`, `render.yaml`, `server.py`, `client/`, `requirements.txt`, `package.json`, and `vite.config.js`.
3. Create an account at [Render](https://dashboard.render.com) and connect your GitHub account.
4. In Render, choose **New → Blueprint**, select that GitHub repository, and approve the deployment defined by `render.yaml`. The Blueprint deploys the **Docker web service** (Python server plus built frontend) on the free tier. You can also choose **New → Web Service** and use Docker as the runtime, then choose the Free instance type.
5. When the service shows **Live**, open its URL, generally `https://neon-kowloon-97.onrender.com` or another Render-assigned hostname. The exact URL is shown in Render; do not assume the example URL belongs to you.
6. The game creates a random private room link. Enter your rider name and tap **Share Invite**. Send that exact link to your girlfriend. She opens it on her phone and enters her name. You both press **JOIN GAME**. The first player in the room presses **START MULTIPLAYER** once everyone has arrived.
7. Race using **left/right keys on desktop**, or the **large on-screen left/right buttons on phones**. The mobile **SCORES** button opens the live leaderboard; **INVITE FRIEND** shares the room again.

**No Python or Node.js installation is required on either player's device** once hosted. Render builds and runs the backend and frontend remotely. The two players do not need Discord or a paid game account.

### Free hosting limitations

Render's Free Web Services currently stop after **15 minutes without traffic**, then restart after the next request (often about a minute). They have monthly usage limits and can restart unexpectedly. Sessions/scoreboard totals are stored **in memory** and can be lost when the host restarts. A link is a room invite, not a secure password. For a private hobby game this can be acceptable; for reliable public launch use a paid instance, access controls and persistent score storage.

Useful docs: [Render Free Services](https://render.com/docs/free), [Render Blueprints](https://render.com/docs/infrastructure-as-code).

## Phone requirements

- Modern Safari on iPhone or Chrome on Android; a reasonably recent device recommended for 3D graphics.
- A working internet connection. The game is rendered in the phone's browser, so device performance matters.
- Landscape orientation is recommended for the best view of the arena, but the lobby and controls adapt to portrait as well.
- Touch left/right controls, swipe steering, a collapsible leaderboard and invite button are included.

## Discord Activity support (optional)

The frontend bundles the Discord Embedded App SDK during the Docker build. To run inside Discord:

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). Enable Activities, supported platforms (including **iOS/Android** if desired), and configure OAuth as required by Discord.
2. In the Render service environment, securely set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_BOT_TOKEN`. **Never publish secrets in GitHub or the client.**
3. Add an Activity URL mapping from `/` to your Render hostname (the mapping target excludes `https://`).
4. Test by opening the Activity inside Discord with two participating accounts. They should land in the same Activity-instance match. This step has **not** been verified against a live Discord application, and Discord publication/review is not complete.

**Important:** This build defaults to `ALLOW_GUESTS=1` so your girlfriend can simply open the website. If you later want Discord-only access, change this environment variable to `0`. The Discord and normal browser modes create different rooms.

## Local play (optional; *not* needed for online hosting)

- Windows: If Python 3.11+ is installed, run `RUN_LOCAL_WINDOWS.bat` and open `http://localhost:3000/`.
- macOS/Linux: `python -m pip install -r requirements.txt && python server.py`.
- A local server only works from the same device/LAN unless you separately configure internet hosting.
- `python -m pytest -q tests` runs the Python multiplayer tests (pytest packages required).
- `npm install && npm run build` builds the Discord-compatible frontend into `dist/` (Node.js 20+).

## Gameplay and scoring

- 1–4 human riders; bots fill empty slots. You can spectate and join the following round if all slots are full.
- Continuous motion with 90° left/right turns. Trails are solid; collisions eliminate riders.
- The authoritative Python WebSocket server controls movement, collisions, round outcomes and scores.
- Live scoreboard includes rider name, round wins (W), knockouts (KO), and points (PTS).
- Scores last within a room session, not permanently across site restarts.
- The first person to join is host and starts the next round; no global pause.

## Included files

`Dockerfile`, `render.yaml`, `server.py`, `client/index.html`, `client/sdk-bootstrap.js`, `client/public/network.js`, `requirements.txt`, `package.json`, `vite.config.js`, `.env.example`, `tests/`, and local launch scripts.

## Tests and limits

Backend two-client synchronization and scoring were tested in the earlier multiplayer version. This revision adds a mobile browser lobby and deploy configuration; it is not yet live-hosted on Render, and real-world phone / Discord Activity compatibility must be confirmed on actual devices. Do not mistake the included config for an active hosted game URL.
