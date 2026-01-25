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
    sudo \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install code-server (browser-based VS Code)
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Create non-root user
RUN useradd -m -s /bin/bash -u 1000 vibe && \
    echo "vibe ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create directories with proper ownership
RUN mkdir -p /app /workspace /home/vibe/.local/share/projectgenerator /home/vibe/.local/bin && \
    chown -R vibe:vibe /app /workspace /home/vibe

# Install Claude Code and OpenCode as vibe user (installs to ~/.local/bin)
USER vibe
RUN curl -fsSL https://claude.ai/install.sh | bash || echo "Claude Code install failed, continuing..."
RUN curl -fsSL https://opencode.ai/install | bash || echo "OpenCode install failed, continuing..."
USER root

# Create app directory
WORKDIR /app

# Copy package files
COPY --chown=vibe:vibe package*.json ./

# Install app dependencies as vibe user
USER vibe
RUN npm install

# Copy app files
COPY --chown=vibe:vibe . .

# Switch back to root for start script (will drop privileges)
USER root

# Expose ports
EXPOSE 3000 8080

# Start script that runs services as vibe user
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Get the real user home directory from environment\n\
USER_HOME="${HOME:-/home/vibe}"\n\
\n\
# Start VibeManager as vibe user (unset PORT after starting)\n\
cd /app\n\
gosu vibe env PORT=3000 HOME="$USER_HOME" npm start &\n\
VIBE_PID=$!\n\
\n\
# Wait for VibeManager to start\n\
sleep 3\n\
\n\
# Unset PORT to prevent code-server from using it\n\
unset PORT\n\
\n\
# Start code-server as vibe user with explicit port, serving user home\n\
exec gosu vibe env -u PORT HOME="$USER_HOME" code-server --bind-addr 0.0.0.0:8080 --auth none --disable-telemetry "$USER_HOME"\n\
' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]
