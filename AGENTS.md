# AGENTS.md

> Context file for AI coding agents working on VibeManager V2

## Project Overview

VibeManager V2 is a full-stack development environment manager for AI-powered coding agents. It provides terminal session management, real-time system monitoring, and integrated code editing through a web interface.

**Tech Stack:**
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query, xterm.js
- Backend: Bun runtime, Hono framework, Drizzle ORM, SQLite, WebSockets
- Terminal: tmux for session multiplexing, node-pty for PTY handling

## Setup Commands

```bash
# Install dependencies
bun install

# Run database migrations (required before first run)
bun run db:migrate

# Start development (both frontend and backend)
bun run dev

# Start individually
bun run dev:server  # Backend on port 3131
bun run dev:web     # Frontend on port 5173
```

## Architecture

This is a **Bun workspace monorepo** with three packages:

```
apps/server/     → Backend API and WebSocket server (@vibemanager/server)
apps/web/        → React frontend application (@vibemanager/web)
packages/shared/ → Shared types, validation, constants (@vibemanager/shared)
```

### Key Directories

**Backend (`apps/server/src/`):**
- `routes/` - REST API endpoints (sessions, system, browse, health)
- `services/` - Business logic (SessionService, SystemMonitor, ActivityService)
- `ws/` - WebSocket handlers (terminal streaming, status updates)
- `db/` - Drizzle schema and migrations
- `lib/` - Utilities (tmux wrapper, tool detection)

**Frontend (`apps/web/src/`):**
- `components/` - React components organized by feature
- `stores/` - Zustand state stores (session, terminal, UI)
- `hooks/` - Custom hooks for WebSocket connections and data fetching
- `pages/` - Page components (Dashboard)
- `lib/` - API client and utilities

**Shared (`packages/shared/src/`):**
- `types.ts` - TypeScript interfaces for all data models
- `validation.ts` - Zod schemas for request/response validation
- `constants.ts` - Shared constants (ports, paths, thresholds)

## Code Style

### TypeScript
- Strict mode enabled (`strict: true`)
- ESNext target with bundler module resolution
- No unused locals or parameters allowed
- Use absolute imports with `@vibemanager/shared` alias

### React
- Functional components only
- Zustand for client state, TanStack Query for server state
- Tailwind CSS for styling (no CSS modules)
- Radix UI for headless components

### Backend
- Hono framework patterns for routes
- Drizzle ORM for database operations
- WebSocket connections for real-time features
- Services encapsulate business logic

### Naming Conventions
- Files: `camelCase.ts` for utilities, `PascalCase.tsx` for components
- Types/Interfaces: PascalCase
- Functions/variables: camelCase
- Constants: SCREAMING_SNAKE_CASE (in constants.ts)

## Testing

```bash
# Run unit tests
bun run test

# Run E2E tests (requires Playwright)
bun run test:e2e

# Type checking
bun run typecheck
```

## Linting & Formatting

```bash
# Lint
bun run lint

# Format with Prettier
bun run format
```

ESLint and Prettier are configured. Run before committing.

## Database

SQLite database stored at `~/.local/share/vibemanager/vibemanager.db`

```bash
# Generate new migrations after schema changes
bun run db:generate

# Apply migrations
bun run db:migrate
```

**Tables:**
- `sessions` - Terminal session metadata
- `session_snapshots` - Captured scrollback content
- `settings` - Key-value settings storage

## API Reference

### REST Endpoints (port 3131)
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session by ID
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/:id/stop` - Stop session
- `POST /api/sessions/:id/revive` - Revive dead session
- `GET /api/system` - System stats (CPU, memory, disk, network)
- `GET /api/system/ports` - Listening ports
- `GET /api/browse` - Directory browser
- `GET /api/health` - Health check

### WebSocket Endpoints
- `ws://localhost:3131?session=<name>` - Terminal I/O streaming
- `ws://localhost:3131/status` - Real-time status updates (2s intervals)

## Important Patterns

### Session Management
Sessions are backed by tmux. The `SessionService` manages lifecycle:
- Sessions use prefix `pg_` in tmux
- Shell types: `opencode`, `claude`, `bash`
- Tool detection searches multiple paths before falling back to bash

### WebSocket Communication
- Terminal WebSocket streams raw PTY data bidirectionally
- Status WebSocket broadcasts system stats and session states
- Frontend uses custom hooks: `useTerminalWebSocket`, `useStatusWebSocket`

### State Management
- `sessionStore` - Active session, system stats
- `terminalStore` - WebSocket connection, terminal output
- `uiStore` - Theme, active view mode

## Environment Variables

- `PORT` - Server port (default: 3131)
- `CODE_PORT` - code-server port (default: 8083)

## Common Tasks

### Adding a new API endpoint
1. Create route handler in `apps/server/src/routes/`
2. Register in `apps/server/src/routes/index.ts`
3. Add types to `packages/shared/src/types.ts`
4. Add validation schema to `packages/shared/src/validation.ts`

### Adding a new component
1. Create in appropriate `apps/web/src/components/` subdirectory
2. Use Tailwind for styling
3. Use Zustand stores for state access
4. Use TanStack Query for server data

### Modifying the database schema
1. Edit `apps/server/src/db/schema.ts`
2. Run `bun run db:generate`
3. Run `bun run db:migrate`
4. Update shared types if needed

## Gotchas

- Always run `bun install` after pulling changes
- tmux must be installed and available in PATH
- Database migrations must run before first server start
- WebSocket connections require the server to be running
- The frontend proxies API requests in dev mode (vite.config.ts)

## Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Keep commits focused on single changes
- Run `bun run lint` and `bun run typecheck` before committing
