/**
 * Conversation Linker
 *
 * Links VibeManager sessions to Claude Code conversation logs.
 * Parses JSONL files from ~/.claude/projects/ to extract messages.
 */

const fs = require('fs');
const path = require('path');

class ConversationLinker {
  constructor() {
    this.claudeProjectsDir = path.join(process.env.HOME, '.claude/projects');
  }

  // Convert project path to Claude's hashed directory name
  pathToHash(projectPath) {
    // Claude uses: /home/clara/VibeManager -> -home-clara-VibeManager
    return projectPath.replace(/\//g, '-').replace(/^-/, '');
  }

  // Find Claude project directory for a given project path
  findClaudeProjectDir(projectPath) {
    const hashedPath = this.pathToHash(projectPath);
    const projectDir = path.join(this.claudeProjectsDir, hashedPath);

    if (fs.existsSync(projectDir)) {
      return projectDir;
    }

    // Try alternate variations
    const altHash = '-' + hashedPath;
    const altDir = path.join(this.claudeProjectsDir, altHash);
    if (fs.existsSync(altDir)) {
      return altDir;
    }

    return null;
  }

  // Load session index for a project
  loadSessionIndex(projectPath) {
    const projectDir = this.findClaudeProjectDir(projectPath);
    if (!projectDir) return null;

    const indexFile = path.join(projectDir, 'sessions-index.json');
    if (!fs.existsSync(indexFile)) return null;

    try {
      return JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Get all Claude sessions for a project
  getSessions(projectPath) {
    const index = this.loadSessionIndex(projectPath);
    if (!index || !index.entries) return [];

    return index.entries.map(e => ({
      id: e.sessionId,
      summary: e.summary,
      firstPrompt: e.firstPrompt?.substring(0, 300),
      messageCount: e.messageCount,
      created: e.created,
      modified: e.modified,
      gitBranch: e.gitBranch,
      isSidechain: e.isSidechain,
      logPath: e.fullPath
    })).sort((a, b) => new Date(b.modified) - new Date(a.modified));
  }

  // Get most recent Claude session for a project
  getMostRecentSession(projectPath) {
    const sessions = this.getSessions(projectPath);
    return sessions.length > 0 ? sessions[0] : null;
  }

  // Parse JSONL log file to extract messages
  parseConversation(logPath, options = {}) {
    if (!fs.existsSync(logPath)) return null;

    const limit = options.limit || 100; // Max messages to return
    const includeToolCalls = options.includeToolCalls !== false;

    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const messages = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // User messages
          if (entry.type === 'user' && entry.message?.content) {
            const content = typeof entry.message.content === 'string'
              ? entry.message.content
              : (entry.message.content[0]?.text || '');

            if (content) {
              messages.push({
                type: 'user',
                content: content.substring(0, 2000),
                timestamp: entry.timestamp,
                uuid: entry.uuid
              });
            }
          }

          // Assistant messages
          else if (entry.message?.role === 'assistant') {
            const contentBlocks = entry.message.content || [];
            const textContent = [];
            const toolCalls = [];

            for (const block of contentBlocks) {
              if (block.type === 'text' && block.text) {
                textContent.push(block.text);
              } else if (block.type === 'tool_use' && includeToolCalls) {
                toolCalls.push({
                  tool: block.name,
                  input: this.summarizeToolInput(block.name, block.input)
                });
              }
            }

            if (textContent.length > 0 || toolCalls.length > 0) {
              messages.push({
                type: 'assistant',
                content: textContent.join('\n').substring(0, 2000),
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                model: entry.message.model,
                timestamp: entry.timestamp,
                uuid: entry.uuid
              });
            }
          }

          // Tool results (optional)
          else if (entry.type === 'tool_result' && includeToolCalls) {
            // Tool results are typically not needed in the summary view
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      // Return most recent messages up to limit
      return messages.slice(-limit);
    } catch {
      return null;
    }
  }

  // Summarize tool input for display
  summarizeToolInput(toolName, input) {
    if (!input) return '';

    switch (toolName) {
      case 'Bash':
        return input.command?.substring(0, 100) || '';
      case 'Read':
        return input.file_path || '';
      case 'Write':
        return input.file_path || '';
      case 'Edit':
        return input.file_path || '';
      case 'Glob':
        return input.pattern || '';
      case 'Grep':
        return `"${input.pattern}" in ${input.path || '.'}`;
      default:
        return JSON.stringify(input).substring(0, 100);
    }
  }

  // Get conversation for a VibeManager session by linking via project path
  getConversationForSession(projectPath, options = {}) {
    const sessions = this.getSessions(projectPath);
    if (sessions.length === 0) {
      return { found: false, error: 'No Claude sessions found for this project' };
    }

    // Get the most recent session by default, or specified session
    let targetSession;
    if (options.sessionId) {
      targetSession = sessions.find(s => s.id === options.sessionId);
      if (!targetSession) {
        return { found: false, error: `Session ${options.sessionId} not found` };
      }
    } else {
      targetSession = sessions[0];
    }

    if (!targetSession.logPath || !fs.existsSync(targetSession.logPath)) {
      return { found: false, error: 'Session log file not found' };
    }

    const messages = this.parseConversation(targetSession.logPath, options);

    return {
      found: true,
      session: targetSession,
      messages,
      availableSessions: sessions.map(s => ({
        id: s.id,
        summary: s.summary,
        messageCount: s.messageCount,
        modified: s.modified
      }))
    };
  }

  // Get conversation summary (last few messages + stats)
  getConversationSummary(projectPath) {
    const result = this.getConversationForSession(projectPath, { limit: 5 });

    if (!result.found) {
      return null;
    }

    return {
      sessionId: result.session.id,
      summary: result.session.summary,
      messageCount: result.session.messageCount,
      lastModified: result.session.modified,
      recentMessages: result.messages,
      totalSessions: result.availableSessions.length
    };
  }
}

module.exports = ConversationLinker;
