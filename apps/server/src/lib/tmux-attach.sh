#!/bin/bash
# Wrapper script for tmux attach that handles PTY properly
SESSION="$1"

# Set up proper terminal
stty sane 2>/dev/null

# Keep the shell from being controlled
set +m

# Trap all signals that might terminate us
trap '' HUP INT TERM QUIT

# Start tmux attached, replacing this process
exec /usr/bin/tmux -u attach-session -t "$SESSION" 2>&1
