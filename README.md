<div align="center">

```
 ██╗   ██╗██╗██████╗ ███████╗███╗   ███╗ █████╗ ███╗   ██╗ █████╗  ██████╗ ███████╗██████╗
 ██║   ██║██║██╔══██╗██╔════╝████╗ ████║██╔══██╗████╗  ██║██╔══██╗██╔════╝ ██╔════╝██╔══██╗
 ██║   ██║██║██████╔╝█████╗  ██╔████╔██║███████║██╔██╗ ██║███████║██║  ███╗█████╗  ██████╔╝
 ╚██╗ ██╔╝██║██╔══██╗██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║██╔══██║██║   ██║██╔══╝  ██╔══██╗
  ╚████╔╝ ██║██████╔╝███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║██║  ██║╚██████╔╝███████╗██║  ██║
   ╚═══╝  ╚═╝╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
```

### The Development Environment for AI Coding Agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)

**Manage AI coding sessions. Access from anywhere. Ship faster.**

[Install](#-quick-install) · [Features](#-features) · [Documentation](#-documentation) · [Contributing](#-contributing)

</div>

---

## Why VibeManager?

You're running Claude Code, OpenCode, or other AI agents on your dev machine. But:

- **You want to check on them from your phone** while grabbing coffee
- **You need multiple sessions** running different projects simultaneously
- **You want a real terminal** not some web-based toy
- **You need it to just work** without complex setup

VibeManager gives you a **single command install**, **remote access from anywhere**, and a **beautiful interface** to manage all your AI coding sessions.

---

## ⚡ Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash
```

Then initialize and start:

```bash
vibemanager init
```

That's it. Open `http://localhost:3131` and create your account.

---

## ✨ Features

### 🤖 AI Agent Support
Run **Claude Code**, **OpenCode**, or plain **bash** sessions. Switch between them instantly. Each session is isolated with its own tmux workspace.

### 🌐 Access From Anywhere
Works with **Tailscale**, **Cloudflare Tunnel**, **ngrok**, or any tunneling method. Built-in authentication keeps your sessions secure.

### 📱 Mobile Ready
Full PWA support. Check your AI agents from your phone, tablet, or any device with a browser.

### 💻 Real Terminal
Not a fake web terminal. Full **xterm.js** with proper PTY handling, colors, scrollback, and keyboard shortcuts.

### 🔧 Integrated Code Editor
Embedded **VS Code** via code-server. Edit files without leaving the interface.

### 📊 System Monitoring
Real-time CPU, memory, disk, and network stats. See exactly what your agents are doing to your system.

### 🔌 Preview Ports
Running a dev server? Preview it directly in the interface, even when accessing remotely.

---

## 🖥️ Screenshots

<div align="center">
<table>
<tr>
<td align="center"><b>Terminal Sessions</b></td>
<td align="center"><b>System Monitor</b></td>
</tr>
<tr>
<td><img src="docs/screenshots/terminal.png" width="400" alt="Terminal View"/></td>
<td><img src="docs/screenshots/monitor.png" width="400" alt="System Monitor"/></td>
</tr>
<tr>
<td align="center"><b>Code Editor</b></td>
<td align="center"><b>Mobile View</b></td>
</tr>
<tr>
<td><img src="docs/screenshots/code.png" width="400" alt="Code Editor"/></td>
<td><img src="docs/screenshots/mobile.png" width="400" alt="Mobile View"/></td>
</tr>
</table>
</div>

---

## 🚀 Getting Started

### Prerequisites

- **Bun** - [Install Bun](https://bun.sh) (the installer will prompt you)
- **tmux** - Terminal multiplexer (`apt install tmux` or `brew install tmux`)
- **code-server** (optional) - For integrated editor

### Installation

**Option 1: One-liner (Recommended)**
```bash
curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash
vibemanager init
```

**Option 2: From Source**
```bash
git clone https://github.com/claraverse-space/VibeManager.git
cd VibeManager
bun install
bun run db:migrate
bun run dev
```

### Remote Access

VibeManager works with any tunneling solution:

**Tailscale (Recommended)**
```bash
# Install Tailscale, then access via your Tailscale IP
http://100.x.x.x:3131
```

**Cloudflare Tunnel**
```bash
cloudflared tunnel --url http://localhost:3131
```

**ngrok**
```bash
ngrok http 3131
```

---

## 📖 Documentation

### CLI Commands

| Command | Description |
|---------|-------------|
| `vibemanager init` | First-time setup - checks deps, runs migrations, starts server |
| `vibemanager start` | Start the server |
| `vibemanager stop` | Stop the server |
| `vibemanager status` | Show server status and access URLs |

### API Reference

<details>
<summary><b>REST Endpoints</b></summary>

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions |
| `/api/sessions` | POST | Create a new session |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id` | DELETE | Delete a session |
| `/api/sessions/:id/stop` | POST | Stop a session |
| `/api/sessions/:id/revive` | POST | Revive a dead session |
| `/api/system` | GET | System stats |
| `/api/system/ports` | GET | Listening ports |
| `/api/system/access-urls` | GET | Available access URLs |
| `/api/auth/login` | POST | Login |
| `/api/auth/logout` | POST | Logout |

</details>

<details>
<summary><b>WebSocket Endpoints</b></summary>

| Endpoint | Description |
|----------|-------------|
| `ws://.../ws?session=<name>&token=<token>` | Terminal I/O streaming |
| `ws://.../status?token=<token>` | Real-time status updates |

</details>

### Project Structure

```
VibeManager/
├── apps/
│   ├── server/           # Bun + Hono backend
│   │   └── src/
│   │       ├── routes/   # REST API endpoints
│   │       ├── services/ # Business logic
│   │       ├── ws/       # WebSocket handlers
│   │       ├── db/       # Drizzle ORM schema
│   │       └── middleware/
│   └── web/              # React frontend
│       └── src/
│           ├── components/
│           ├── stores/   # Zustand state
│           ├── hooks/
│           └── pages/
├── packages/
│   └── shared/           # Shared types & validation
├── cli/                  # CLI tool
└── install.sh           # Installer script
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3131` | Server port |
| `CODE_PORT` | `8443` | code-server port |

Data stored in `~/.local/share/vibemanager/`

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | [Bun](https://bun.sh) |
| **Backend** | [Hono](https://hono.dev) |
| **Frontend** | [React 18](https://react.dev) + [Vite](https://vitejs.dev) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com) |
| **State** | [Zustand](https://zustand-demo.pmnd.rs/) + [TanStack Query](https://tanstack.com/query) |
| **Database** | SQLite + [Drizzle ORM](https://orm.drizzle.team) |
| **Terminal** | [xterm.js](https://xtermjs.org) + tmux |
| **Editor** | [code-server](https://github.com/coder/code-server) |

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development

```bash
# Clone and install
git clone https://github.com/claraverse-space/VibeManager.git
cd VibeManager
bun install

# Run development servers
bun run dev

# Run type checking
bun run typecheck

# Run linting
bun run lint
```

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built for AI-powered development workflows**

[Report Bug](https://github.com/claraverse-space/VibeManager/issues) · [Request Feature](https://github.com/claraverse-space/VibeManager/issues)

</div>
