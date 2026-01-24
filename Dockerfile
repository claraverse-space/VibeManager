FROM node:20-bullseye

# Install basic tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    vim \
    nano \
    tmux \
    htop \
    build-essential \
    python3 \
    python3-pip \
    net-tools \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install code-server (browser-based VS Code)
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Install Claude Code CLI
RUN curl -fsSL https://raw.githubusercontent.com/anthropics/claude-code/main/install.sh | bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app files
COPY . .

# Create workspace directory
RUN mkdir -p /workspace

# Expose ports
# 3000 - VibeManager app
# 8080 - code-server (VS Code)
EXPOSE 3000 8080

# Start script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Start VibeManager in background\n\
cd /app\n\
PORT=3000 npm start &\n\
VIBE_PID=$!\n\
\n\
# Wait a bit for VibeManager to start\n\
sleep 3\n\
\n\
# Unset PORT to prevent code-server from using it\n\
unset PORT\n\
\n\
# Start code-server with explicit port\n\
exec code-server --bind-addr 0.0.0.0:8080 --auth none --disable-telemetry /workspace\n\
' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]
