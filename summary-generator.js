/**
 * Summary Generator
 *
 * Generates AI-powered summaries of coding sessions using OpenAI-compatible APIs.
 * Can use any API endpoint that supports the OpenAI chat completions format.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const SETTINGS_DIR = path.join(process.env.HOME, '.local/share/projectgenerator');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

class SummaryGenerator {
  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {
        ai: {
          baseUrl: '',
          apiKey: '',
          model: 'gpt-4o-mini'
        },
        ralph: {
          maxIterations: 50,
          circuitBreakerThreshold: 3,
          autoCheckpoint: true,
          scrollbackInterval: 5
        },
        notifications: {
          soundOnTaskComplete: true,
          soundOnCircuitBreaker: true,
          soundOnAllComplete: true
        }
      };
    }

    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch {
      return this.loadSettings(); // Return defaults
    }
  }

  saveSettings(settings) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    this.settings = { ...this.settings, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
  }

  getSettings() {
    return this.settings;
  }

  updateSettings(updates) {
    // Deep merge
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.settings[key] = { ...this.settings[key], ...value };
      } else {
        this.settings[key] = value;
      }
    }
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
    return this.settings;
  }

  isConfigured() {
    return !!(this.settings.ai?.baseUrl && this.settings.ai?.apiKey);
  }

  // Make API request to OpenAI-compatible endpoint
  async callApi(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('AI API not configured. Set baseUrl and apiKey in settings.');
    }

    const { baseUrl, apiKey, model } = this.settings.ai;
    const url = new URL('/chat/completions', baseUrl);

    const body = JSON.stringify({
      model: options.model || model || 'gpt-4o-mini',
      messages,
      max_tokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7
    });

    return new Promise((resolve, reject) => {
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`API error ${res.statusCode}: ${data}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.message?.content;
            if (content) {
              resolve(content);
            } else {
              reject(new Error('No content in API response'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse API response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('API request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  // Test API connection
  async testConnection() {
    try {
      const response = await this.callApi([
        { role: 'user', content: 'Say "connected" in one word.' }
      ], { maxTokens: 10 });

      return {
        success: true,
        response: response.trim()
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Generate session summary
  async generateSessionSummary(sessionData) {
    const { scrollback, conversation, tasks, projectName, sessionName } = sessionData;

    let prompt = `You are summarizing an AI coding session. Be concise and focus on what was accomplished.

## Project: ${projectName || sessionName}

`;

    // Add task context if available
    if (tasks && tasks.total > 0) {
      prompt += `## Tasks: ${tasks.completed}/${tasks.total} complete\n`;
      if (tasks.current) {
        prompt += `Current task: ${tasks.current}\n`;
      }
      prompt += '\n';
    }

    // Add recent terminal output (last 500 lines max)
    if (scrollback) {
      const scrollbackLines = scrollback.split('\n');
      const recentScrollback = scrollbackLines.slice(-200).join('\n');
      if (recentScrollback.trim()) {
        prompt += `## Terminal Output (recent):\n\`\`\`\n${recentScrollback.substring(0, 3000)}\n\`\`\`\n\n`;
      }
    }

    // Add conversation excerpt if available
    if (conversation && conversation.length > 0) {
      prompt += `## Recent Conversation:\n`;
      const recentConvo = conversation.slice(-5);
      for (const msg of recentConvo) {
        const role = msg.type === 'user' ? 'User' : 'Assistant';
        const content = msg.content.substring(0, 300);
        prompt += `**${role}:** ${content}${msg.content.length > 300 ? '...' : ''}\n\n`;
      }
    }

    prompt += `## Instructions:
Provide a brief summary (2-4 sentences) covering:
1. What was accomplished in this session
2. Current state (what's working, what's pending)
3. Any notable decisions or issues

Keep it concise and actionable.`;

    try {
      const summary = await this.callApi([
        { role: 'user', content: prompt }
      ], { maxTokens: 300 });

      return {
        success: true,
        summary: summary.trim(),
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Generate checkpoint summary
  async generateCheckpointSummary(checkpointData) {
    const { name, tasks, git, scrollback } = checkpointData;

    let prompt = `Summarize this checkpoint in 1-2 sentences:

Checkpoint: ${name}
Tasks: ${tasks?.completed || 0}/${tasks?.total || 0} complete
`;

    if (git) {
      prompt += `Git: ${git.commit} on ${git.branch}${git.isDirty ? ' (uncommitted changes)' : ''}\n`;
    }

    if (scrollback) {
      const recentOutput = scrollback.split('\n').slice(-50).join('\n');
      prompt += `\nRecent output:\n${recentOutput.substring(0, 1000)}\n`;
    }

    prompt += '\nProvide a brief summary of the state at this checkpoint.';

    try {
      const summary = await this.callApi([
        { role: 'user', content: prompt }
      ], { maxTokens: 150 });

      return {
        success: true,
        summary: summary.trim()
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Generate task completion summary
  async generateTaskSummary(taskData) {
    const { title, description, scrollback } = taskData;

    const prompt = `Summarize what was done to complete this task in 1-2 sentences:

Task: ${title}
${description ? `Description: ${description}\n` : ''}
Terminal output (last part):
${scrollback ? scrollback.split('\n').slice(-100).join('\n').substring(0, 2000) : 'Not available'}

Focus on what was implemented and any key decisions made.`;

    try {
      const summary = await this.callApi([
        { role: 'user', content: prompt }
      ], { maxTokens: 150 });

      return {
        success: true,
        summary: summary.trim()
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = SummaryGenerator;
