/**
 * Tests for BotFormatter module
 */

const BotFormatter = require('../bot-formatter');

describe('BotFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new BotFormatter();
  });

  describe('formatError()', () => {
    it('should format basic error message', () => {
      const result = formatter.formatError('Something went wrong');

      expect(result).toContain('[ERROR]');
      expect(result).toContain('Something went wrong');
    });

    it('should include suggestion when provided', () => {
      const result = formatter.formatError('Something went wrong', {
        suggestion: 'Try again later'
      });

      expect(result).toContain('[ERROR]');
      expect(result).toContain('Something went wrong');
      expect(result).toContain('[TIP]');
      expect(result).toContain('Try again later');
    });

    it('should format without suggestion when not provided', () => {
      const result = formatter.formatError('Error');

      expect(result).not.toContain('[TIP]');
    });
  });

  describe('formatSessionStatus()', () => {
    const mockSession = {
      name: 'test-session',
      alive: true,
      projectPath: '/home/user/project',
      shellType: 'claude',
      codePort: 8080,
      lastAccessedAt: new Date().toISOString()
    };

    it('should format basic session status', () => {
      const result = formatter.formatSessionStatus(mockSession);

      expect(result).toContain('[STATUS] test-session');
      expect(result).toContain('Status: Running');
      expect(result).toContain('Path: /home/user/project');
      expect(result).toContain('Agent: claude');
      expect(result).toContain('Port: 8080');
    });

    it('should show stopped status for non-alive session', () => {
      const stoppedSession = { ...mockSession, alive: false };

      const result = formatter.formatSessionStatus(stoppedSession);

      expect(result).toContain('Status: Stopped');
      expect(result).not.toContain('Port:');
    });

    it('should include ralph status when provided', () => {
      const ralphStatus = {
        status: 'running',
        currentTaskId: 'task-1',
        iterationCount: 5,
        config: { maxIterations: 50 }
      };

      const result = formatter.formatSessionStatus(mockSession, ralphStatus);

      expect(result).toContain('[RALPH] Loop Status');
      expect(result).toContain('Status: Running');
      expect(result).toContain('Task: task-1');
      expect(result).toContain('Iteration: 5/50');
    });

    it('should show warning for stuck ralph status', () => {
      const ralphStatus = {
        status: 'stuck',
        currentTaskId: 'task-1'
      };

      const result = formatter.formatSessionStatus(mockSession, ralphStatus);

      expect(result).toContain('[WARN] Task stuck');
    });

    it('should not show ralph section when idle', () => {
      const ralphStatus = { status: 'idle' };

      const result = formatter.formatSessionStatus(mockSession, ralphStatus);

      expect(result).not.toContain('[RALPH]');
    });
  });

  describe('formatSessionList()', () => {
    it('should format empty session list', () => {
      const result = formatter.formatSessionList([]);

      expect(result).toContain('[SESSIONS] No sessions found');
      expect(result).toContain('Use /create');
    });

    it('should format session list with counts', () => {
      const sessions = [
        { name: 'session-1', alive: true, codePort: 8080 },
        { name: 'session-2', alive: true, codePort: 8081 },
        { name: 'session-3', alive: false }
      ];

      const result = formatter.formatSessionList(sessions);

      expect(result).toContain('[SESSIONS] 3 total');
      expect(result).toContain('2 Running | 1 Stopped');
      expect(result).toContain('[RUNNING] session-1');
      expect(result).toContain('[RUNNING] session-2');
      expect(result).toContain('[STOPPED] session-3');
    });

    it('should show port for running sessions', () => {
      const sessions = [{ name: 'test', alive: true, codePort: 9000 }];

      const result = formatter.formatSessionList(sessions);

      expect(result).toContain('Port: 9000');
    });
  });

  describe('formatTaskList()', () => {
    it('should format empty task list', () => {
      const result = formatter.formatTaskList([], 'test-session');

      expect(result).toContain('[TASKS] No tasks');
      expect(result).toContain('/task test-session');
    });

    it('should format tasks with status icons', () => {
      const tasks = [
        { title: 'Task 1', status: 'completed', progress: 100 },
        { title: 'Task 2', status: 'in_progress', progress: 50, currentStep: 'Working on it' },
        { title: 'Task 3', status: 'pending' }
      ];

      const result = formatter.formatTaskList(tasks, 'session');

      expect(result).toContain('[DONE] Task 1');
      expect(result).toContain('[ACTIVE] Task 2');
      expect(result).toContain('[PENDING] Task 3');
      expect(result).toContain('Current: Working on it');
    });

    it('should show completed time for finished tasks', () => {
      const tasks = [
        { title: 'Done task', status: 'completed', completedAt: new Date().toISOString() }
      ];

      const result = formatter.formatTaskList(tasks, 'session');

      expect(result).toContain('Completed');
    });
  });

  describe('formatTaskProgress()', () => {
    it('should format task progress with bar', () => {
      const task = {
        title: 'Building feature',
        status: 'in_progress',
        progress: 60,
        currentStep: 'Writing tests'
      };

      const result = formatter.formatTaskProgress(task, 'session');

      expect(result).toContain('[PROGRESS] session');
      expect(result).toContain('Task: Building feature');
      expect(result).toContain('Status: In Progress');
      expect(result).toContain('60%');
      expect(result).toContain('Current: Writing tests');
    });

    it('should format task with steps', () => {
      const task = {
        title: 'Multi-step task',
        status: 'in_progress',
        steps: [
          { name: 'Step 1', status: 'completed' },
          { name: 'Step 2', status: 'in_progress' },
          { name: 'Step 3', status: 'pending' }
        ]
      };

      const result = formatter.formatTaskProgress(task, 'session');

      expect(result).toContain('Steps:');
      expect(result).toContain('[X] Step 1');
      expect(result).toContain('[>] Step 2');
      expect(result).toContain('[ ] Step 3');
    });
  });

  describe('formatTaskComplete()', () => {
    it('should format task completion notification', () => {
      const task = {
        title: 'Implement login',
        duration: 300000 // 5 minutes
      };

      const result = formatter.formatTaskComplete('session', task);

      expect(result).toContain('[DONE] Task Completed');
      expect(result).toContain('Session: session');
      expect(result).toContain('Task: Implement login');
      expect(result).toContain('Duration: 5m');
    });
  });

  describe('formatTaskStuck()', () => {
    it('should format stuck task notification', () => {
      const task = {
        title: 'Failing task',
        progress: 25
      };

      const result = formatter.formatTaskStuck('session', task, 3);

      expect(result).toContain('[WARN] Task Stuck');
      expect(result).toContain('Task: Failing task');
      expect(result).toContain('25%');
      expect(result).toContain('Attempts: 3 iterations');
      expect(result).toContain('attention');
    });
  });

  describe('formatRalphComplete()', () => {
    it('should format ralph completion notification', () => {
      const result = formatter.formatRalphComplete('session', 5, 3600000);

      expect(result).toContain('[COMPLETE] All Tasks Finished');
      expect(result).toContain('Session: session');
      expect(result).toContain('Tasks: 5/5 completed');
      expect(result).toContain('Duration: 1h 0m');
      expect(result).toContain('ready');
    });
  });

  describe('formatSessionCreated()', () => {
    it('should format session creation confirmation', () => {
      const session = {
        name: 'new-session',
        projectPath: '/home/user/project',
        shellType: 'claude',
        alive: false
      };

      const result = formatter.formatSessionCreated(session);

      expect(result).toContain('[OK] Session Created');
      expect(result).toContain('Name: new-session');
      expect(result).toContain('Path: /home/user/project');
      expect(result).toContain('Agent: claude');
      expect(result).toContain('/start new-session');
      expect(result).toContain('/task new-session');
    });
  });

  describe('formatHelp()', () => {
    it('should format help text with header', () => {
      const result = formatter.formatHelp('Available commands:\n/create\n/start');

      expect(result).toContain('[HELP] VibeManager Bot Commands');
      expect(result).toContain('Available commands');
      expect(result).toContain('[TIP]');
    });
  });

  describe('formatUnauthorized()', () => {
    it('should format unauthorized message', () => {
      const result = formatter.formatUnauthorized('123456', 'telegram');

      expect(result).toContain('[DENIED] Access Denied');
      expect(result).toContain('not authorized');
      expect(result).toContain('Your telegram ID: 123456');
      expect(result).toContain('TELEGRAM_ALLOWED_USERS');
    });
  });

  describe('utility methods', () => {
    describe('getTaskIcon()', () => {
      it('should return correct icons for each status', () => {
        expect(formatter.getTaskIcon('pending')).toBe('[PENDING]');
        expect(formatter.getTaskIcon('in_progress')).toBe('[ACTIVE]');
        expect(formatter.getTaskIcon('completed')).toBe('[DONE]');
        expect(formatter.getTaskIcon('blocked')).toBe('[BLOCKED]');
        expect(formatter.getTaskIcon('error')).toBe('[ERROR]');
        expect(formatter.getTaskIcon('unknown')).toBe('[?]');
      });
    });

    describe('getStepIcon()', () => {
      it('should return correct icons for each status', () => {
        expect(formatter.getStepIcon('pending')).toBe('[ ]');
        expect(formatter.getStepIcon('in_progress')).toBe('[>]');
        expect(formatter.getStepIcon('completed')).toBe('[X]');
        expect(formatter.getStepIcon('error')).toBe('[!]');
        expect(formatter.getStepIcon('unknown')).toBe('[ ]');
      });
    });

    describe('formatStatus()', () => {
      it('should format status labels', () => {
        expect(formatter.formatStatus('pending')).toBe('Pending');
        expect(formatter.formatStatus('in_progress')).toBe('In Progress');
        expect(formatter.formatStatus('completed')).toBe('Completed');
        expect(formatter.formatStatus('blocked')).toBe('Blocked');
        expect(formatter.formatStatus('error')).toBe('Error');
        expect(formatter.formatStatus('custom')).toBe('custom');
      });
    });

    describe('formatRalphStatus()', () => {
      it('should format ralph status labels', () => {
        expect(formatter.formatRalphStatus('idle')).toBe('Idle');
        expect(formatter.formatRalphStatus('running')).toBe('Running');
        expect(formatter.formatRalphStatus('paused')).toBe('Paused');
        expect(formatter.formatRalphStatus('stuck')).toBe('Stuck');
        expect(formatter.formatRalphStatus('complete')).toBe('Complete');
      });
    });

    describe('createProgressBar()', () => {
      it('should create progress bar at 0%', () => {
        const bar = formatter.createProgressBar(0);
        expect(bar).toBe('[░░░░░░░░░░]');
      });

      it('should create progress bar at 50%', () => {
        const bar = formatter.createProgressBar(50);
        expect(bar).toBe('[█████░░░░░]');
      });

      it('should create progress bar at 100%', () => {
        const bar = formatter.createProgressBar(100);
        expect(bar).toBe('[██████████]');
      });

      it('should respect custom length', () => {
        const bar = formatter.createProgressBar(50, 5);
        expect(bar.length).toBe(7); // [XX░░░] = 7 chars
      });
    });

    describe('formatTimeAgo()', () => {
      it('should format seconds ago', () => {
        const date = new Date(Date.now() - 30000);
        expect(formatter.formatTimeAgo(date)).toBe('30s ago');
      });

      it('should format minutes ago', () => {
        const date = new Date(Date.now() - 300000);
        expect(formatter.formatTimeAgo(date)).toBe('5m ago');
      });

      it('should format hours ago', () => {
        const date = new Date(Date.now() - 7200000);
        expect(formatter.formatTimeAgo(date)).toBe('2h ago');
      });

      it('should format days ago', () => {
        const date = new Date(Date.now() - 172800000);
        expect(formatter.formatTimeAgo(date)).toBe('2d ago');
      });
    });

    describe('formatDuration()', () => {
      it('should format seconds', () => {
        expect(formatter.formatDuration(45000)).toBe('45s');
      });

      it('should format minutes and seconds', () => {
        expect(formatter.formatDuration(125000)).toBe('2m 5s');
      });

      it('should format hours and minutes', () => {
        expect(formatter.formatDuration(7500000)).toBe('2h 5m');
      });
    });

    describe('truncate()', () => {
      it('should not truncate short text', () => {
        expect(formatter.truncate('hello', 100)).toBe('hello');
      });

      it('should truncate long text with ellipsis', () => {
        const result = formatter.truncate('hello world', 8);
        expect(result).toBe('hello...');
        expect(result.length).toBe(8);
      });

      it('should use default max length of 2000', () => {
        const longText = 'a'.repeat(3000);
        const result = formatter.truncate(longText);
        expect(result.length).toBe(2000);
        expect(result.endsWith('...')).toBe(true);
      });
    });
  });

  describe('formatGPUStats()', () => {
    it('should format empty GPU stats', () => {
      const result = formatter.formatGPUStats(null);

      expect(result).toContain('[GPU] Stats');
      expect(result).toContain('No GPUs detected');
    });

    it('should format GPU stats with data', () => {
      const stats = {
        gpus: [
          {
            index: 0,
            vendor: 'NVIDIA',
            name: 'RTX 4090',
            temperature: 65,
            utilization: { gpu: 80, memory: 60 },
            memory: { used: 8192, total: 24576 },
            power: { draw: 350, limit: 450 }
          }
        ],
        summary: {
          totalMemory: 24576,
          avgUtilization: 80,
          totalPower: 350
        }
      };

      const result = formatter.formatGPUStats(stats);

      expect(result).toContain('[GPU] Stats');
      expect(result).toContain('1 GPU(s) detected');
      expect(result).toContain('GPU 0: RTX 4090');
      expect(result).toContain('Vendor: NVIDIA');
      expect(result).toContain('Temp: 65');
      expect(result).toContain('GPU Util: 80%');
      expect(result).toContain('Power: 350W / 450W');
    });

    it('should include note when present', () => {
      const stats = {
        gpus: [{
          index: 0,
          vendor: 'Intel',
          name: 'Intel GPU',
          temperature: 0,
          utilization: { gpu: 0, memory: 0 },
          memory: { used: 0, total: 0 },
          power: { draw: 0, limit: 0 },
          note: 'Limited stats available'
        }]
      };

      const result = formatter.formatGPUStats(stats);

      expect(result).toContain('[INFO] Limited stats available');
    });
  });

  describe('formatLogs()', () => {
    it('should format empty logs', () => {
      const result = formatter.formatLogs('session', '');

      expect(result).toContain('[LOGS] session');
      expect(result).toContain('No logs available');
    });

    it('should format logs with content', () => {
      const logs = 'Line 1\nLine 2\nLine 3';

      const result = formatter.formatLogs('session', logs);

      expect(result).toContain('[LOGS] session');
      expect(result).toContain('Last 3 lines');
      expect(result).toContain('```');
      expect(result).toContain('Line 1');
    });

    it('should respect line limit', () => {
      const logs = Array(100).fill('Log line').join('\n');

      const result = formatter.formatLogs('session', logs, 10);

      expect(result).toContain('Last 10 lines');
    });
  });

  describe('formatPRDCreated()', () => {
    it('should format PRD creation confirmation', () => {
      const prdContent = '# Project\n\nDescription of the project';

      const result = formatter.formatPRDCreated('session', prdContent);

      expect(result).toContain('[PRD] Created');
      expect(result).toContain('Session: session');
      expect(result).toContain('Preview:');
      expect(result).toContain('# Project');
      expect(result).toContain('added to the session tasks');
    });

    it('should truncate long PRD content', () => {
      const longContent = 'x'.repeat(1000);

      const result = formatter.formatPRDCreated('session', longContent);

      expect(result.length).toBeLessThan(1500);
    });
  });
});
