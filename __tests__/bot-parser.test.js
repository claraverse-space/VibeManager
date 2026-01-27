/**
 * Tests for BotParser module
 */

const BotParser = require('../bot-parser');

describe('BotParser', () => {
  let parser;

  beforeEach(() => {
    parser = new BotParser();
  });

  describe('constructor', () => {
    it('should initialize with command definitions', () => {
      expect(parser.commands).toBeDefined();
      expect(parser.commands.create).toBeDefined();
      expect(parser.commands.start).toBeDefined();
      expect(parser.commands.stop).toBeDefined();
      expect(parser.commands.ralph).toBeDefined();
    });

    it('should define ralph command with subcommands', () => {
      expect(parser.commands.ralph.subcommands).toBeDefined();
      expect(parser.commands.ralph.subcommands.start).toBeDefined();
      expect(parser.commands.ralph.subcommands.pause).toBeDefined();
      expect(parser.commands.ralph.subcommands.resume).toBeDefined();
      expect(parser.commands.ralph.subcommands.stop).toBeDefined();
    });
  });

  describe('parse()', () => {
    describe('basic command parsing', () => {
      it('should return null for empty text', () => {
        expect(parser.parse('')).toBeNull();
        expect(parser.parse(null)).toBeNull();
        expect(parser.parse(undefined)).toBeNull();
      });

      it('should return null for text without prefix', () => {
        expect(parser.parse('create myproject')).toBeNull();
        expect(parser.parse('hello world')).toBeNull();
      });

      it('should parse simple command with no args', () => {
        const result = parser.parse('/list');

        expect(result).toEqual({
          command: 'list',
          args: [],
          params: {}
        });
      });

      it('should parse command with arguments', () => {
        const result = parser.parse('/create myproject /home/user/projects');

        expect(result.command).toBe('create');
        expect(result.args).toEqual(['myproject', '/home/user/projects']);
        expect(result.params.name).toBe('myproject');
        expect(result.params.path).toBe('/home/user/projects');
      });

      it('should convert command to lowercase', () => {
        const result = parser.parse('/LIST');

        expect(result.command).toBe('list');
      });

      it('should handle custom prefix', () => {
        const result = parser.parse('!list', '!');

        expect(result.command).toBe('list');
      });
    });

    describe('unknown command handling', () => {
      it('should return error for unknown command', () => {
        const result = parser.parse('/unknowncommand');

        expect(result.error).toBe('unknown_command');
        expect(result.command).toBe('unknowncommand');
      });
    });

    describe('subcommand parsing', () => {
      it('should return error when subcommand is missing', () => {
        const result = parser.parse('/ralph');

        expect(result.error).toBe('missing_subcommand');
        expect(result.command).toBe('ralph');
        expect(result.availableSubcommands).toContain('start');
        expect(result.availableSubcommands).toContain('pause');
      });

      it('should return error for unknown subcommand', () => {
        const result = parser.parse('/ralph invalid');

        expect(result.error).toBe('unknown_subcommand');
        expect(result.command).toBe('ralph');
        expect(result.subcommand).toBe('invalid');
      });

      it('should parse valid subcommand', () => {
        const result = parser.parse('/ralph start mysession');

        expect(result.command).toBe('ralph');
        expect(result.subcommand).toBe('start');
        expect(result.args).toEqual(['mysession']);
        expect(result.params.session).toBe('mysession');
      });

      it('should convert subcommand to lowercase', () => {
        const result = parser.parse('/ralph START mysession');

        expect(result.subcommand).toBe('start');
      });
    });

    describe('parameter extraction', () => {
      it('should extract required parameters', () => {
        const result = parser.parse('/start mysession');

        expect(result.params.name).toBe('mysession');
      });

      it('should extract optional parameters when provided', () => {
        const result = parser.parse('/status mysession');

        expect(result.params.name).toBe('mysession');
      });

      it('should handle missing optional parameters', () => {
        const result = parser.parse('/status');

        expect(result.params.name).toBeUndefined();
      });

      it('should extract variadic parameters (description...)', () => {
        const result = parser.parse('/task mysession This is a long task description');

        expect(result.params.session).toBe('mysession');
        expect(result.params.description).toBe('This is a long task description');
      });

      it('should set undefined for missing required parameters', () => {
        const result = parser.parse('/start');

        expect(result.params.name).toBeUndefined();
      });
    });
  });

  describe('extractParams()', () => {
    it('should handle empty params definition', () => {
      const result = parser.extractParams({ params: [] }, ['arg1', 'arg2']);

      expect(result).toEqual({});
    });

    it('should extract parameters in order', () => {
      const commandDef = { params: ['first', 'second'] };
      const result = parser.extractParams(commandDef, ['value1', 'value2']);

      expect(result.first).toBe('value1');
      expect(result.second).toBe('value2');
    });

    it('should mark optional parameters correctly', () => {
      const commandDef = { params: ['required', 'optional?'] };
      const result = parser.extractParams(commandDef, ['value1']);

      expect(result.required).toBe('value1');
      expect(result.optional).toBeUndefined();
    });

    it('should collect variadic parameters', () => {
      const commandDef = { params: ['name', 'text...'] };
      const result = parser.extractParams(commandDef, ['test', 'hello', 'world', 'foo']);

      expect(result.name).toBe('test');
      expect(result.text).toBe('hello world foo');
    });
  });

  describe('validate()', () => {
    it('should return invalid for parsed errors', () => {
      const parsed = { error: 'unknown_command', command: 'bad' };

      const result = parser.validate(parsed);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('unknown_command');
    });

    it('should return invalid when required params are missing', () => {
      const parsed = parser.parse('/start');

      const result = parser.validate(parsed);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('name');
    });

    it('should return valid when all required params are present', () => {
      const parsed = parser.parse('/start mysession');

      const result = parser.validate(parsed);

      expect(result.valid).toBe(true);
    });

    it('should validate subcommands correctly', () => {
      const parsed = parser.parse('/ralph start');

      const result = parser.validate(parsed);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('session');
    });

    it('should pass validation for optional-only commands', () => {
      const parsed = parser.parse('/list');

      const result = parser.validate(parsed);

      expect(result.valid).toBe(true);
    });
  });

  describe('getHelp()', () => {
    it('should return general help when no command specified', () => {
      const help = parser.getHelp();

      expect(help).toContain('Available commands:');
      expect(help).toContain('/create');
      expect(help).toContain('/start');
      expect(help).toContain('/ralph');
    });

    it('should return specific help for known command', () => {
      const help = parser.getHelp('create');

      expect(help).toContain('Create new session');
      expect(help).toContain('name');
    });

    it('should return error for unknown command', () => {
      const help = parser.getHelp('unknowncommand');

      expect(help).toContain('Unknown command');
    });

    it('should show subcommands for ralph help', () => {
      const help = parser.getHelp('ralph');

      expect(help).toContain('/ralph start');
      expect(help).toContain('/ralph pause');
      expect(help).toContain('/ralph resume');
    });
  });

  describe('formatUsage()', () => {
    it('should return empty string for unknown command', () => {
      expect(parser.formatUsage('unknown')).toBe('');
    });

    it('should format command with required params', () => {
      const usage = parser.formatUsage('start');

      expect(usage).toContain('/start');
      expect(usage).toContain('<name>');
    });

    it('should format command with optional params', () => {
      const usage = parser.formatUsage('status');

      expect(usage).toContain('/status');
      expect(usage).toContain('[name]');
    });

    it('should format subcommand usage', () => {
      const usage = parser.formatUsage('ralph', 'start');

      expect(usage).toContain('/ralph start');
      expect(usage).toContain('<session>');
    });

    it('should handle variadic params', () => {
      const usage = parser.formatUsage('task');

      expect(usage).toContain('<description>');
    });
  });

  describe('all commands parsed correctly', () => {
    const testCases = [
      { input: '/create test', command: 'create' },
      { input: '/start test', command: 'start' },
      { input: '/stop test', command: 'stop' },
      { input: '/delete test', command: 'delete' },
      { input: '/list', command: 'list' },
      { input: '/status', command: 'status' },
      { input: '/attach test', command: 'attach' },
      { input: '/code test', command: 'code' },
      { input: '/task test description', command: 'task' },
      { input: '/tasks test', command: 'tasks' },
      { input: '/progress test', command: 'progress' },
      { input: '/prd test description', command: 'prd' },
      { input: '/logs test', command: 'logs' },
      { input: '/gpu', command: 'gpu' },
      { input: '/help', command: 'help' }
    ];

    testCases.forEach(({ input, command }) => {
      it(`should parse "${input}" as "${command}" command`, () => {
        const result = parser.parse(input);

        expect(result.command).toBe(command);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('ralph subcommands parsed correctly', () => {
    const subcommands = ['start', 'pause', 'resume', 'stop', 'verify'];

    subcommands.forEach(subcommand => {
      it(`should parse "/ralph ${subcommand} session" correctly`, () => {
        const result = parser.parse(`/ralph ${subcommand} mysession`);

        expect(result.command).toBe('ralph');
        expect(result.subcommand).toBe(subcommand);
        expect(result.params.session).toBe('mysession');
      });
    });
  });
});
