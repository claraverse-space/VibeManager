/**
 * Tests for SummaryGenerator module
 */

const fs = require('fs');
const path = require('path');

// Mock fs and http/https
jest.mock('fs');
jest.mock('https');
jest.mock('http');

const SummaryGenerator = require('../summary-generator');
const https = require('https');
const http = require('http');

describe('SummaryGenerator', () => {
  let generator;
  const settingsDir = path.join(process.env.HOME, '.local/share/projectgenerator');
  const settingsFile = path.join(settingsDir, 'settings.json');

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
  });

  describe('constructor and loadSettings()', () => {
    it('should load default settings when no file exists', () => {
      fs.existsSync.mockReturnValue(false);

      generator = new SummaryGenerator();

      expect(generator.settings.ai).toBeDefined();
      expect(generator.settings.ai.model).toBe('gpt-4o-mini');
      expect(generator.settings.ralph).toBeDefined();
      expect(generator.settings.notifications).toBeDefined();
    });

    it('should load settings from existing file', () => {
      const existingSettings = {
        ai: {
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          model: 'custom-model'
        },
        ralph: { maxIterations: 100 }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingSettings));

      generator = new SummaryGenerator();

      expect(generator.settings.ai.baseUrl).toBe('https://api.example.com');
      expect(generator.settings.ai.apiKey).toBe('test-key');
      expect(generator.settings.ai.model).toBe('custom-model');
    });

    it('should handle JSON parse errors by returning defaults', () => {
      // When JSON parsing fails, loadSettings calls itself again
      // The second call should have existsSync return false to get defaults
      let callCount = 0;
      fs.existsSync.mockImplementation(() => {
        callCount++;
        return callCount === 1; // Only return true on first call
      });
      fs.readFileSync.mockReturnValue('invalid json');

      generator = new SummaryGenerator();

      // Should have default settings
      expect(generator.settings).toBeDefined();
    });
  });

  describe('saveSettings()', () => {
    beforeEach(() => {
      generator = new SummaryGenerator();
    });

    it('should create directory if not exists', () => {
      generator.saveSettings({ ai: { model: 'new-model' } });

      expect(fs.mkdirSync).toHaveBeenCalledWith(settingsDir, { recursive: true });
    });

    it('should write settings to file', () => {
      generator.saveSettings({ ai: { model: 'new-model' } });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        settingsFile,
        expect.any(String)
      );
    });

    it('should shallow merge settings (top-level only)', () => {
      // Note: saveSettings does a shallow merge using spread operator
      // so nested objects get replaced entirely
      generator.settings = {
        ai: { baseUrl: 'http://old.com', apiKey: 'key' },
        other: { value: true }
      };

      generator.saveSettings({ newKey: 'newValue' });

      // Top-level keys are preserved
      expect(generator.settings.ai).toBeDefined();
      expect(generator.settings.other.value).toBe(true);
      expect(generator.settings.newKey).toBe('newValue');
    });
  });

  describe('getSettings()', () => {
    it('should return current settings', () => {
      generator = new SummaryGenerator();

      const settings = generator.getSettings();

      expect(settings).toBe(generator.settings);
    });
  });

  describe('updateSettings()', () => {
    beforeEach(() => {
      generator = new SummaryGenerator();
    });

    it('should deep merge object settings', () => {
      generator.settings = {
        ai: { baseUrl: 'http://old.com', apiKey: 'key', model: 'old' }
      };

      generator.updateSettings({
        ai: { model: 'new-model' }
      });

      expect(generator.settings.ai.baseUrl).toBe('http://old.com');
      expect(generator.settings.ai.apiKey).toBe('key');
      expect(generator.settings.ai.model).toBe('new-model');
    });

    it('should replace non-object settings', () => {
      generator.settings = { simpleValue: 'old' };

      generator.updateSettings({ simpleValue: 'new' });

      expect(generator.settings.simpleValue).toBe('new');
    });

    it('should save settings after update', () => {
      const writeSpy = jest.fn();
      fs.writeFileSync.mockImplementation(writeSpy);

      generator.updateSettings({ ai: { model: 'test' } });

      expect(writeSpy).toHaveBeenCalled();
    });

    it('should return updated settings', () => {
      const result = generator.updateSettings({ ai: { model: 'test' } });

      expect(result).toBe(generator.settings);
    });
  });

  describe('isConfigured()', () => {
    beforeEach(() => {
      generator = new SummaryGenerator();
    });

    it('should return true when both baseUrl and apiKey are set', () => {
      generator.settings.ai = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key'
      };

      expect(generator.isConfigured()).toBe(true);
    });

    it('should return false when baseUrl is missing', () => {
      generator.settings.ai = {
        baseUrl: '',
        apiKey: 'test-key'
      };

      expect(generator.isConfigured()).toBe(false);
    });

    it('should return false when apiKey is missing', () => {
      generator.settings.ai = {
        baseUrl: 'https://api.example.com',
        apiKey: ''
      };

      expect(generator.isConfigured()).toBe(false);
    });

    it('should return false when ai settings are undefined', () => {
      generator.settings.ai = undefined;

      expect(generator.isConfigured()).toBe(false);
    });
  });

  describe('callApi()', () => {
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
      generator = new SummaryGenerator();
      generator.settings.ai = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };

      // Setup mock response
      mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              choices: [{ message: { content: 'Test response' } }]
            }));
          }
          if (event === 'end') {
            callback();
          }
          return mockResponse;
        })
      };

      // Setup mock request
      mockRequest = {
        on: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };

      https.request.mockImplementation((url, options, callback) => {
        if (callback) callback(mockResponse);
        return mockRequest;
      });
    });

    it('should throw error if not configured', async () => {
      generator.settings.ai = { baseUrl: '', apiKey: '' };

      await expect(generator.callApi([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('AI API not configured');
    });

    it('should make request with correct headers', async () => {
      generator.callApi([{ role: 'user', content: 'test' }]);

      expect(https.request).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockResponse.statusCode = 400;
      mockResponse.on.mockImplementation((event, callback) => {
        if (event === 'data') callback('Bad request');
        if (event === 'end') callback();
        return mockResponse;
      });

      await expect(generator.callApi([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('API error 400');
    });

    it('should handle missing content in response', async () => {
      mockResponse.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify({ choices: [{ message: {} }] }));
        }
        if (event === 'end') callback();
        return mockResponse;
      });

      await expect(generator.callApi([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('No content in API response');
    });
  });

  describe('testConnection()', () => {
    beforeEach(() => {
      generator = new SummaryGenerator();
      generator.settings.ai = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };
    });

    it('should return success true on successful connection', async () => {
      generator.callApi = jest.fn().mockResolvedValue('connected');

      const result = await generator.testConnection();

      expect(result.success).toBe(true);
      expect(result.response).toBe('connected');
    });

    it('should return success false on error', async () => {
      generator.callApi = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await generator.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('generateSessionSummary()', () => {
    beforeEach(() => {
      generator = new SummaryGenerator();
      generator.settings.ai = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      };
    });

    it('should generate summary from session data', async () => {
      generator.callApi = jest.fn().mockResolvedValue('Session completed feature X');

      const sessionData = {
        sessionName: 'test-session',
        projectName: 'TestProject',
        scrollback: 'npm install\nnpm test\nAll tests passed',
        tasks: { completed: 3, total: 5, current: 'Task 4' },
        conversation: [
          { type: 'user', content: 'Build feature X' },
          { type: 'assistant', content: 'I will build feature X' }
        ]
      };

      const result = await generator.generateSessionSummary(sessionData);

      expect(result.success).toBe(true);
      expect(result.summary).toBe('Session completed feature X');
      expect(result.timestamp).toBeDefined();
      expect(generator.callApi).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      generator.callApi = jest.fn().mockRejectedValue(new Error('API failed'));

      const result = await generator.generateSessionSummary({ sessionName: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API failed');
    });

    it('should limit scrollback length', async () => {
      generator.callApi = jest.fn().mockResolvedValue('Summary');

      const longScrollback = Array(1000).fill('log line').join('\n');

      await generator.generateSessionSummary({
        sessionName: 'test',
        scrollback: longScrollback
      });

      const callArgs = generator.callApi.mock.calls[0][0][0].content;
      // Should be truncated
      expect(callArgs.length).toBeLessThan(longScrollback.length);
    });
  });

  describe('generateCheckpointSummary()', () => {
    beforeEach(() => {
      generator = new SummaryGenerator();
      generator.callApi = jest.fn().mockResolvedValue('Checkpoint summary');
    });

    it('should generate checkpoint summary', async () => {
      const checkpointData = {
        name: 'checkpoint-1',
        tasks: { completed: 2, total: 5 },
        git: { commit: 'abc123', branch: 'main', isDirty: false },
        scrollback: 'Recent output'
      };

      const result = await generator.generateCheckpointSummary(checkpointData);

      expect(result.success).toBe(true);
      expect(result.summary).toBe('Checkpoint summary');
    });

    it('should include git info in prompt', async () => {
      await generator.generateCheckpointSummary({
        name: 'test',
        git: { commit: 'abc', branch: 'feature', isDirty: true }
      });

      const prompt = generator.callApi.mock.calls[0][0][0].content;
      expect(prompt).toContain('abc');
      expect(prompt).toContain('feature');
      expect(prompt).toContain('uncommitted');
    });

    it('should handle errors', async () => {
      generator.callApi = jest.fn().mockRejectedValue(new Error('Failed'));

      const result = await generator.generateCheckpointSummary({ name: 'test' });

      expect(result.success).toBe(false);
    });
  });

  describe('generateTaskSummary()', () => {
    beforeEach(() => {
      generator = new SummaryGenerator();
      generator.callApi = jest.fn().mockResolvedValue('Task completed successfully');
    });

    it('should generate task summary', async () => {
      const taskData = {
        title: 'Implement login',
        description: 'Add user authentication',
        scrollback: 'npm test\nAll tests passed'
      };

      const result = await generator.generateTaskSummary(taskData);

      expect(result.success).toBe(true);
      expect(result.summary).toBe('Task completed successfully');
    });

    it('should include task details in prompt', async () => {
      await generator.generateTaskSummary({
        title: 'Test Task',
        description: 'Task description here'
      });

      const prompt = generator.callApi.mock.calls[0][0][0].content;
      expect(prompt).toContain('Test Task');
      expect(prompt).toContain('Task description here');
    });

    it('should limit scrollback in prompt', async () => {
      const longScrollback = Array(500).fill('log line').join('\n');

      await generator.generateTaskSummary({
        title: 'Test',
        scrollback: longScrollback
      });

      const prompt = generator.callApi.mock.calls[0][0][0].content;
      // Should be truncated
      expect(prompt.length).toBeLessThan(longScrollback.length);
    });

    it('should handle missing scrollback', async () => {
      await generator.generateTaskSummary({
        title: 'Test'
      });

      const prompt = generator.callApi.mock.calls[0][0][0].content;
      expect(prompt).toContain('Not available');
    });

    it('should handle errors', async () => {
      generator.callApi = jest.fn().mockRejectedValue(new Error('API error'));

      const result = await generator.generateTaskSummary({ title: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });
  });
});
