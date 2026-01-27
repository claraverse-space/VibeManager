/**
 * Tests for RalphLoop module
 *
 * Tests the LLM-powered active monitoring system with status file fallback
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Mock modules
jest.mock('fs');
jest.mock('https');
jest.mock('http');
jest.mock('child_process');

const RalphLoop = require('../ralph-loop');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Mock session manager
const createMockSessionManager = () => ({
  get: jest.fn(),
  getCurrentTask: jest.fn(),
  getScrollbackContent: jest.fn(),
  getProgressRaw: jest.fn(),
  getTaskStats: jest.fn().mockReturnValue({ completed: 0, total: 3 }),
  loadPrd: jest.fn(),
  markTaskComplete: jest.fn(),
  logTaskComplete: jest.fn(),
  logTaskStart: jest.fn(),
  logIteration: jest.fn(),
  logError: jest.fn(),
  clearStatusFile: jest.fn(),
  captureScrollback: jest.fn(),
  stop: jest.fn(),
  revive: jest.fn(),
  save: jest.fn(),
  data: { sessions: {} }
});

// Mock bot config
const createMockBotConfig = (configured = true) => ({
  get: jest.fn((key) => {
    const config = {
      'provider.name': configured ? 'openai' : null,
      'provider.apiKey': configured ? 'test-key' : null,
      'provider.baseUrl': configured ? 'https://api.test.com' : null,
      'provider.model': 'gpt-4o-mini'
    };
    return config[key];
  })
});

describe('RalphLoop', () => {
  let loop;
  let mockSessionManager;
  let mockBotConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});

    mockSessionManager = createMockSessionManager();
    mockBotConfig = createMockBotConfig();

    loop = new RalphLoop(mockSessionManager);
    loop.setConfig(mockBotConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
    // Clean up any active watchers
    loop.watchers.forEach((_, name) => loop.stopMonitoring(name));
  });

  describe('constructor', () => {
    it('should extend EventEmitter', () => {
      expect(loop).toBeInstanceOf(EventEmitter);
    });

    it('should initialize with empty activeLoops and watchers', () => {
      expect(loop.activeLoops).toBeInstanceOf(Map);
      expect(loop.watchers).toBeInstanceOf(Map);
      expect(loop.activeLoops.size).toBe(0);
      expect(loop.watchers.size).toBe(0);
    });

    it('should have default monitor settings', () => {
      expect(loop.monitorSettings).toBeDefined();
      expect(loop.monitorSettings.checkInterval).toBe(10);
      expect(loop.monitorSettings.activeInterval).toBe(5);
      expect(loop.monitorSettings.idleInterval).toBe(30);
      expect(loop.monitorSettings.terminalLines).toBe(20);
      expect(loop.monitorSettings.stuckThreshold).toBe(3);
      expect(loop.monitorSettings.autoVerifyStuck).toBe(true);
    });

    it('should store session manager reference', () => {
      expect(loop.sessionManager).toBe(mockSessionManager);
    });
  });

  describe('setConfig()', () => {
    it('should set bot config reference', () => {
      const newConfig = createMockBotConfig();
      loop.setConfig(newConfig);
      expect(loop.botConfig).toBe(newConfig);
    });
  });

  describe('isLLMConfigured()', () => {
    it('should return true when all provider settings are present', () => {
      expect(loop.isLLMConfigured()).toBe(true);
    });

    it('should return false when no bot config', () => {
      loop.botConfig = null;
      expect(loop.isLLMConfigured()).toBe(false);
    });

    it('should return false when provider not configured', () => {
      loop.setConfig(createMockBotConfig(false));
      expect(loop.isLLMConfigured()).toBe(false);
    });
  });

  describe('getLLMConfig()', () => {
    it('should return LLM config object', () => {
      const config = loop.getLLMConfig();
      expect(config).toEqual({
        provider: 'openai',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      });
    });

    it('should return null when no bot config', () => {
      loop.botConfig = null;
      expect(loop.getLLMConfig()).toBeNull();
    });
  });

  describe('startMonitoring()', () => {
    it('should create watcher state for session', () => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.get.mockReturnValue({ projectPath: '/test' });
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });

      loop.startMonitoring('test-session');

      expect(loop.watchers.has('test-session')).toBe(true);
      const watcher = loop.watchers.get('test-session');
      expect(watcher.sessionName).toBe('test-session');
      expect(watcher.checkCount).toBe(0);
      expect(watcher.noProgressCount).toBe(0);
    });

    it('should stop existing monitoring before starting', () => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.get.mockReturnValue({ projectPath: '/test' });
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });

      // Start first
      loop.startMonitoring('test-session');
      const firstWatcher = loop.watchers.get('test-session');

      // Start again
      loop.startMonitoring('test-session');
      const secondWatcher = loop.watchers.get('test-session');

      // Should be a new watcher
      expect(secondWatcher).not.toBe(firstWatcher);
    });

    it('should log LLM status', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.get.mockReturnValue({ projectPath: '/test' });
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });

      loop.startMonitoring('test-session');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('LLM monitoring: ENABLED')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('stopMonitoring()', () => {
    it('should remove watcher and clear timer', () => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.get.mockReturnValue({ projectPath: '/test' });
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });

      loop.startMonitoring('test-session');
      expect(loop.watchers.has('test-session')).toBe(true);

      loop.stopMonitoring('test-session');
      expect(loop.watchers.has('test-session')).toBe(false);
    });

    it('should do nothing if no watcher exists', () => {
      expect(() => loop.stopMonitoring('nonexistent')).not.toThrow();
    });
  });

  describe('getTerminalContent()', () => {
    it('should return last N lines of scrollback', () => {
      const lines = Array(30).fill(0).map((_, i) => `Line ${i}`);
      mockSessionManager.getScrollbackContent.mockReturnValue(lines.join('\n'));

      const content = loop.getTerminalContent('test-session');
      const resultLines = content.split('\n');

      expect(resultLines.length).toBe(loop.monitorSettings.terminalLines);
      expect(resultLines[resultLines.length - 1]).toBe('Line 29');
    });

    it('should return empty string if no content', () => {
      mockSessionManager.getScrollbackContent.mockReturnValue(null);

      const content = loop.getTerminalContent('test-session');
      expect(content).toBe('');
    });

    it('should handle errors gracefully', () => {
      mockSessionManager.getScrollbackContent.mockImplementation(() => {
        throw new Error('Failed');
      });

      const content = loop.getTerminalContent('test-session');
      expect(content).toBe('');
    });
  });

  describe('getStatusFileContent()', () => {
    it('should return parsed status file', () => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/test/project' });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        status: 'in_progress',
        progress: 50
      }));

      const status = loop.getStatusFileContent('test-session');

      expect(status).toEqual({ status: 'in_progress', progress: 50 });
    });

    it('should return null if session not found', () => {
      mockSessionManager.get.mockReturnValue(null);

      const status = loop.getStatusFileContent('test-session');
      expect(status).toBeNull();
    });

    it('should return null if status file not found', () => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/test' });
      fs.existsSync.mockReturnValue(false);

      const status = loop.getStatusFileContent('test-session');
      expect(status).toBeNull();
    });

    it('should return null on parse error', () => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/test' });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      const status = loop.getStatusFileContent('test-session');
      expect(status).toBeNull();
    });
  });

  describe('buildLLMPrompt()', () => {
    it('should build prompt with task info', () => {
      const task = { title: 'Test Task', description: 'Task description' };
      const terminal = 'npm test\nAll tests passed';
      const statusFile = { status: 'in_progress', progress: 50 };
      const watcher = { checkCount: 5, lastActivityAt: Date.now() - 10000, noProgressCount: 1 };

      const prompt = loop.buildLLMPrompt(task, terminal, statusFile, watcher);

      expect(prompt).toContain('Test Task');
      expect(prompt).toContain('Task description');
      expect(prompt).toContain('npm test');
      expect(prompt).toContain('in_progress');
      expect(prompt).toContain('Check #5');
    });

    it('should handle missing optional fields', () => {
      const task = { title: 'Minimal Task' };
      const watcher = { checkCount: 1, lastActivityAt: Date.now(), noProgressCount: 0 };

      const prompt = loop.buildLLMPrompt(task, '', null, watcher);

      expect(prompt).toContain('Minimal Task');
      expect(prompt).toContain('(no output)');
      expect(prompt).toContain('(not found)');
    });

    it('should include instructions for status determination', () => {
      const task = { title: 'Test' };
      const watcher = { checkCount: 1, lastActivityAt: Date.now(), noProgressCount: 0 };

      const prompt = loop.buildLLMPrompt(task, '', null, watcher);

      expect(prompt).toContain('COMPLETED');
      expect(prompt).toContain('IN_PROGRESS');
      expect(prompt).toContain('STUCK');
      expect(prompt).toContain('WAITING_INPUT');
    });
  });

  describe('checkWithStatusFile()', () => {
    let watcher;

    beforeEach(() => {
      loop.initLoopState('test-session');
      watcher = {
        lastActivityAt: Date.now(),
        noProgressCount: 0,
        lastProgress: null
      };
    });

    it('should handle completed status', async () => {
      const task = { id: 'task-1', title: 'Test' };
      const statusFile = {
        status: 'completed',
        result: { message: 'Done' }
      };

      loop.handleTaskComplete = jest.fn();

      await loop.checkWithStatusFile('test-session', task, statusFile, watcher);

      expect(loop.handleTaskComplete).toHaveBeenCalledWith(
        'test-session',
        task,
        expect.objectContaining({ status: 'completed', confidence: 1.0 })
      );
    });

    it('should increment noProgressCount on error status', async () => {
      const task = { id: 'task-1', title: 'Test' };
      const statusFile = { status: 'error', error: 'Something failed' };

      await loop.checkWithStatusFile('test-session', task, statusFile, watcher);

      expect(watcher.noProgressCount).toBe(1);
    });

    it('should reset noProgressCount on progress change', async () => {
      watcher.noProgressCount = 2;
      watcher.lastProgress = 30;

      const task = { id: 'task-1', title: 'Test' };
      const statusFile = { status: 'in_progress', progress: 50 };

      await loop.checkWithStatusFile('test-session', task, statusFile, watcher);

      expect(watcher.noProgressCount).toBe(0);
      expect(watcher.lastProgress).toBe(50);
    });

    it('should handle stuck when no activity for too long', async () => {
      watcher.lastActivityAt = Date.now() - (loop.monitorSettings.activityTimeout + 10) * 1000;
      watcher.noProgressCount = loop.monitorSettings.stuckThreshold - 1;

      const task = { id: 'task-1', title: 'Test' };

      loop.handleTaskStuck = jest.fn();

      await loop.checkWithStatusFile('test-session', task, null, watcher);

      expect(watcher.noProgressCount).toBe(loop.monitorSettings.stuckThreshold);
      expect(loop.handleTaskStuck).toHaveBeenCalled();
    });
  });

  describe('handleTaskComplete()', () => {
    beforeEach(() => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.get.mockReturnValue({ projectPath: '/test' });
      mockSessionManager.getCurrentTask.mockReturnValue(null); // No more tasks
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should mark task complete and emit event', async () => {
      const task = { id: 'task-1', title: 'Test Task' };
      const analysis = { reason: 'Completed successfully', confidence: 0.9 };

      const emitSpy = jest.spyOn(loop, 'emit');

      await loop.handleTaskComplete('test-session', task, analysis);

      expect(mockSessionManager.markTaskComplete).toHaveBeenCalledWith('test-session', 'task-1');
      expect(mockSessionManager.logTaskComplete).toHaveBeenCalledWith('test-session', 'Test Task');
      expect(emitSpy).toHaveBeenCalledWith('taskComplete', expect.objectContaining({
        sessionName: 'test-session',
        task
      }));
    });

    it('should reset circuit breaker counters', async () => {
      const state = loop.activeLoops.get('test-session');
      state.circuitBreaker.noProgressCount = 2;
      state.circuitBreaker.errorCount = 1;

      const task = { id: 'task-1', title: 'Test' };

      await loop.handleTaskComplete('test-session', task, { reason: 'Done', confidence: 1.0 });

      expect(state.circuitBreaker.noProgressCount).toBe(0);
      expect(state.circuitBreaker.errorCount).toBe(0);
    });

    it('should call handleAllTasksComplete if no more tasks', async () => {
      mockSessionManager.getCurrentTask.mockReturnValue(null);
      loop.handleAllTasksComplete = jest.fn();

      const task = { id: 'task-1', title: 'Test' };

      await loop.handleTaskComplete('test-session', task, { reason: 'Done', confidence: 1.0 });

      expect(loop.handleAllTasksComplete).toHaveBeenCalledWith('test-session');
    });
  });

  describe('handleAllTasksComplete()', () => {
    beforeEach(() => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should mark state as complete and emit event', () => {
      const emitSpy = jest.spyOn(loop, 'emit');

      loop.handleAllTasksComplete('test-session');

      const state = loop.activeLoops.get('test-session');
      expect(state.status).toBe('complete');
      expect(state.completedAt).toBeDefined();
      expect(emitSpy).toHaveBeenCalledWith('complete', expect.objectContaining({
        sessionName: 'test-session'
      }));
    });

    it('should stop monitoring', () => {
      loop.watchers.set('test-session', { timer: setTimeout(() => {}, 1000) });
      const stopSpy = jest.spyOn(loop, 'stopMonitoring');

      loop.handleAllTasksComplete('test-session');

      expect(stopSpy).toHaveBeenCalledWith('test-session');
    });
  });

  describe('handleTaskStuck()', () => {
    beforeEach(() => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.data.sessions['test-session'] = {};
      // Disable auto-verify for simple tests
      loop.monitorSettings.autoVerifyStuck = false;
    });

    it('should mark state as stuck and emit event', async () => {
      const task = { id: 'task-1', title: 'Test' };
      const analysis = { status: 'stuck', reason: 'No progress', suggestedAction: 'Check logs' };

      const emitSpy = jest.spyOn(loop, 'emit');

      await loop.handleTaskStuck('test-session', task, analysis);

      const state = loop.activeLoops.get('test-session');
      expect(state.status).toBe('stuck');
      expect(state.stuckReason).toBe('No progress');
      expect(emitSpy).toHaveBeenCalledWith('stuck', expect.objectContaining({
        sessionName: 'test-session',
        reason: 'No progress'
      }));
    });

    it('should stop monitoring when stuck', async () => {
      loop.watchers.set('test-session', { timer: setTimeout(() => {}, 1000) });
      const stopSpy = jest.spyOn(loop, 'stopMonitoring');

      const task = { id: 'task-1', title: 'Test' };

      await loop.handleTaskStuck('test-session', task, { status: 'stuck', reason: 'Stuck' });

      expect(stopSpy).toHaveBeenCalledWith('test-session');
    });
  });

  describe('initLoopState()', () => {
    it('should create initial state with defaults', () => {
      const state = loop.initLoopState('test-session');

      expect(state.sessionName).toBe('test-session');
      expect(state.status).toBe('idle');
      expect(state.iterationCount).toBe(0);
      expect(state.maxIterations).toBe(50);
      expect(state.circuitBreaker).toBeDefined();
      expect(state.circuitBreaker.threshold).toBe(3);
    });

    it('should accept custom config', () => {
      const state = loop.initLoopState('test-session', {
        maxIterations: 100,
        circuitBreakerThreshold: 5
      });

      expect(state.maxIterations).toBe(100);
      expect(state.circuitBreaker.threshold).toBe(5);
    });

    it('should store state in activeLoops', () => {
      loop.initLoopState('test-session');

      expect(loop.activeLoops.has('test-session')).toBe(true);
    });
  });

  describe('getLoopState()', () => {
    it('should return state if exists', () => {
      loop.initLoopState('test-session');

      const state = loop.getLoopState('test-session');

      expect(state).toBeDefined();
      expect(state.sessionName).toBe('test-session');
    });

    it('should return null if not exists', () => {
      const state = loop.getLoopState('nonexistent');

      expect(state).toBeNull();
    });
  });

  describe('startLoop()', () => {
    beforeEach(() => {
      mockSessionManager.get.mockReturnValue({
        projectPath: '/test/project',
        tmuxSession: 'test-tmux',
        alive: false
      });
      mockSessionManager.getCurrentTask.mockReturnValue({
        id: 'task-1',
        title: 'First Task'
      });
      mockSessionManager.data.sessions['test-session'] = {};
      execSync.mockImplementation(() => {});
    });

    it('should throw if session not found', async () => {
      mockSessionManager.get.mockReturnValue(null);

      await expect(loop.startLoop('nonexistent')).rejects.toThrow('not found');
    });

    it('should throw if already running', async () => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';

      await expect(loop.startLoop('test-session')).rejects.toThrow('already running');
    });

    it('should set status to running and emit started event', async () => {
      const emitSpy = jest.spyOn(loop, 'emit');

      // Mock runIteration to avoid side effects
      loop.runIteration = jest.fn();

      await loop.startLoop('test-session');

      const state = loop.activeLoops.get('test-session');
      expect(state.status).toBe('running');
      expect(state.startedAt).toBeDefined();
      expect(emitSpy).toHaveBeenCalledWith('started', expect.anything());
    });

    it('should return complete if no tasks', async () => {
      mockSessionManager.getCurrentTask.mockReturnValue(null);

      const state = await loop.startLoop('test-session');

      expect(state.status).toBe('complete');
    });

    it('should start monitoring', async () => {
      loop.runIteration = jest.fn();
      const startMonitorSpy = jest.spyOn(loop, 'startMonitoring');

      await loop.startLoop('test-session');

      expect(startMonitorSpy).toHaveBeenCalledWith('test-session');
    });
  });

  describe('pauseLoop()', () => {
    beforeEach(() => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should set status to paused', () => {
      const state = loop.pauseLoop('test-session');

      expect(state.status).toBe('paused');
      expect(state.pausedAt).toBeDefined();
    });

    it('should stop monitoring', () => {
      loop.watchers.set('test-session', { timer: setTimeout(() => {}, 1000) });
      const stopSpy = jest.spyOn(loop, 'stopMonitoring');

      loop.pauseLoop('test-session');

      expect(stopSpy).toHaveBeenCalledWith('test-session');
    });

    it('should throw if no state exists', () => {
      expect(() => loop.pauseLoop('nonexistent')).toThrow('No loop state');
    });

    it('should throw if not running', () => {
      loop.activeLoops.get('test-session').status = 'paused';

      expect(() => loop.pauseLoop('test-session')).toThrow('not running');
    });

    it('should emit paused event', () => {
      const emitSpy = jest.spyOn(loop, 'emit');

      loop.pauseLoop('test-session');

      expect(emitSpy).toHaveBeenCalledWith('paused', expect.anything());
    });
  });

  describe('resumeLoop()', () => {
    beforeEach(() => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'paused';
      mockSessionManager.get.mockReturnValue({ projectPath: '/test', tmuxSession: 'test', alive: true });
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });
      mockSessionManager.data.sessions['test-session'] = {};
      execSync.mockImplementation(() => {});
    });

    it('should set status to running', async () => {
      loop.runIteration = jest.fn();

      const state = await loop.resumeLoop('test-session');

      expect(state.status).toBe('running');
      expect(state.pausedAt).toBeNull();
    });

    it('should throw if no state exists', async () => {
      await expect(loop.resumeLoop('nonexistent')).rejects.toThrow('No loop state');
    });

    it('should throw if not paused or stuck', async () => {
      loop.activeLoops.get('test-session').status = 'running';

      await expect(loop.resumeLoop('test-session')).rejects.toThrow('not paused or stuck');
    });

    it('should reset circuit breaker when resuming from stuck', async () => {
      const state = loop.activeLoops.get('test-session');
      state.status = 'stuck';
      state.circuitBreaker.noProgressCount = 3;
      state.circuitBreaker.errorCount = 2;
      state.stuckReason = 'Was stuck';

      loop.runIteration = jest.fn();

      await loop.resumeLoop('test-session');

      expect(state.circuitBreaker.noProgressCount).toBe(0);
      expect(state.circuitBreaker.errorCount).toBe(0);
      expect(state.stuckReason).toBeNull();
    });

    it('should restart monitoring', async () => {
      loop.runIteration = jest.fn();
      const startMonitorSpy = jest.spyOn(loop, 'startMonitoring');

      await loop.resumeLoop('test-session');

      expect(startMonitorSpy).toHaveBeenCalledWith('test-session');
    });

    it('should emit resumed event', async () => {
      loop.runIteration = jest.fn();
      const emitSpy = jest.spyOn(loop, 'emit');

      await loop.resumeLoop('test-session');

      expect(emitSpy).toHaveBeenCalledWith('resumed', expect.anything());
    });
  });

  describe('stopLoop()', () => {
    beforeEach(() => {
      loop.initLoopState('test-session');
      loop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should set status to idle', () => {
      const state = loop.stopLoop('test-session');

      expect(state.status).toBe('idle');
    });

    it('should stop monitoring', () => {
      loop.watchers.set('test-session', { timer: setTimeout(() => {}, 1000) });
      const stopSpy = jest.spyOn(loop, 'stopMonitoring');

      loop.stopLoop('test-session');

      expect(stopSpy).toHaveBeenCalledWith('test-session');
    });

    it('should return null if no state', () => {
      const result = loop.stopLoop('nonexistent');

      expect(result).toBeNull();
    });

    it('should emit stopped event', () => {
      const emitSpy = jest.spyOn(loop, 'emit');

      loop.stopLoop('test-session');

      expect(emitSpy).toHaveBeenCalledWith('stopped', expect.anything());
    });
  });

  describe('buildPrompt()', () => {
    beforeEach(() => {
      mockSessionManager.getCurrentTask.mockReturnValue({
        id: 'task-1',
        title: 'Implement feature',
        description: 'Add the new feature',
        attempts: 0
      });
      mockSessionManager.getProgressRaw.mockReturnValue('Previous progress info');
      mockSessionManager.getTaskStats.mockReturnValue({ completed: 1, total: 3 });
      mockSessionManager.loadPrd.mockReturnValue({
        name: 'Test Project',
        description: 'A test project'
      });
    });

    it('should include project info from PRD', () => {
      const prompt = loop.buildPrompt('test-session');

      expect(prompt).toContain('Test Project');
      expect(prompt).toContain('A test project');
    });

    it('should include task progress', () => {
      const prompt = loop.buildPrompt('test-session');

      expect(prompt).toContain('1/3 complete');
    });

    it('should include current task details', () => {
      const prompt = loop.buildPrompt('test-session');

      expect(prompt).toContain('Implement feature');
      expect(prompt).toContain('Add the new feature');
    });

    it('should note retry attempts', () => {
      mockSessionManager.getCurrentTask.mockReturnValue({
        id: 'task-1',
        title: 'Test',
        attempts: 2
      });

      const prompt = loop.buildPrompt('test-session');

      expect(prompt).toContain('attempt #3');
    });

    it('should include previous learnings', () => {
      const prompt = loop.buildPrompt('test-session');

      expect(prompt).toContain('Previous Learnings');
      expect(prompt).toContain('Previous progress info');
    });

    it('should include completion instructions', () => {
      const prompt = loop.buildPrompt('test-session');

      expect(prompt).toContain('.ralph/status.json');
      expect(prompt).toContain('"status": "completed"');
      expect(prompt).toContain('DONE');
    });

    it('should return null if no current task', () => {
      mockSessionManager.getCurrentTask.mockReturnValue(null);

      const prompt = loop.buildPrompt('test-session');

      expect(prompt).toBeNull();
    });
  });

  describe('getAllLoopStatus()', () => {
    it('should return status for all active loops', () => {
      loop.initLoopState('session-1');
      loop.activeLoops.get('session-1').status = 'running';
      loop.activeLoops.get('session-1').iterationCount = 5;

      loop.initLoopState('session-2');
      loop.activeLoops.get('session-2').status = 'paused';

      const status = loop.getAllLoopStatus();

      expect(status['session-1']).toBeDefined();
      expect(status['session-1'].status).toBe('running');
      expect(status['session-1'].iterationCount).toBe(5);
      expect(status['session-2']).toBeDefined();
      expect(status['session-2'].status).toBe('paused');
    });

    it('should include watcher info if present', () => {
      loop.initLoopState('test-session');
      loop.watchers.set('test-session', {
        checkCount: 10,
        noProgressCount: 2,
        lastActivityAt: Date.now() - 5000
      });

      const status = loop.getAllLoopStatus();

      expect(status['test-session'].monitoring).toBeDefined();
      expect(status['test-session'].monitoring.checkCount).toBe(10);
      expect(status['test-session'].monitoring.noProgressCount).toBe(2);
    });
  });

  describe('updateMonitorSettings()', () => {
    it('should merge new settings', () => {
      loop.updateMonitorSettings({
        checkInterval: 15,
        stuckThreshold: 5
      });

      expect(loop.monitorSettings.checkInterval).toBe(15);
      expect(loop.monitorSettings.stuckThreshold).toBe(5);
      // Other settings unchanged
      expect(loop.monitorSettings.activeInterval).toBe(5);
    });
  });

  describe('legacy compatibility', () => {
    it('startLogDetection should call startMonitoring', () => {
      const spy = jest.spyOn(loop, 'startMonitoring').mockImplementation(() => {});

      loop.startLogDetection('test-session');

      expect(spy).toHaveBeenCalledWith('test-session');
    });

    it('stopLogDetection should call stopMonitoring', () => {
      const spy = jest.spyOn(loop, 'stopMonitoring').mockImplementation(() => {});

      loop.stopLogDetection('test-session');

      expect(spy).toHaveBeenCalledWith('test-session');
    });

    it('isProviderConfigured should call isLLMConfigured', () => {
      const result = loop.isProviderConfigured();

      expect(result).toBe(loop.isLLMConfigured());
    });

    it('getProviderConfig should call getLLMConfig', () => {
      const result = loop.getProviderConfig();

      expect(result).toEqual(loop.getLLMConfig());
    });
  });

  describe('writeStatusFile()', () => {
    beforeEach(() => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/test/project' });
    });

    it('should write status file with completion info', () => {
      const task = { id: 'task-1', title: 'Test' };
      const analysis = { reason: 'Completed successfully', confidence: 0.95 };

      loop.writeStatusFile('test-session', task, analysis);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('status.json'),
        expect.stringContaining('"status": "completed"')
      );
    });

    it('should include detection method in result', () => {
      const task = { id: 'task-1', title: 'Test' };
      const analysis = { reason: 'Done', confidence: 1.0 };

      loop.writeStatusFile('test-session', task, analysis);

      const writeCall = fs.writeFileSync.mock.calls[0];
      const content = JSON.parse(writeCall[1]);

      expect(content.result.detectedBy).toBe('llm');
    });

    it('should create directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);

      const task = { id: 'task-1', title: 'Test' };
      loop.writeStatusFile('test-session', task, { reason: 'Done', confidence: 1.0 });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.ralph'),
        { recursive: true }
      );
    });

    it('should handle errors gracefully', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const task = { id: 'task-1', title: 'Test' };

      // Should not throw
      expect(() => {
        loop.writeStatusFile('test-session', task, { reason: 'Done', confidence: 1.0 });
      }).not.toThrow();
    });
  });

  describe('callLLM()', () => {
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              choices: [{ message: { content: '{"status":"completed","confidence":0.9,"reason":"Done"}' } }]
            }));
          }
          if (event === 'end') callback();
          return mockResponse;
        })
      };

      mockRequest = {
        on: jest.fn().mockReturnThis(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
    });

    it('should make request to LLM provider', async () => {
      const config = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      const result = await loop.callLLM(config, 'Test prompt');

      expect(result).toContain('status');
      expect(https.request).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockResponse.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify({ error: { message: 'API error' } }));
        }
        if (event === 'end') callback();
        return mockResponse;
      });

      const config = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      await expect(loop.callLLM(config, 'Test'))
        .rejects.toThrow('API error');
    });
  });

  describe('sleep()', () => {
    it('should return a promise that resolves after specified time', async () => {
      const promise = loop.sleep(1000);

      jest.advanceTimersByTime(1000);

      await promise;
    });
  });
});
