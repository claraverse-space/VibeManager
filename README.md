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

## Features

- **Ralph Autonomous Coding Loop** - AI agent that works through tasks autonomously with fresh context each iteration
- **Smart Task Completion Detection** - Multi-layer validation system (status file → task tools → terminal scraping)
- **Real-Time Progress Tracking** - Live progress bars, task steps, and status updates via WebSocket
- **Intelligent Verification System** - When tasks get stuck, verify with Claude if they're actually complete before moving on
- **Multi-Session Management** - Run multiple AI coding sessions simultaneously
- **Session Recovery** - Automatic session revival and checkpoint system
- **Web Dashboard** - Monitor all sessions from a clean web interface
- **Code Server Integration** - Built-in VS Code server for each project

## Ralph Verification Feature

When Ralph detects a task is stuck (no progress after 3 iterations), the system now asks Claude to verify if the task is actually complete:

- **Verify & Resume** button appears when stuck
- Sends special verification prompt asking Claude to confirm completion status
- Claude responds with `VERIFICATION: TASK COMPLETED` or `VERIFICATION: TASK BLOCKED`
- System automatically processes verification and moves to next task if complete
- Makes task completion 100% reliable by eliminating false stuck states

![Verification Feature](docs/verification-feature.png)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash
```

The installer will prompt you to choose Docker or Local installation.

## Update

```bash
curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash -s -- --update
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash -s -- --uninstall
```

## License

MIT
