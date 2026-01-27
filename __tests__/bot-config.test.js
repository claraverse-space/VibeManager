/**
 * Tests for BotConfig module
 */

const path = require('path');
const fs = require('fs');

// Mock fs module
jest.mock('fs');

const BotConfig = require('../bot-config');

describe('BotConfig', () => {
  let config;
  const mockConfigPath = path.join(process.env.HOME || '/root', '.vibemanager', 'bot-config.json');

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module state
    jest.resetModules();

    // Default: no config file exists
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
  });

  describe('constructor and load()', () => {
    it('should create default config when no config file exists', () => {
      fs.existsSync.mockReturnValue(false);

      config = new BotConfig();

      expect(config.config).toBeDefined();
      expect(config.config.telegram).toBeDefined();
      expect(config.config.notifications).toBeDefined();
      expect(config.config.rateLimit).toBeDefined();
    });

    it('should load config from existing file', () => {
      const existingConfig = {
        telegram: {
          enabled: true,
          token: 'test-token',
          allowedUsers: ['123', '456'],
          commandPrefix: '/'
        },
        notifications: {
          taskComplete: true,
          taskStuck: false
        }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));

      config = new BotConfig();

      expect(config.config.telegram.enabled).toBe(true);
      expect(config.config.telegram.token).toBe('test-token');
      expect(config.config.telegram.allowedUsers).toEqual(['123', '456']);
    });

    it('should handle config file parse errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      // Should not throw, should use default config
      config = new BotConfig();

      expect(config.config).toBeDefined();
      expect(config.config.telegram).toBeDefined();
    });

    it('should set configPath correctly', () => {
      config = new BotConfig();

      expect(config.configPath).toBe(mockConfigPath);
    });
  });

  describe('parseUserList()', () => {
    beforeEach(() => {
      config = new BotConfig();
    });

    it('should return empty array for empty string', () => {
      expect(config.parseUserList('')).toEqual([]);
    });

    it('should return empty array for null/undefined', () => {
      expect(config.parseUserList(null)).toEqual([]);
      expect(config.parseUserList(undefined)).toEqual([]);
    });

    it('should parse comma-separated user IDs', () => {
      expect(config.parseUserList('123,456,789')).toEqual(['123', '456', '789']);
    });

    it('should trim whitespace from IDs', () => {
      expect(config.parseUserList('123, 456 , 789 ')).toEqual(['123', '456', '789']);
    });

    it('should filter out empty values', () => {
      expect(config.parseUserList('123,,456,,')).toEqual(['123', '456']);
    });
  });

  describe('save()', () => {
    beforeEach(() => {
      config = new BotConfig();
    });

    it('should create directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      config.save();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(mockConfigPath),
        { recursive: true }
      );
    });

    it('should write config to file', () => {
      config.save();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        expect.any(String)
      );
    });

    it('should handle write errors gracefully', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });

      // Should not throw
      expect(() => config.save()).not.toThrow();
    });
  });

  describe('get()', () => {
    beforeEach(() => {
      config = new BotConfig();
      config.config = {
        telegram: {
          enabled: true,
          token: 'test-token',
          nested: {
            deep: 'value'
          }
        },
        notifications: {
          taskComplete: true
        }
      };
    });

    it('should get top-level value', () => {
      expect(config.get('telegram')).toEqual({
        enabled: true,
        token: 'test-token',
        nested: { deep: 'value' }
      });
    });

    it('should get nested value with dot notation', () => {
      expect(config.get('telegram.enabled')).toBe(true);
      expect(config.get('telegram.token')).toBe('test-token');
    });

    it('should get deeply nested values', () => {
      expect(config.get('telegram.nested.deep')).toBe('value');
    });

    it('should return undefined for non-existent keys', () => {
      expect(config.get('nonexistent')).toBeUndefined();
      expect(config.get('telegram.nonexistent')).toBeUndefined();
    });

    it('should return undefined for partially invalid paths', () => {
      expect(config.get('telegram.enabled.invalid')).toBeUndefined();
    });
  });

  describe('set()', () => {
    beforeEach(() => {
      config = new BotConfig();
      config.config = {
        telegram: {
          enabled: false
        }
      };
    });

    it('should set top-level value', () => {
      config.set('newKey', 'newValue');

      expect(config.config.newKey).toBe('newValue');
    });

    it('should set nested value with dot notation', () => {
      config.set('telegram.enabled', true);

      expect(config.config.telegram.enabled).toBe(true);
    });

    it('should create intermediate objects if needed', () => {
      config.set('new.nested.value', 'test');

      expect(config.config.new.nested.value).toBe('test');
    });

    it('should call save() after setting value', () => {
      const saveSpy = jest.spyOn(config, 'save');

      config.set('telegram.enabled', true);

      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('isTelegramEnabled()', () => {
    beforeEach(() => {
      config = new BotConfig();
    });

    it('should return true when telegram is enabled and token exists', () => {
      config.config.telegram = { enabled: true, token: 'test-token' };

      expect(config.isTelegramEnabled()).toBe(true);
    });

    it('should return false when telegram is disabled', () => {
      config.config.telegram = { enabled: false, token: 'test-token' };

      expect(config.isTelegramEnabled()).toBe(false);
    });

    it('should return false when no token', () => {
      config.config.telegram = { enabled: true, token: '' };

      expect(config.isTelegramEnabled()).toBe(false);
    });

    it('should return false when both disabled and no token', () => {
      config.config.telegram = { enabled: false, token: '' };

      expect(config.isTelegramEnabled()).toBe(false);
    });
  });

  describe('isUserAllowed()', () => {
    beforeEach(() => {
      config = new BotConfig();
    });

    it('should return true when allowedUsers is empty (no whitelist)', () => {
      config.config.telegram = { allowedUsers: [] };

      expect(config.isUserAllowed('telegram', '12345')).toBe(true);
    });

    it('should return true when user is in allowedUsers', () => {
      config.config.telegram = { allowedUsers: ['12345', '67890'] };

      expect(config.isUserAllowed('telegram', '12345')).toBe(true);
      expect(config.isUserAllowed('telegram', '67890')).toBe(true);
    });

    it('should return false when user is not in allowedUsers', () => {
      config.config.telegram = { allowedUsers: ['12345'] };

      expect(config.isUserAllowed('telegram', '99999')).toBe(false);
    });

    it('should convert userId to string for comparison', () => {
      config.config.telegram = { allowedUsers: ['12345'] };

      expect(config.isUserAllowed('telegram', 12345)).toBe(true);
    });

    it('should handle unknown platform gracefully', () => {
      expect(config.isUserAllowed('unknown', '12345')).toBe(true);
    });
  });
});
