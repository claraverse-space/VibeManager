/**
 * Tests for ConversationLinker module
 */

const fs = require('fs');
const path = require('path');

// Mock fs
jest.mock('fs');

const ConversationLinker = require('../conversation-linker');

describe('ConversationLinker', () => {
  let linker;
  const mockClaudeProjectsDir = path.join(process.env.HOME, '.claude/projects');

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('');

    linker = new ConversationLinker();
  });

  describe('constructor', () => {
    it('should set claudeProjectsDir correctly', () => {
      expect(linker.claudeProjectsDir).toBe(mockClaudeProjectsDir);
    });
  });

  describe('pathToHash()', () => {
    it('should convert path to hash format', () => {
      expect(linker.pathToHash('/home/user/project')).toBe('home-user-project');
    });

    it('should remove leading dash', () => {
      expect(linker.pathToHash('/home/user')).toBe('home-user');
    });

    it('should handle paths without leading slash', () => {
      expect(linker.pathToHash('relative/path')).toBe('relative-path');
    });

    it('should handle single directory', () => {
      expect(linker.pathToHash('/root')).toBe('root');
    });

    it('should handle deep paths', () => {
      expect(linker.pathToHash('/a/b/c/d/e')).toBe('a-b-c-d-e');
    });
  });

  describe('findClaudeProjectDir()', () => {
    it('should return project dir when it exists', () => {
      fs.existsSync.mockImplementation((p) => {
        return p === path.join(mockClaudeProjectsDir, 'home-user-project');
      });

      const result = linker.findClaudeProjectDir('/home/user/project');

      expect(result).toBe(path.join(mockClaudeProjectsDir, 'home-user-project'));
    });

    it('should try alternate hash with leading dash', () => {
      fs.existsSync.mockImplementation((p) => {
        return p === path.join(mockClaudeProjectsDir, '-home-user-project');
      });

      const result = linker.findClaudeProjectDir('/home/user/project');

      expect(result).toBe(path.join(mockClaudeProjectsDir, '-home-user-project'));
    });

    it('should return null when no matching dir found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = linker.findClaudeProjectDir('/nonexistent/path');

      expect(result).toBeNull();
    });
  });

  describe('loadSessionIndex()', () => {
    it('should return null when project dir not found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = linker.loadSessionIndex('/some/path');

      expect(result).toBeNull();
    });

    it('should return null when index file not found', () => {
      fs.existsSync.mockImplementation((p) => {
        return !p.endsWith('sessions-index.json');
      });

      const result = linker.loadSessionIndex('/home/user/project');

      expect(result).toBeNull();
    });

    it('should return parsed index when file exists', () => {
      const mockIndex = {
        entries: [
          { sessionId: 'session-1', summary: 'First session' }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockIndex));

      const result = linker.loadSessionIndex('/home/user/project');

      expect(result).toEqual(mockIndex);
    });

    it('should return null on JSON parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      const result = linker.loadSessionIndex('/home/user/project');

      expect(result).toBeNull();
    });
  });

  describe('getSessions()', () => {
    it('should return empty array when no index', () => {
      fs.existsSync.mockReturnValue(false);

      const result = linker.getSessions('/some/path');

      expect(result).toEqual([]);
    });

    it('should return empty array when index has no entries', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({}));

      const result = linker.getSessions('/some/path');

      expect(result).toEqual([]);
    });

    it('should return formatted sessions sorted by modified date', () => {
      const mockIndex = {
        entries: [
          {
            sessionId: 'session-1',
            summary: 'Old session',
            firstPrompt: 'Hello world this is a long prompt',
            messageCount: 10,
            created: '2024-01-01T00:00:00Z',
            modified: '2024-01-01T00:00:00Z',
            gitBranch: 'main',
            isSidechain: false,
            fullPath: '/path/to/log1.jsonl'
          },
          {
            sessionId: 'session-2',
            summary: 'New session',
            firstPrompt: 'Another prompt',
            messageCount: 5,
            created: '2024-01-02T00:00:00Z',
            modified: '2024-01-02T00:00:00Z',
            gitBranch: 'feature',
            isSidechain: true,
            fullPath: '/path/to/log2.jsonl'
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockIndex));

      const result = linker.getSessions('/home/user/project');

      expect(result).toHaveLength(2);
      // Should be sorted by modified date (newest first)
      expect(result[0].id).toBe('session-2');
      expect(result[1].id).toBe('session-1');
      // Should truncate firstPrompt
      expect(result[1].firstPrompt.length).toBeLessThanOrEqual(300);
    });
  });

  describe('getMostRecentSession()', () => {
    it('should return null when no sessions', () => {
      fs.existsSync.mockReturnValue(false);

      const result = linker.getMostRecentSession('/some/path');

      expect(result).toBeNull();
    });

    it('should return most recent session', () => {
      const mockIndex = {
        entries: [
          { sessionId: 'old', modified: '2024-01-01T00:00:00Z' },
          { sessionId: 'new', modified: '2024-01-02T00:00:00Z' }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockIndex));

      const result = linker.getMostRecentSession('/home/user/project');

      expect(result.id).toBe('new');
    });
  });

  describe('parseConversation()', () => {
    it('should return null when file not found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = linker.parseConversation('/nonexistent.jsonl');

      expect(result).toBeNull();
    });

    it('should parse user messages', () => {
      const mockContent = [
        JSON.stringify({
          type: 'user',
          message: { content: 'Hello, Claude' },
          timestamp: '2024-01-01T00:00:00Z',
          uuid: 'msg-1'
        })
      ].join('\n');

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = linker.parseConversation('/path/to/log.jsonl');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('user');
      expect(result[0].content).toBe('Hello, Claude');
    });

    it('should parse assistant messages with text content', () => {
      const mockContent = [
        JSON.stringify({
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello! How can I help?' }]
          },
          timestamp: '2024-01-01T00:00:00Z',
          uuid: 'msg-2'
        })
      ].join('\n');

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = linker.parseConversation('/path/to/log.jsonl');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('assistant');
      expect(result[0].content).toContain('Hello!');
    });

    it('should include tool calls when enabled', () => {
      const mockContent = [
        JSON.stringify({
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me read that file' },
              { type: 'tool_use', name: 'Read', input: { file_path: '/test.js' } }
            ]
          },
          timestamp: '2024-01-01T00:00:00Z'
        })
      ].join('\n');

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = linker.parseConversation('/path/to/log.jsonl', { includeToolCalls: true });

      expect(result[0].toolCalls).toHaveLength(1);
      expect(result[0].toolCalls[0].tool).toBe('Read');
    });

    it('should exclude tool calls when disabled', () => {
      const mockContent = [
        JSON.stringify({
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: '/test.js' } }
            ]
          },
          timestamp: '2024-01-01T00:00:00Z'
        })
      ].join('\n');

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = linker.parseConversation('/path/to/log.jsonl', { includeToolCalls: false });

      expect(result).toHaveLength(0); // No text content, no message
    });

    it('should respect message limit', () => {
      const messages = Array(200).fill(null).map((_, i) =>
        JSON.stringify({
          type: 'user',
          message: { content: `Message ${i}` },
          timestamp: `2024-01-01T00:${String(i).padStart(2, '0')}:00Z`
        })
      );

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(messages.join('\n'));

      const result = linker.parseConversation('/path/to/log.jsonl', { limit: 50 });

      expect(result).toHaveLength(50);
      // Should be the most recent 50
      expect(result[0].content).toBe('Message 150');
    });

    it('should skip invalid JSON lines', () => {
      const mockContent = [
        'invalid json',
        JSON.stringify({
          type: 'user',
          message: { content: 'Valid message' },
          timestamp: '2024-01-01T00:00:00Z'
        }),
        '{ incomplete'
      ].join('\n');

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = linker.parseConversation('/path/to/log.jsonl');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Valid message');
    });

    it('should truncate long content', () => {
      const longContent = 'x'.repeat(5000);
      const mockContent = JSON.stringify({
        type: 'user',
        message: { content: longContent },
        timestamp: '2024-01-01T00:00:00Z'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = linker.parseConversation('/path/to/log.jsonl');

      expect(result[0].content.length).toBeLessThanOrEqual(2000);
    });

    it('should handle array content in user messages', () => {
      const mockContent = JSON.stringify({
        type: 'user',
        message: { content: [{ text: 'Array content' }] },
        timestamp: '2024-01-01T00:00:00Z'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = linker.parseConversation('/path/to/log.jsonl');

      expect(result[0].content).toBe('Array content');
    });
  });

  describe('summarizeToolInput()', () => {
    it('should summarize Bash command', () => {
      const result = linker.summarizeToolInput('Bash', { command: 'npm install' });
      expect(result).toBe('npm install');
    });

    it('should summarize Read file path', () => {
      const result = linker.summarizeToolInput('Read', { file_path: '/path/to/file.js' });
      expect(result).toBe('/path/to/file.js');
    });

    it('should summarize Write file path', () => {
      const result = linker.summarizeToolInput('Write', { file_path: '/path/to/file.js' });
      expect(result).toBe('/path/to/file.js');
    });

    it('should summarize Edit file path', () => {
      const result = linker.summarizeToolInput('Edit', { file_path: '/path/to/file.js' });
      expect(result).toBe('/path/to/file.js');
    });

    it('should summarize Glob pattern', () => {
      const result = linker.summarizeToolInput('Glob', { pattern: '**/*.js' });
      expect(result).toBe('**/*.js');
    });

    it('should summarize Grep pattern and path', () => {
      const result = linker.summarizeToolInput('Grep', { pattern: 'TODO', path: 'src' });
      expect(result).toBe('"TODO" in src');
    });

    it('should handle unknown tools', () => {
      const result = linker.summarizeToolInput('Unknown', { foo: 'bar' });
      expect(result).toContain('foo');
    });

    it('should handle null input', () => {
      const result = linker.summarizeToolInput('Bash', null);
      expect(result).toBe('');
    });
  });

  describe('getConversationForSession()', () => {
    it('should return error when no sessions found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = linker.getConversationForSession('/some/path');

      expect(result.found).toBe(false);
      expect(result.error).toContain('No Claude sessions');
    });

    it('should return error when specified session not found', () => {
      const mockIndex = {
        entries: [{ sessionId: 'session-1', modified: '2024-01-01T00:00:00Z', fullPath: '/path/log.jsonl' }]
      };

      fs.existsSync.mockImplementation((p) => !p.endsWith('.jsonl'));
      fs.readFileSync.mockReturnValue(JSON.stringify(mockIndex));

      const result = linker.getConversationForSession('/home/user/project', { sessionId: 'nonexistent' });

      expect(result.found).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when log file not found', () => {
      const mockIndex = {
        entries: [{ sessionId: 'session-1', modified: '2024-01-01T00:00:00Z', fullPath: '/path/log.jsonl' }]
      };

      fs.existsSync.mockImplementation((p) => {
        if (p.endsWith('sessions-index.json')) return true;
        if (p.includes('-home-user-project')) return true;
        return false;
      });
      fs.readFileSync.mockReturnValue(JSON.stringify(mockIndex));

      const result = linker.getConversationForSession('/home/user/project');

      expect(result.found).toBe(false);
      expect(result.error).toContain('log file not found');
    });

    it('should return conversation with messages', () => {
      const mockIndex = {
        entries: [{
          sessionId: 'session-1',
          summary: 'Test session',
          messageCount: 5,
          modified: '2024-01-01T00:00:00Z',
          fullPath: '/path/log.jsonl'
        }]
      };

      const mockLog = JSON.stringify({
        type: 'user',
        message: { content: 'Hello' },
        timestamp: '2024-01-01T00:00:00Z'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('.jsonl')) return mockLog;
        return JSON.stringify(mockIndex);
      });

      const result = linker.getConversationForSession('/home/user/project');

      expect(result.found).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.availableSessions).toHaveLength(1);
    });
  });

  describe('getConversationSummary()', () => {
    it('should return null when no conversation found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = linker.getConversationSummary('/some/path');

      expect(result).toBeNull();
    });

    it('should return summary with recent messages', () => {
      const mockIndex = {
        entries: [{
          sessionId: 'session-1',
          summary: 'Test session',
          messageCount: 100,
          modified: '2024-01-01T00:00:00Z',
          fullPath: '/path/log.jsonl'
        }]
      };

      const mockLog = JSON.stringify({
        type: 'user',
        message: { content: 'Last message' },
        timestamp: '2024-01-01T00:00:00Z'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('.jsonl')) return mockLog;
        return JSON.stringify(mockIndex);
      });

      const result = linker.getConversationSummary('/home/user/project');

      expect(result.sessionId).toBe('session-1');
      expect(result.summary).toBe('Test session');
      expect(result.messageCount).toBe(100);
      expect(result.recentMessages).toBeDefined();
      expect(result.totalSessions).toBe(1);
    });
  });
});
