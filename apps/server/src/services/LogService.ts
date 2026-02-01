import { EventEmitter } from 'events';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'task' | 'session' | 'llm' | 'activity' | 'system';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
}

class LogService extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogs = 500;

  private log(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Emit for WebSocket broadcast
    this.emit('log', entry);

    // Also console log with color
    const color = {
      debug: '\x1b[90m',  // gray
      info: '\x1b[36m',   // cyan
      warn: '\x1b[33m',   // yellow
      error: '\x1b[31m',  // red
    }[level];
    const reset = '\x1b[0m';
    const catColor = {
      task: '\x1b[35m',     // magenta
      session: '\x1b[32m',  // green
      llm: '\x1b[34m',      // blue
      activity: '\x1b[33m', // yellow
      system: '\x1b[37m',   // white
    }[category];

    console.log(
      `${color}[${level.toUpperCase()}]${reset} ${catColor}[${category}]${reset} ${message}`,
      data ? JSON.stringify(data) : ''
    );
  }

  debug(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log('debug', category, message, data);
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log('info', category, message, data);
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log('warn', category, message, data);
  }

  error(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log('error', category, message, data);
  }

  getRecent(count = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  clear() {
    this.logs = [];
  }
}

export const logService = new LogService();
