# NEON KOWLOON '97 — Play Online Edition (V3.1)

A 3D TRON-style multiplayer light-cycle game set in neon-lit 1990s Hong Kong. Includes a live match scoreboard, up to **4 human players**, and AI players filling empty seats. Both **desktop browsers and mobile browsers** can play in the same real-time match. This package also contains the Discord Embedded App SDK integration, although Discord deployment has additional configuration.

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
