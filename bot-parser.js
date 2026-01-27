// bot-parser.js - Command parser for bot messages
class BotParser {
  constructor() {
    this.commands = {
      // Session management
      create: { params: ['name', 'path?'], description: 'Create new session' },
      start: { params: ['name'], description: 'Start session' },
      stop: { params: ['name'], description: 'Stop session' },
      delete: { params: ['name'], description: 'Delete session' },
      list: { params: [], description: 'List all sessions' },
      status: { params: ['name?'], description: 'Show session status' },
      attach: { params: ['name'], description: 'Get terminal attachment link' },
      code: { params: ['name'], description: 'Get VS Code editor link' },

      // Task management
      task: { params: ['session', 'description...'], description: 'Add task to session' },
      tasks: { params: ['session'], description: 'List all tasks' },
      progress: { params: ['session'], description: 'Show task progress' },
      prd: { params: ['session', 'description...'], description: 'Create PRD for session' },

      // Ralph control
      ralph: {
        subcommands: {
          start: { params: ['session'], description: 'Start Ralph loop' },
          pause: { params: ['session'], description: 'Pause Ralph loop' },
          resume: { params: ['session'], description: 'Resume Ralph loop' },
          stop: { params: ['session'], description: 'Stop Ralph loop' },
          verify: { params: ['session'], description: 'Verify stuck task' }
        }
      },

      // Monitoring
      logs: { params: ['session', 'lines?'], description: 'Get recent logs' },
      gpu: { params: [], description: 'Show GPU stats' },

      // Help
      help: { params: ['command?'], description: 'Show help' }
    };
  }

  /**
   * Parse a command string
   * @param {string} text - The full message text
   * @param {string} prefix - Command prefix (default: '/')
   * @returns {Object|null} - Parsed command or null if invalid
   */
  parse(text, prefix = '/') {
    if (!text || !text.startsWith(prefix)) {
      return null;
    }

    // Remove prefix and split into parts
    const parts = text.slice(prefix.length).trim().split(/\s+/);
    if (parts.length === 0) return null;

    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Check if it's a valid command
    if (!this.commands[command]) {
      return { error: 'unknown_command', command };
    }

    // Handle subcommands (e.g., /ralph start)
    if (this.commands[command].subcommands) {
      if (args.length === 0) {
        return {
          error: 'missing_subcommand',
          command,
          availableSubcommands: Object.keys(this.commands[command].subcommands)
        };
      }

      const subcommand = args[0].toLowerCase();
      if (!this.commands[command].subcommands[subcommand]) {
        return {
          error: 'unknown_subcommand',
          command,
          subcommand,
          availableSubcommands: Object.keys(this.commands[command].subcommands)
        };
      }

      return {
        command,
        subcommand,
        args: args.slice(1),
        params: this.extractParams(this.commands[command].subcommands[subcommand], args.slice(1))
      };
    }

    // Regular command
    return {
      command,
      args,
      params: this.extractParams(this.commands[command], args)
    };
  }

  /**
   * Extract parameters from args based on command definition
   * @param {Object} commandDef - Command definition with params
   * @param {Array} args - Arguments provided
   * @returns {Object} - Extracted parameters
   */
  extractParams(commandDef, args) {
    const params = {};
    const paramDefs = commandDef.params || [];

    for (let i = 0; i < paramDefs.length; i++) {
      const paramDef = paramDefs[i];
      const isOptional = paramDef.endsWith('?');
      const isVariadic = paramDef.endsWith('...');
      // Remove all trailing ? or . characters
      const paramName = paramDef.replace(/[?.]+$/, '');

      if (isVariadic) {
        // Collect all remaining args
        params[paramName] = args.slice(i).join(' ');
      } else if (i < args.length) {
        params[paramName] = args[i];
      } else if (!isOptional) {
        params[paramName] = undefined;
      }
    }

    return params;
  }

  /**
   * Validate parsed command has all required params
   * @param {Object} parsed - Parsed command object
   * @returns {Object} - { valid: boolean, missing: string[] }
   */
  validate(parsed) {
    if (parsed.error) {
      return { valid: false, error: parsed.error };
    }

    const commandDef = parsed.subcommand
      ? this.commands[parsed.command].subcommands[parsed.subcommand]
      : this.commands[parsed.command];

    const requiredParams = (commandDef.params || [])
      .filter(p => !p.endsWith('?') && !p.endsWith('...'))
      .map(p => p.replace(/[?.]+$/, ''));

    const missing = requiredParams.filter(p => !parsed.params[p]);

    if (missing.length > 0) {
      return { valid: false, missing };
    }

    return { valid: true };
  }

  /**
   * Get help text for a command
   * @param {string} command - Command name
   * @returns {string} - Help text
   */
  getHelp(command) {
    if (!command) {
      // General help
      const lines = ['Available commands:'];
      for (const [cmd, def] of Object.entries(this.commands)) {
        if (def.subcommands) {
          lines.push(`/${cmd} - ${def.description || 'See subcommands'}`);
          for (const [sub, subDef] of Object.entries(def.subcommands)) {
            lines.push(`  /${cmd} ${sub} - ${subDef.description}`);
          }
        } else {
          const params = (def.params || []).join(' ');
          lines.push(`/${cmd} ${params} - ${def.description}`);
        }
      }
      return lines.join('\n');
    }

    // Specific command help
    const def = this.commands[command];
    if (!def) {
      return `Unknown command: ${command}`;
    }

    if (def.subcommands) {
      const lines = [`/${command} - ${def.description || ''}`, 'Subcommands:'];
      for (const [sub, subDef] of Object.entries(def.subcommands)) {
        const params = (subDef.params || []).join(' ');
        lines.push(`  /${command} ${sub} ${params} - ${subDef.description}`);
      }
      return lines.join('\n');
    }

    const params = (def.params || []).join(' ');
    return `/${command} ${params} - ${def.description}`;
  }

  /**
   * Format usage example for a command
   * @param {string} command - Command name
   * @param {string} subcommand - Subcommand name (optional)
   * @returns {string} - Usage example
   */
  formatUsage(command, subcommand) {
    const def = subcommand
      ? this.commands[command]?.subcommands[subcommand]
      : this.commands[command];

    if (!def) return '';

    const params = (def.params || []).map(p => {
      const isOptional = p.endsWith('?');
      const isVariadic = p.endsWith('...');
      const name = p.replace(/[?.]+$/, '');

      if (isOptional) return `[${name}]`;
      if (isVariadic) return `<${name}>`;
      return `<${name}>`;
    }).join(' ');

    const cmd = subcommand ? `${command} ${subcommand}` : command;
    return `/${cmd} ${params}`.trim();
  }
}

module.exports = BotParser;
