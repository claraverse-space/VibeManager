// bot-formatter.js - Format responses for different platforms
class BotFormatter {
  /**
   * Format error message
   * @param {string} error - Error message
   * @param {Object} context - Additional context
   * @returns {string} - Formatted message
   */
  formatError(error, context = {}) {
    const lines = ['🚫 Error'];
    lines.push('');
    lines.push(error);

    if (context.suggestion) {
      lines.push('');
      lines.push(`💡 ${context.suggestion}`);
    }

    return lines.join('\n');
  }

  /**
   * Format session status
   * @param {Object} session - Session object
   * @param {Object} ralphStatus - Ralph loop status (optional)
   * @returns {string} - Formatted message
   */
  formatSessionStatus(session, ralphStatus = null) {
    const lines = [`📊 ${session.name}`];
    lines.push('');
    lines.push(`⚡ Status: ${session.alive ? 'Running ✅' : 'Stopped ⏸️'}`);
    lines.push(`📂 Path: ${session.projectPath}`);
    lines.push(`🤖 Agent: ${session.shellType}`);

    if (session.alive) {
      lines.push(`🔌 Port: ${session.codePort || 'N/A'}`);
    }

    // Add Ralph status if available
    if (ralphStatus && ralphStatus.status !== 'idle') {
      lines.push('');
      lines.push('🔄 Ralph Loop');
      lines.push(`   Status: ${this.formatRalphStatus(ralphStatus.status)}`);

      if (ralphStatus.currentTaskId) {
        lines.push(`   Task: ${ralphStatus.currentTaskId}`);
      }

      if (ralphStatus.iterationCount !== undefined) {
        const max = ralphStatus.config?.maxIterations || 50;
        lines.push(`   Iteration: ${ralphStatus.iterationCount}/${max}`);
      }

      if (ralphStatus.status === 'stuck') {
        lines.push(`   ⚠️ Task stuck - no progress`);
      }
    }

    const updatedAgo = this.formatTimeAgo(new Date(session.lastAccessedAt));
    lines.push('');
    lines.push(`⏱️ Updated: ${updatedAgo}`);

    return lines.join('\n');
  }

