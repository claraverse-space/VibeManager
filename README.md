# VibeManager

Web-based development environment with terminal access, project preview, and system monitoring.

## Features

- 🖥️ Web-based terminal with tmux session management
- 📊 Real-time system monitoring (CPU, memory, disk, network)
- 🔌 Automatic port detection and preview
- 💻 VS Code in the browser (code-server)
- 🤖 Claude Code CLI pre-installed
- 📦 Node.js and npm included

## Running with Docker

### Build and run:

```bash
docker-compose up -d
```

### Access:

- **VibeManager**: http://localhost:3131
- **VS Code**: http://localhost:8083

### Stop:

```bash
docker-compose down
```

## Running locally

```bash
npm install
npm start
```

Then open http://localhost:3000

## Tools included in container

- Node.js 20
- npm
- Claude Code CLI
- code-server (VS Code)
- Git
- tmux
- Python 3
- Basic development tools
