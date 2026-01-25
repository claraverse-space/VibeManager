# VibeManager

**AI Coding Session Manager** - Run multiple autonomous AI coding agents (Claude Code, OpenCode) and monitor them from a single dashboard.

Perfect for kicking off multiple AI coding sessions on your Raspberry Pi or server, then checking back later to see what they've built.

```
  _    _____ __          __  ___
 | |  / /  _/ /_  ___   /  |/  /___ _____  ____ _____ ____  _____
 | | / // // __ \/ _ \ / /|_/ / __ `/ __ \/ __ `/ __ `/ _ \/ ___/
 | |/ // // /_/ /  __// /  / / /_/ / / / / /_/ / /_/ /  __/ /
 |___/___/_.___/\___//_/  /_/\__,_/_/ /_/\__,_/\__, /\___/_/
                                              /____/
```

## Quick Install

**One-line install** (Linux, macOS, WSL):

```bash
curl -fsSL https://raw.githubusercontent.com/claraverse/vibemanager/main/install.sh | bash
```

The installer will ask you to choose:
1. **Docker** (recommended) - Isolated container with all dependencies
2. **Local** - Direct installation on your system

Both options auto-start on boot.

### Direct Install Commands

```bash
# Install with Docker (recommended)
curl -fsSL https://raw.githubusercontent.com/claraverse/vibemanager/main/install.sh | bash -s -- --docker

# Install locally without Docker
curl -fsSL https://raw.githubusercontent.com/claraverse/vibemanager/main/install.sh | bash -s -- --local

# Uninstall
curl -fsSL https://raw.githubusercontent.com/claraverse/vibemanager/main/install.sh | bash -s -- --uninstall
```

## Features

- **Dashboard** - Monitor all your AI coding sessions at a glance
- **Multi-Agent Support** - Run Claude Code, OpenCode, or plain bash
- **Autonomous Mode** - `--dangerously-skip-permissions` for hands-free coding
- **Live Terminal** - Attach to any session directly in browser
- **VS Code Integration** - Built-in code-server for editing
- **System Monitor** - CPU, memory, temperature stats (great for Raspberry Pi)
- **Dark/Light Theme** - Easy on the eyes
- **Mobile Friendly** - Works on phone and tablet

## Platform Support

| Platform | Docker | Local | Notes |
|----------|--------|-------|-------|
| Linux (x64/ARM64) | ✅ | ✅ | Recommended for servers, Raspberry Pi |
| macOS (Intel/Apple Silicon) | ✅ | ✅ | Full support |
| WSL2 | ✅ | ✅ | Windows Subsystem for Linux |
| Windows | ✅ | ❌ | Use Docker Desktop |

## Manual Installation

### Option 1: Docker

```bash
git clone https://github.com/claraverse/vibemanager.git
cd vibemanager
docker compose up -d
```

**Ports:**
- `3131` - VibeManager web UI
- `8083` - VS Code (code-server)

### Option 2: Local

```bash
git clone https://github.com/claraverse/vibemanager.git
cd vibemanager
npm install
npm start
```

**Requirements:** Node.js 18+, tmux, git

## Usage

### Creating a Session

1. Open `http://localhost:3131`
2. Click **"+ New Project"**
3. Enter session name and select project folder
4. Choose: **OpenCode**, **Claude**, or **Bash**
5. Enable **Autonomous Mode** for hands-free operation
6. Add **Initial Prompt** (e.g., "Build a REST API with user auth")
7. Click **Create & Open**

### Views

| View | Description |
|------|-------------|
| **Dashboard** | All sessions with status, stats, quick actions |
| **Terminal** | Live tmux terminal |
| **Code** | VS Code editor |
| **Preview** | Live preview (auto-detects ports) |
| **Split** | Terminal + Preview |

## Service Management

### Linux/WSL (systemd)

```bash
sudo systemctl status vibemanager   # Status
sudo systemctl restart vibemanager  # Restart
sudo systemctl stop vibemanager     # Stop
journalctl -u vibemanager -f        # Logs
```

### macOS (launchd)

```bash
launchctl list | grep vibemanager   # Status
launchctl stop com.vibemanager      # Stop
launchctl start com.vibemanager     # Start
```

### Docker

```bash
docker compose ps        # Status
docker compose restart   # Restart
docker compose logs -f   # Logs
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3131` | Web UI port |
| `VIBEMANAGER_DIR` | `~/.vibemanager` | Install directory |
| `VIBEMANAGER_PORT` | `3131` | Web UI port |
| `VIBEMANAGER_CODE_PORT` | `8083` | VS Code port |

## API

```bash
# Health
curl http://localhost:3131/api/health

# Sessions
curl http://localhost:3131/api/sessions

# Create session
curl -X POST http://localhost:3131/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name":"myproject","projectPath":"/home/user/myproject","shell":"claude","autonomous":true}'

# System stats
curl http://localhost:3131/api/system
```

### WebSocket

Real-time updates at `ws://localhost:3131/status`

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  VibeManager                     │
├──────────────────────────────────────────────────┤
│  Dashboard │ Terminal │ VS Code │ Preview        │
├──────────────────────────────────────────────────┤
│           Express + WebSocket Server             │
├──────────────────────────────────────────────────┤
│              Session Manager (tmux)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ Claude  │ │OpenCode │ │  Bash   │   ...      │
│  └─────────┘ └─────────┘ └─────────┘            │
└──────────────────────────────────────────────────┘
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/claraverse/vibemanager/main/install.sh | bash -s -- --uninstall
```

## License

MIT

---

Built for engineers who like to sleep while their AI codes.
