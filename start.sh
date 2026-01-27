#!/bin/bash
# VibeManager Startup Script

# Load environment variables from .env
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Start the server
exec node server.js
