/**
 * Tests for RalphLoop module
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Mock fs, https, http
jest.mock('fs');
jest.mock('https');
jest.mock('http');

// Mock child_process for execSync used in restartSessionWithPrompt
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const RalphLoop = require('../ralph-loop');
const https = require('https');
const http = require('http');

describe('RalphLoop', () => {
  let ralphLoop;
  let mockSessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock session manager
    mockSessionManager = {
      get: jest.fn(),
      getCurrentTask: jest.fn(),
      getProgressRaw: jest.fn(),
      getTaskStats: jest.fn().mockReturnValue({ completed: 0, total: 5 }),
      loadPrd: jest.fn(),
      markTaskComplete: jest.fn(),
      logTaskComplete: jest.fn(),
      logTaskStart: jest.fn(),
      logIteration: jest.fn(),
      logError: jest.fn(),
      incrementTaskAttempts: jest.fn(),
      clearStatusFile: jest.fn(),
      getScrollbackContent: jest.fn(),
      captureScrollback: jest.fn(),
      stop: jest.fn(),
      revive: jest.fn(),
      save: jest.fn(),
      data: {
        sessions: {}
      }
    };

    // Default fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});

    ralphLoop = new RalphLoop(mockSessionManager);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with session manager', () => {
      expect(ralphLoop.sessionManager).toBe(mockSessionManager);
    });

    it('should initialize activeLoops as empty Map', () => {
      expect(ralphLoop.activeLoops).toBeInstanceOf(Map);
      expect(ralphLoop.activeLoops.size).toBe(0);
    });

    it('should initialize detection intervals as empty Map', () => {
      expect(ralphLoop.detectionIntervals).toBeInstanceOf(Map);
      expect(ralphLoop.detectionIntervals.size).toBe(0);
    });

    it('should set default detection settings', () => {
      expect(ralphLoop.detectionSettings.method).toBe('both');
      expect(ralphLoop.detectionSettings.interval).toBe(60);
    });

    it('should extend EventEmitter', () => {
      expect(ralphLoop).toBeInstanceOf(EventEmitter);
    });
  });

  describe('setConfig()', () => {
    it('should set bot config reference', () => {
      const mockBotConfig = { get: jest.fn() };

      ralphLoop.setConfig(mockBotConfig);

      expect(ralphLoop.botConfig).toBe(mockBotConfig);
    });
  });

  describe('isProviderConfigured()', () => {
    it('should return false when botConfig is null', () => {
      ralphLoop.botConfig = null;

      expect(ralphLoop.isProviderConfigured()).toBe(false);
    });

    it('should return false when provider settings are missing', () => {
      ralphLoop.botConfig = {
        get: jest.fn().mockReturnValue(null)
      };

      expect(ralphLoop.isProviderConfigured()).toBe(false);
    });

    it('should return true when all provider settings exist', () => {
      ralphLoop.botConfig = {
        get: jest.fn((key) => {
          if (key === 'provider.name') return 'openai';
          if (key === 'provider.apiKey') return 'test-key';
          if (key === 'provider.baseUrl') return 'https://api.example.com';
          return null;
        })
      };

      expect(ralphLoop.isProviderConfigured()).toBe(true);
    });
  });

  describe('getProviderConfig()', () => {
    it('should return null when botConfig is null', () => {
      ralphLoop.botConfig = null;

      expect(ralphLoop.getProviderConfig()).toBeNull();
    });

    it('should return provider configuration', () => {
      ralphLoop.botConfig = {
        get: jest.fn((key) => {
          if (key === 'provider.name') return 'openai';
          if (key === 'provider.baseUrl') return 'https://api.example.com';
          if (key === 'provider.apiKey') return 'test-key';
          if (key === 'provider.model') return 'gpt-4';
          return null;
        })
      };

      const config = ralphLoop.getProviderConfig();

      expect(config.provider).toBe('openai');
      expect(config.baseUrl).toBe('https://api.example.com');
      expect(config.apiKey).toBe('test-key');
      expect(config.model).toBe('gpt-4');
    });

    it('should use default model when not specified', () => {
      ralphLoop.botConfig = {
        get: jest.fn((key) => {
          if (key === 'provider.model') return null;
          return 'test';
        })
      };

      const config = ralphLoop.getProviderConfig();

      expect(config.model).toBe('gpt-4o-mini');
    });
  });

  describe('initLoopState()', () => {
    it('should initialize loop state with defaults', () => {
      const state = ralphLoop.initLoopState('test-session');

      expect(state.sessionName).toBe('test-session');
      expect(state.status).toBe('idle');
      expect(state.iterationCount).toBe(0);
      expect(state.maxIterations).toBe(50);
      expect(state.circuitBreaker.noProgressCount).toBe(0);
      expect(state.circuitBreaker.threshold).toBe(3);
    });

    it('should accept custom config', () => {
      const state = ralphLoop.initLoopState('test-session', {
        maxIterations: 100,
        circuitBreakerThreshold: 5
      });

      expect(state.maxIterations).toBe(100);
      expect(state.circuitBreaker.threshold).toBe(5);
    });

    it('should store state in activeLoops', () => {
      ralphLoop.initLoopState('test-session');

      expect(ralphLoop.activeLoops.has('test-session')).toBe(true);
    });
  });

  describe('getLoopState()', () => {
    it('should return null for non-existent session', () => {
      expect(ralphLoop.getLoopState('nonexistent')).toBeNull();
    });

    it('should return state for existing session', () => {
      ralphLoop.initLoopState('test-session');

      const state = ralphLoop.getLoopState('test-session');

      expect(state).toBeDefined();
      expect(state.sessionName).toBe('test-session');
    });
  });

  describe('updateDetectionSettings()', () => {
    it('should update detection settings', () => {
      ralphLoop.updateDetectionSettings({ method: 'logs', interval: 30 });

      expect(ralphLoop.detectionSettings.method).toBe('logs');
      expect(ralphLoop.detectionSettings.interval).toBe(30);
    });

    it('should restart detection for active loops', () => {
      const restartSpy = jest.spyOn(ralphLoop, 'restartDetection');
      ralphLoop.initLoopState('session-1');

      ralphLoop.updateDetectionSettings({ interval: 30 });

      expect(restartSpy).toHaveBeenCalledWith('session-1');
    });
  });

  describe('startLogDetection()', () => {
    it('should start interval for log checking', () => {
      ralphLoop.startLogDetection('test-session');

      expect(ralphLoop.detectionIntervals.has('test-session')).toBe(true);
    });

    it('should stop existing interval before starting new one', () => {
      const stopSpy = jest.spyOn(ralphLoop, 'stopLogDetection');

      ralphLoop.startLogDetection('test-session');
      ralphLoop.startLogDetection('test-session');

      expect(stopSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopLogDetection()', () => {
    it('should clear interval for session', () => {
      ralphLoop.startLogDetection('test-session');
      ralphLoop.stopLogDetection('test-session');

      expect(ralphLoop.detectionIntervals.has('test-session')).toBe(false);
    });

    it('should handle non-existent session gracefully', () => {
      expect(() => ralphLoop.stopLogDetection('nonexistent')).not.toThrow();
    });
  });

  describe('checkStatusFile()', () => {
    it('should return false when session not found', async () => {
      mockSessionManager.get.mockReturnValue(null);

      const result = await ralphLoop.checkStatusFile('test-session');

      expect(result).toBe(false);
    });

    it('should return false when status file not found', async () => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/project' });
      fs.existsSync.mockReturnValue(false);

      const result = await ralphLoop.checkStatusFile('test-session');

      expect(result).toBe(false);
    });

    it('should return true when status is completed', async () => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/project' });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ status: 'completed' }));

      const result = await ralphLoop.checkStatusFile('test-session');

      expect(result).toBe(true);
    });

    it('should return false for non-completed status', async () => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/project' });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ status: 'in_progress' }));

      const result = await ralphLoop.checkStatusFile('test-session');

      expect(result).toBe(false);
    });

    it('should handle JSON parse errors', async () => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/project' });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      const result = await ralphLoop.checkStatusFile('test-session');

      expect(result).toBe(false);
    });
  });

  describe('checkLogsPattern()', () => {
    beforeEach(() => {
      ralphLoop.verifyRecentCompletion = jest.fn().mockReturnValue(true);
    });

    it('should return false for empty logs', async () => {
      const result = await ralphLoop.checkLogsPattern('');

      expect(result).toBe(false);
    });

    it('should return false for null logs', async () => {
      const result = await ralphLoop.checkLogsPattern(null);

      expect(result).toBe(false);
    });

    it('should detect "done" signal', async () => {
      const result = await ralphLoop.checkLogsPattern('Task completed\nDONE');

      expect(result).toBe(true);
    });

    it('should detect task completed signal', async () => {
      const result = await ralphLoop.checkLogsPattern('All work done\nTask completed');

      expect(result).toBe(true);
    });

    it('should detect commit signals', async () => {
      const result = await ralphLoop.checkLogsPattern('Successfully committed\ncommit hash: abc123');

      expect(result).toBe(true);
    });

    it('should verify recent completion', async () => {
      ralphLoop.verifyRecentCompletion = jest.fn().mockReturnValue(false);

      const result = await ralphLoop.checkLogsPattern('DONE but not recent');

      expect(result).toBe(false);
    });
  });

  describe('verifyRecentCompletion()', () => {
    it('should return true for git commit patterns', () => {
      const lines = ['[main abc1234] Commit message'];

      expect(ralphLoop.verifyRecentCompletion(lines)).toBe(true);
    });

    it('should return true for files changed pattern', () => {
      const lines = ['2 files changed, 10 insertions(+)'];

      expect(ralphLoop.verifyRecentCompletion(lines)).toBe(true);
    });

    it('should return true for DONE at end of output', () => {
      const lines = ['Some output', 'More output', 'DONE'];

      expect(ralphLoop.verifyRecentCompletion(lines)).toBe(true);
    });

    it('should return false when no completion signals', () => {
      const lines = ['Random output', 'No completion signals'];

      expect(ralphLoop.verifyRecentCompletion(lines)).toBe(false);
    });
  });

  describe('buildPrompt()', () => {
    it('should return null when no current task', () => {
      mockSessionManager.getCurrentTask.mockReturnValue(null);

      const result = ralphLoop.buildPrompt('test-session');

      expect(result).toBeNull();
    });

    it('should include task info in prompt', () => {
      mockSessionManager.getCurrentTask.mockReturnValue({
        id: 'task-1',
        title: 'Build feature X',
        description: 'Build a new feature'
      });
      mockSessionManager.getProgressRaw.mockReturnValue('');
      mockSessionManager.loadPrd.mockReturnValue(null);

      const result = ralphLoop.buildPrompt('test-session');

      expect(result).toContain('Build feature X');
      expect(result).toContain('Build a new feature');
      expect(result).toContain('task-1');
    });

    it('should include PRD context when available', () => {
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });
      mockSessionManager.loadPrd.mockReturnValue({
        name: 'MyProject',
        description: 'Project description'
      });

      const result = ralphLoop.buildPrompt('test-session');

      expect(result).toContain('MyProject');
      expect(result).toContain('Project description');
    });

    it('should include attempt info for retries', () => {
      mockSessionManager.getCurrentTask.mockReturnValue({
        id: 'task-1',
        title: 'Test',
        attempts: 2
      });

      const result = ralphLoop.buildPrompt('test-session');

      expect(result).toContain('attempt #3');
    });

    it('should include previous learnings', () => {
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });
      mockSessionManager.getProgressRaw.mockReturnValue('Previous error: something failed');

      const result = ralphLoop.buildPrompt('test-session');

      expect(result).toContain('Previous Learnings');
      expect(result).toContain('something failed');
    });

    it('should include task tracking instructions', () => {
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });

      const result = ralphLoop.buildPrompt('test-session');

      expect(result).toContain('.ralph/status.json');
      expect(result).toContain('TaskCreate');
      expect(result).toContain('DONE');
    });
  });

  describe('startLoop()', () => {
    beforeEach(() => {
      mockSessionManager.get.mockReturnValue({
        name: 'test-session',
        projectPath: '/project',
        alive: true
      });
      mockSessionManager.getCurrentTask.mockReturnValue({
        id: 'task-1',
        title: 'Test task'
      });
      mockSessionManager.data.sessions['test-session'] = {};

      // Mock restartSessionWithPrompt to avoid actual execution
      ralphLoop.restartSessionWithPrompt = jest.fn().mockResolvedValue();
    });

    it('should throw error for non-existent session', async () => {
      mockSessionManager.get.mockReturnValue(null);

      await expect(ralphLoop.startLoop('nonexistent'))
        .rejects.toThrow('not found');
    });

    it('should throw error if loop is already running', async () => {
      ralphLoop.initLoopState('test-session');
      ralphLoop.activeLoops.get('test-session').status = 'running';

      await expect(ralphLoop.startLoop('test-session'))
        .rejects.toThrow('already running');
    });

    it('should emit complete if no tasks', async () => {
      mockSessionManager.getCurrentTask.mockReturnValue(null);
      const completeSpy = jest.fn();
      ralphLoop.on('complete', completeSpy);

      await ralphLoop.startLoop('test-session');

      expect(completeSpy).toHaveBeenCalled();
    });

    it('should clear status file on start', async () => {
      await ralphLoop.startLoop('test-session');

      expect(mockSessionManager.clearStatusFile).toHaveBeenCalledWith('test-session');
    });

    it('should emit started event', async () => {
      const startedSpy = jest.fn();
      ralphLoop.on('started', startedSpy);

      await ralphLoop.startLoop('test-session');

      expect(startedSpy).toHaveBeenCalled();
    });

    it('should start log detection', async () => {
      const startDetectionSpy = jest.spyOn(ralphLoop, 'startLogDetection');

      await ralphLoop.startLoop('test-session');

      expect(startDetectionSpy).toHaveBeenCalledWith('test-session');
    });
  });

  describe('pauseLoop()', () => {
    beforeEach(() => {
      ralphLoop.initLoopState('test-session');
      ralphLoop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should throw error when no loop state', () => {
      expect(() => ralphLoop.pauseLoop('nonexistent'))
        .toThrow('No loop state');
    });

    it('should throw error when not running', () => {
      ralphLoop.activeLoops.get('test-session').status = 'paused';

      expect(() => ralphLoop.pauseLoop('test-session'))
        .toThrow('not running');
    });

    it('should set status to paused', () => {
      ralphLoop.pauseLoop('test-session');

      expect(ralphLoop.activeLoops.get('test-session').status).toBe('paused');
    });

    it('should stop log detection', () => {
      const stopSpy = jest.spyOn(ralphLoop, 'stopLogDetection');

      ralphLoop.pauseLoop('test-session');

      expect(stopSpy).toHaveBeenCalledWith('test-session');
    });

    it('should emit paused event', () => {
      const pausedSpy = jest.fn();
      ralphLoop.on('paused', pausedSpy);

      ralphLoop.pauseLoop('test-session');

      expect(pausedSpy).toHaveBeenCalled();
    });
  });

  describe('resumeLoop()', () => {
    beforeEach(() => {
      ralphLoop.initLoopState('test-session');
      ralphLoop.activeLoops.get('test-session').status = 'paused';
      mockSessionManager.data.sessions['test-session'] = {};
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });
      ralphLoop.restartSessionWithPrompt = jest.fn().mockResolvedValue();
    });

    it('should throw error when not paused or stuck', () => {
      ralphLoop.activeLoops.get('test-session').status = 'running';

      expect(ralphLoop.resumeLoop('test-session'))
        .rejects.toThrow('not paused or stuck');
    });

    it('should clear status file on resume', async () => {
      await ralphLoop.resumeLoop('test-session');

      expect(mockSessionManager.clearStatusFile).toHaveBeenCalledWith('test-session');
    });

    it('should reset circuit breaker when resuming from stuck', async () => {
      ralphLoop.activeLoops.get('test-session').status = 'stuck';
      ralphLoop.activeLoops.get('test-session').circuitBreaker.noProgressCount = 5;

      await ralphLoop.resumeLoop('test-session');

      expect(ralphLoop.activeLoops.get('test-session').circuitBreaker.noProgressCount).toBe(0);
    });

    it('should emit resumed event', async () => {
      const resumedSpy = jest.fn();
      ralphLoop.on('resumed', resumedSpy);

      await ralphLoop.resumeLoop('test-session');

      expect(resumedSpy).toHaveBeenCalled();
    });
  });

  describe('stopLoop()', () => {
    beforeEach(() => {
      ralphLoop.initLoopState('test-session');
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should return null for non-existent session', () => {
      const result = ralphLoop.stopLoop('nonexistent');

      expect(result).toBeNull();
    });

    it('should stop log detection', () => {
      const stopSpy = jest.spyOn(ralphLoop, 'stopLogDetection');

      ralphLoop.stopLoop('test-session');

      expect(stopSpy).toHaveBeenCalledWith('test-session');
    });

    it('should set status to idle', () => {
      ralphLoop.stopLoop('test-session');

      expect(ralphLoop.activeLoops.get('test-session').status).toBe('idle');
    });

    it('should emit stopped event', () => {
      const stoppedSpy = jest.fn();
      ralphLoop.on('stopped', stoppedSpy);

      ralphLoop.stopLoop('test-session');

      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  describe('processTaskCompletion()', () => {
    beforeEach(() => {
      ralphLoop.initLoopState('test-session');
      ralphLoop.activeLoops.get('test-session').status = 'running';
      mockSessionManager.getCurrentTask.mockReturnValue({ id: 'task-1', title: 'Test' });
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should mark task complete on success', () => {
      ralphLoop.processTaskCompletion('test-session', {
        completion: { isComplete: true },
        stuck: { isStuck: false, errors: [] }
      });

      expect(mockSessionManager.markTaskComplete).toHaveBeenCalledWith('test-session', 'task-1');
    });

    it('should emit taskComplete event', () => {
      const completeSpy = jest.fn();
      ralphLoop.on('taskComplete', completeSpy);

      ralphLoop.processTaskCompletion('test-session', {
        completion: { isComplete: true },
        stuck: { isStuck: false, errors: [] }
      });

      expect(completeSpy).toHaveBeenCalled();
    });

    it('should reset circuit breaker on success', () => {
      ralphLoop.activeLoops.get('test-session').circuitBreaker.noProgressCount = 2;

      ralphLoop.processTaskCompletion('test-session', {
        completion: { isComplete: true },
        stuck: { isStuck: false, errors: [] }
      });

      expect(ralphLoop.activeLoops.get('test-session').circuitBreaker.noProgressCount).toBe(0);
    });

    it('should increment attempts on stuck', () => {
      ralphLoop.processTaskCompletion('test-session', {
        completion: { isComplete: false },
        stuck: { isStuck: true, errors: [{ type: 'error', message: 'Failed' }] }
      });

      expect(mockSessionManager.incrementTaskAttempts).toHaveBeenCalledWith('test-session', 'task-1');
    });

    it('should log errors on stuck', () => {
      ralphLoop.processTaskCompletion('test-session', {
        completion: { isComplete: false },
        stuck: { isStuck: true, errors: [{ type: 'error', message: 'Failed' }] }
      });

      expect(mockSessionManager.logError).toHaveBeenCalled();
    });
  });

  describe('checkCircuitBreaker()', () => {
    beforeEach(() => {
      ralphLoop.initLoopState('test-session');
      mockSessionManager.data.sessions['test-session'] = {};
    });

    it('should trigger stuck when noProgressCount exceeds threshold', () => {
      const state = ralphLoop.activeLoops.get('test-session');
      state.circuitBreaker.noProgressCount = 3;

      const stuckSpy = jest.fn();
      ralphLoop.on('stuck', stuckSpy);

      ralphLoop.checkCircuitBreaker('test-session', state);

      expect(state.status).toBe('stuck');
      expect(stuckSpy).toHaveBeenCalled();
    });

    it('should trigger stuck when errorCount exceeds threshold', () => {
      const state = ralphLoop.activeLoops.get('test-session');
      state.circuitBreaker.errorCount = 3;

      ralphLoop.checkCircuitBreaker('test-session', state);

      expect(state.status).toBe('stuck');
    });

    it('should not trigger stuck when below threshold', () => {
      const state = ralphLoop.activeLoops.get('test-session');
      state.circuitBreaker.noProgressCount = 1;
      state.circuitBreaker.errorCount = 1;

      ralphLoop.checkCircuitBreaker('test-session', state);

      expect(state.status).toBe('idle');
    });
  });

  describe('getAllLoopStatus()', () => {
    it('should return empty object when no loops', () => {
      const result = ralphLoop.getAllLoopStatus();

      expect(result).toEqual({});
    });

    it('should return status for all active loops', () => {
      ralphLoop.initLoopState('session-1');
      ralphLoop.initLoopState('session-2');
      ralphLoop.activeLoops.get('session-1').status = 'running';
      ralphLoop.activeLoops.get('session-2').status = 'paused';

      const result = ralphLoop.getAllLoopStatus();

      expect(result['session-1'].status).toBe('running');
      expect(result['session-2'].status).toBe('paused');
    });
  });

  describe('sleep()', () => {
    it('should return a promise', () => {
      const result = ralphLoop.sleep(100);

      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve after specified time', async () => {
      const promise = ralphLoop.sleep(1000);

      jest.advanceTimersByTime(1000);

      await promise;
    });
  });

  describe('writeStatusFile()', () => {
    beforeEach(() => {
      mockSessionManager.get.mockReturnValue({ projectPath: '/project' });
    });

    it('should create .ralph directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);

      ralphLoop.writeStatusFile('test-session', { id: 'task-1' }, {
        status: 'completed',
        reason: 'Done',
        confidence: 0.9
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith('/project/.ralph', { recursive: true });
    });

    it('should write status file with correct content', () => {
      ralphLoop.writeStatusFile('test-session', { id: 'task-1' }, {
        status: 'completed',
        reason: 'Task done',
        confidence: 0.95
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/project/.ralph/status.json',
        expect.stringContaining('"status": "completed"')
      );
    });

    it('should handle errors gracefully', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should not throw
      expect(() => ralphLoop.writeStatusFile('test-session', { id: 'task-1' }, {}))
        .not.toThrow();
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

      const result = await ralphLoop.callLLM(config, 'Test prompt');

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

      await expect(ralphLoop.callLLM(config, 'Test'))
        .rejects.toThrow('API error');
    });

    // Note: Request error/timeout tests are difficult to mock reliably
    // The actual error handling is tested through integration tests
  });
});
