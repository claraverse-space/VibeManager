// Session constants
export const TMUX_PREFIX = 'pg_';
export const DEFAULT_COLS = 120;
export const DEFAULT_ROWS = 30;

// Server ports
export const DEFAULT_PORT = 3131;
export const DEFAULT_CODE_SERVER_PORT = 8443;

// Tool search paths
export const TOOL_SEARCH_PATHS = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/opt/homebrew/bin',
  '/home/linuxbrew/.linuxbrew/bin',
  '/snap/bin',
] as const;

// Data directories
export const DATA_DIR_NAME = 'vibemanager';
export const DB_FILE_NAME = 'vibemanager.db';

// WebSocket message types
export const WS_MESSAGE_TYPES = {
  DATA: 'data',
  RESIZE: 'resize',
  ATTACHED: 'attached',
  DETACHED: 'detached',
  STATUS: 'status',
} as const;

// Status update interval (ms)
export const STATUS_UPDATE_INTERVAL = 2000;

// Activity detection thresholds (ms)
export const ACTIVITY_IDLE_THRESHOLD = 10000;      // 10 seconds - after this, session is "idle"
export const ACTIVITY_WAITING_THRESHOLD = 3000;    // 3 seconds - minimum time before "waiting" check

// View modes
export const VIEW_MODES = ['dashboard', 'terminal', 'code', 'preview', 'split'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
