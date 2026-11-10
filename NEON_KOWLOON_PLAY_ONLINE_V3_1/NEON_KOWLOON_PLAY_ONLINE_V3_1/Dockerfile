# Build Discord-compatible frontend and browser multiplayer website.
FROM node:22-alpine AS frontend
WORKDIR /build
COPY package.json vite.config.js ./
COPY client ./client
RUN npm install --no-audit --no-fund && npm run build

# Run the authoritative game server and serve the built client over HTTPS at the host.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=10000 ALLOW_GUESTS=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./
COPY --from=frontend /build/dist ./dist
EXPOSE 10000
CMD ["python", "server.py"]