  /**
   * Format multiple sessions
   * @param {Array} sessions - Array of session objects
   * @returns {string} - Formatted message
   */
  formatSessionList(sessions) {
    if (sessions.length === 0) {
      return '📋 No sessions found\n\nUse /create to create your first session';
    }

    const running = sessions.filter(s => s.alive).length;
    const stopped = sessions.length - running;

    const lines = [`📊 Sessions (${sessions.length} total)`];
    lines.push(`   🟢 ${running} Running | ⚪ ${stopped} Stopped`);
    lines.push('');

    for (const session of sessions) {
      const status = session.alive ? '✅' : '⏸️';
      const name = session.name.padEnd(20);
      lines.push(`${status} ${name}`);

      if (session.alive && session.codePort) {
        lines.push(`   Port: ${session.codePort}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format task list
   * @param {Array} tasks - Array of task objects
   * @param {string} sessionName - Session name
   * @returns {string} - Formatted message
   */
  formatTaskList(tasks, sessionName) {
    if (tasks.length === 0) {
      return `📋 No tasks for ${sessionName}\n\nUse /task ${sessionName} <description> to add a task`;
    }

    const lines = [`📋 Tasks for ${sessionName}`];
    lines.push('');

    for (const task of tasks) {
      const icon = this.getTaskIcon(task.status);
      const progress = task.progress !== undefined ? ` (${task.progress}%)` : '';
      lines.push(`${icon} ${task.title}${progress}`);

      if (task.status === 'in_progress' && task.currentStep) {
        lines.push(`   Current: ${task.currentStep}`);
      }

      if (task.completedAt) {
        const ago = this.formatTimeAgo(new Date(task.completedAt));
        lines.push(`   Completed ${ago}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format task progress
   * @param {Object} task - Task object
   * @param {string} sessionName - Session name
   * @returns {string} - Formatted message
   */
  formatTaskProgress(task, sessionName) {
    const lines = [`📊 ${sessionName} Progress`];
    lines.push('');
    lines.push(`📋 Task: ${task.title}`);
    lines.push(`   Status: ${this.formatStatus(task.status)}`);

    if (task.progress !== undefined) {
      const bar = this.createProgressBar(task.progress);
      lines.push(`   Progress: ${bar} ${task.progress}%`);
    }

    if (task.currentStep) {
      lines.push(`   Current: ${task.currentStep}`);
    }

    if (task.steps && task.steps.length > 0) {
      lines.push('');
      lines.push('Steps:');
      for (const step of task.steps) {
        const icon = this.getStepIcon(step.status);
        lines.push(`${icon} ${step.name}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format task completion notification
   * @param {string} sessionName - Session name
   * @param {Object} task - Completed task
   * @returns {string} - Formatted message
   */
  formatTaskComplete(sessionName, task) {
    const lines = ['🎉 Task Completed!'];
    lines.push('');
    lines.push(`Session: ${sessionName}`);
    lines.push(`Task: ${task.title}`);

    if (task.duration) {
      lines.push(`Duration: ${this.formatDuration(task.duration)}`);
    }

    return lines.join('\n');
  }

  /**
   * Format task stuck notification
   * @param {string} sessionName - Session name
   * @param {Object} task - Stuck task
   * @param {number} attempts - Number of attempts
   * @returns {string} - Formatted message
   */
  formatTaskStuck(sessionName, task, attempts) {
    const lines = ['⚠️ Task Stuck'];
    lines.push('');
    lines.push(`Session: ${sessionName}`);
    lines.push(`Task: ${task.title}`);
    lines.push(`Progress: ${task.progress || 0}% (no change)`);
    lines.push(`Attempts: ${attempts} iterations`);
    lines.push('');
    lines.push('This task may need attention.');

    return lines.join('\n');
  }

  /**
   * Format Ralph complete notification
   * @param {string} sessionName - Session name
   * @param {number} totalTasks - Total tasks completed
   * @param {number} duration - Total duration in ms
   * @returns {string} - Formatted message
   */
  formatRalphComplete(sessionName, totalTasks, duration) {
    const lines = ['🎊 All Tasks Complete!'];
    lines.push('');
    lines.push(`Session: ${sessionName}`);
    lines.push(`Tasks: ${totalTasks}/${totalTasks} completed`);
    lines.push(`Duration: ${this.formatDuration(duration)}`);
    lines.push('');
    lines.push('Your project is ready! 🚀');

    return lines.join('\n');
  }

  /**
   * Format session created response
   * @param {Object} session - Created session
   * @returns {string} - Formatted message
   */
  formatSessionCreated(session) {
    const lines = ['✅ Session Created'];
    lines.push('');
    lines.push(`📁 Name: ${session.name}`);
    lines.push(`📂 Path: ${session.projectPath}`);
    lines.push(`🤖 Agent: ${session.shellType}`);
    lines.push(`⚡ Status: ${session.alive ? 'Running' : 'Stopped'}`);
    lines.push('');
    lines.push('What\'s next?');
    lines.push(`• /start ${session.name} - Start the session`);
    lines.push(`• /task ${session.name} - Add tasks`);

    return lines.join('\n');
  }

  /**
   * Format help message
   * @param {string} helpText - Help text from parser
   * @returns {string} - Formatted message
   */
  formatHelp(helpText) {
    const lines = ['📚 VibeManager Bot Commands'];
    lines.push('');
    lines.push(helpText);
    lines.push('');
    lines.push('💡 Tip: Use buttons for quick actions');

    return lines.join('\n');
  }

  /**
   * Format unauthorized message
   * @param {string} userId - User ID
   * @param {string} platform - Platform name (discord/telegram)
   * @returns {string} - Formatted message
   */
  formatUnauthorized(userId, platform) {
    const lines = ['🚫 Access Denied'];
    lines.push('');
    lines.push('You\'re not authorized to use this bot.');
    lines.push(`Your ${platform} ID: ${userId}`);
    lines.push('');
    lines.push('Contact your VibeManager administrator to get access.');
    lines.push(`They need to add your ID to ${platform.toUpperCase()}_ALLOWED_USERS.`);

    return lines.join('\n');
  }

  // Utility methods

  getTaskIcon(status) {
    const icons = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      blocked: '🔴',
      error: '❌'
    };
    return icons[status] || '❓';
  }

  getStepIcon(status) {
    const icons = {
      pending: '⚪',
      in_progress: '🔵',
      completed: '✅',
      error: '❌'
    };
    return icons[status] || '⚪';
  }

  formatStatus(status) {
    const formatted = {
      pending: 'Pending ⏳',
      in_progress: 'In Progress 🔄',
      completed: 'Completed ✅',
      blocked: 'Blocked 🔴',
      error: 'Error ❌'
    };
    return formatted[status] || status;
  }

  formatRalphStatus(status) {
    const formatted = {
      idle: 'Idle',
      running: 'Running 🔄',
      paused: 'Paused ⏸️',
      stuck: 'Stuck ⚠️',
      complete: 'Complete ✅'
    };
    return formatted[status] || status;
  }

  createProgressBar(percent, length = 10) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Truncate text to max length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} - Truncated text
   */
  truncate(text, maxLength = 2000) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

module.exports = BotFormatter;
