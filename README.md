# VibeManager V2

A streamlined development environment manager for AI-powered coding agents.

## Features

- **Session Management**: Create, manage, and switch between terminal sessions
- **Terminal Integration**: Full xterm.js terminal with WebSocket streaming
- **Agent Support**: Works with OpenCode, Claude CLI, or bash
- **Code Server**: Embedded VS Code via code-server
- **Preview Pane**: Preview your running applications
- **System Monitor**: Real-time CPU, memory, disk, and network stats
- **Mobile Ready**: PWA support with responsive design

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Zustand, TanStack Query
- **Backend**: Bun, Hono, Drizzle ORM, SQLite
- **Terminal**: xterm.js, node-pty, tmux

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [tmux](https://github.com/tmux/tmux) terminal multiplexer
- (Optional) [code-server](https://github.com/coder/code-server) for embedded editor
- (Optional) [OpenCode](https://github.com/opencode-ai/opencode) or [Claude CLI](https://github.com/anthropics/claude-code)

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Run database migrations:
   ```bash
   bun run db:migrate
   ```

3. Start development servers:
   ```bash
   # Start both server and web
   bun run dev

   # Or separately
   bun run dev:server  # Backend on port 3131
   bun run dev:web     # Frontend on port 5173
   ```

4. Open http://localhost:5173 in your browser

## Project Structure

```
VibeManagerV2/
├── apps/
│   ├── server/          # Hono backend
│   │   └── src/
│   │       ├── routes/  # API routes
│   │       ├── services/# Business logic
│   │       ├── ws/      # WebSocket handlers
│   │       ├── db/      # Drizzle schema
│   │       └── lib/     # Utilities
│   └── web/             # React frontend
│       └── src/
│           ├── components/
│           ├── hooks/
│           ├── stores/
│           ├── lib/
│           └── pages/
├── packages/
│   └── shared/          # Shared types & validation
└── e2e/                 # Playwright tests
```

## API Endpoints

### REST
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/:id/stop` - Stop session
- `POST /api/sessions/:id/revive` - Revive session
- `GET /api/system` - System stats
- `GET /api/browse` - Browse directories

### WebSocket
- `ws://?session=<name>` - Terminal streaming
- `ws:///status` - Real-time status updates

## Configuration

Environment variables:
- `PORT` - Server port (default: 3131)
- `CODE_PORT` - code-server port (default: 8083)

Data is stored in `~/.local/share/vibemanager/`:
- `vibemanager.db` - SQLite database

## License

MIT
