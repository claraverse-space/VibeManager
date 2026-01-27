// Session types
export type ShellType = 'opencode' | 'claude' | 'bash';

// Activity state types
export type ActivityState = 'active' | 'idle' | 'waiting_for_input';

export interface SessionActivity {
  lastOutputAt: number;        // Unix timestamp (ms) of last output
  activityState: ActivityState;
}

export interface Session {
  id: string;
  name: string;
  projectPath: string;
  tmuxSession: string;
  shell: ShellType;
  autonomous: boolean;
  initialPrompt: string | null;
  previewPort: number | null;
  createdAt: Date;
  lastAccessedAt: Date;
  alive?: boolean;
}

export interface SessionSnapshot {
  id: string;
  sessionId: string;
  scrollback: string;
  capturedAt: Date;
}

// System stats types
export interface SystemStats {
  cpu: {
    percent: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    percent: number;
  };
  swap: {
    total: number;
    used: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    percent: number;
  };
  temperature: number;
  load: [number, number, number];
  network: {
    rx: number;
    tx: number;
  };
  uptime: number;
}

// Port types
export interface ListeningPort {
  port: number;
  process: string;
  pid: number;
}

// Directory browser types
export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: Date;
}

// WebSocket message types
export interface TerminalAttachMessage {
  type: 'attached';
  session: string;
  projectPath: string;
  shell: ShellType;
}

export interface TerminalDataMessage {
  type: 'data';
  data: string;
}

export interface TerminalResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface TerminalDetachMessage {
  type: 'detached';
  code: number;
  reason: string;
}

export type TerminalMessage =
  | TerminalAttachMessage
  | TerminalDataMessage
  | TerminalResizeMessage
  | TerminalDetachMessage;

// Status WebSocket types
export interface StatusUpdate {
  type: 'status';
  sessions: Array<Session & { alive: boolean; activity: SessionActivity }>;
  system: SystemStats;
  ports: ListeningPort[];
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Settings types
export interface Settings {
  theme: 'dark' | 'light';
  codeServerPort: number;
  defaultShell: ShellType | 'auto';
}
