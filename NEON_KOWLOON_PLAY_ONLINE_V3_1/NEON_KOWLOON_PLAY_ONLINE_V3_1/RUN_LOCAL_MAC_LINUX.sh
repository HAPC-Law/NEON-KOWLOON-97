#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt
printf '\nOpen http://localhost:3000/?room=KOWLOON in a browser.\n\n'
python3 server.py
