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
  tasks: Task[];
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

// Task types
export type TaskStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type RunnerType = 'ralph' | 'simple' | 'manual';

export interface Task {
  id: string;
  sessionId: string;
  name: string;
  prompt: string;
  runnerType: RunnerType;
  status: TaskStatus;
  currentIteration: number;
  maxIterations: number;
  verificationPrompt: string | null;
  lastVerificationResult: string | null;
  statusMessage: string | null;
  result: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  queuePosition: number | null;  // Position in queue (null = not queued)
  // Watchdog health tracking
  lastProgressAt: Date | null;   // Last time task made progress
  healthCheckFailures: number;   // Consecutive health check failures
}

export interface CreateTaskInput {
  sessionId: string;
  name: string;
  prompt: string;
  runnerType?: RunnerType;
  maxIterations?: number;
  verificationPrompt?: string | null;
  autoStart?: boolean;
}

export interface UpdateTaskInput {
  name?: string;
  prompt?: string;
  maxIterations?: number;
  verificationPrompt?: string | null;
}

// Verifier config types
export interface VerifierConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface VerificationResult {
  passed: boolean;
  feedback: string;
  confidence: number;
}
