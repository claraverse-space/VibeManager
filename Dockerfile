FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install basic tools and dependencies
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
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install code-server (browser-based VS Code)
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Install Claude Code CLI globally via npm
RUN npm install -g @anthropic-ai/claude-code || echo "Claude Code install failed, continuing..."

# Install OpenCode (if available via npm or other method)
# Note: OpenCode may need specific installation instructions
RUN npm install -g opencode || echo "OpenCode not available via npm"

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
