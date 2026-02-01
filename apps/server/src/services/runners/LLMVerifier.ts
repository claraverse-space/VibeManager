import type { Task, VerifierConfig, VerificationResult } from '@vibemanager/shared';
import { db, schema } from '../../db';
import { logService } from '../LogService';

const DEFAULT_CONFIG: VerifierConfig = {
  enabled: false,
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 1024,
};

const VERIFICATION_SYSTEM_PROMPT = `You are a task completion verifier. Analyze whether a coding task has been completed successfully based on terminal output.

Respond ONLY with valid JSON in this exact format:
{"passed": true/false, "feedback": "explanation", "confidence": 0.0-1.0}

- passed: true if the task appears complete, false otherwise
- feedback: If failed, explain what still needs to be done. If passed, briefly confirm.
- confidence: Your confidence level from 0.0 to 1.0`;

/**
 * LLM-based task verification service.
 * Uses OpenAI-compatible API to verify if a task has been completed.
 */
export class LLMVerifier {
  private configCache: VerifierConfig | null = null;
  private configCacheTime = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  /**
   * Get verifier config from database settings
   */
  async getConfig(): Promise<VerifierConfig> {
    const now = Date.now();
    if (this.configCache && now - this.configCacheTime < this.CACHE_TTL) {
      return this.configCache;
    }

    try {
      const settings = await db.query.settings.findMany({
        where: (s, { like }) => like(s.key, 'verifier.%'),
      });

      const config = { ...DEFAULT_CONFIG };
      for (const setting of settings) {
        const key = setting.key.replace('verifier.', '') as keyof VerifierConfig;
        if (key === 'enabled') {
          config.enabled = setting.value === 'true';
        } else if (key === 'maxTokens') {
          config.maxTokens = parseInt(setting.value) || DEFAULT_CONFIG.maxTokens;
        } else if (key in config) {
          (config as Record<string, string | number | boolean>)[key] = setting.value;
        }
      }

      this.configCache = config;
      this.configCacheTime = now;
      return config;
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Save verifier config to database settings
   */
  async saveConfig(config: Partial<VerifierConfig>): Promise<void> {
    const now = new Date();
    const entries = Object.entries(config);

    for (const [key, value] of entries) {
      const settingKey = `verifier.${key}`;
      const stringValue = String(value);

      await db
        .insert(schema.settings)
        .values({ key: settingKey, value: stringValue, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: stringValue, updatedAt: now },
        });
    }

    // Clear cache
    this.configCache = null;
  }

  /**
   * Verify task completion using LLM
   */
  async verify(task: Task, output: string): Promise<VerificationResult> {
    const config = await this.getConfig();

    if (!config.enabled || !config.apiKey) {
      logService.warn('llm', 'LLM not configured, using fallback verification', {
        enabled: config.enabled,
        hasApiKey: !!config.apiKey,
      });
      return this.fallbackVerify(output);
    }

    logService.info('llm', `Verifying task: ${task.name}`, { model: config.model });

    try {
      const response = await this.callOpenAI(config, task, output);
      const result = this.parseResponse(response);
      logService.info('llm', `Verification result: ${result.passed ? 'PASSED' : 'FAILED'}`, {
        confidence: result.confidence,
        feedback: result.feedback.slice(0, 100),
      });
      return result;
    } catch (error) {
      logService.error('llm', `LLM verification failed: ${error}`, { taskId: task.id });
      return this.fallbackVerify(output);
    }
  }

  /**
   * Call OpenAI-compatible API with timeout
   */
  private async callOpenAI(config: VerifierConfig, task: Task, output: string): Promise<string> {
    const userPrompt = this.buildUserPrompt(task, output);

    // Use AbortController for timeout (60 seconds max for verification)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${config.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          messages: [
            { role: 'system', content: VERIFICATION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build the user prompt for verification
   */
  private buildUserPrompt(task: Task, output: string): string {
    const trimmedOutput = output.slice(-8000); // Limit output size

    let prompt = `## Task
Name: ${task.name}
Prompt: ${task.prompt}
`;

    if (task.verificationPrompt) {
      prompt += `
## Custom Verification Criteria
${task.verificationPrompt}
`;
    }

    prompt += `
## Terminal Output (last 8000 chars)
${trimmedOutput}

Is this task complete?`;

    return prompt;
  }

  /**
   * Parse LLM response into VerificationResult
   */
  private parseResponse(response: string): VerificationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        passed: Boolean(parsed.passed),
        feedback: String(parsed.feedback || ''),
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      };
    } catch {
      const lowerResponse = response.toLowerCase();
      const passed = lowerResponse.includes('"passed": true') ||
                     lowerResponse.includes('"passed":true');
      return {
        passed,
        feedback: passed ? 'Task appears complete.' : 'Unable to verify completion.',
        confidence: 0.5,
      };
    }
  }

  /**
   * Fallback verification using pattern matching
   */
  private fallbackVerify(output: string): VerificationResult {
    const lastLines = output.trim().split('\n').slice(-20).join('\n');
    const lastLinesLower = lastLines.toLowerCase();

    logService.debug('llm', 'Using fallback verification (pattern matching)', {
      outputLines: lastLines.split('\n').length,
      lastChars: lastLines.slice(-200),
    });

    const successPatterns = [
      /success/i,
      /completed?/i,
      /done/i,
      /finished/i,
      /passed/i,
      /\bOK\b/,
      /✓/,
    ];

    const failurePatterns = [
      /error:/i,
      /failed/i,
      /exception/i,
      /fatal/i,
      /panic/i,
    ];

    const waitingPatterns = [
      /\?\s*$/,
      /\(y\/n\)/i,
      /continue\?/i,
      /press any key/i,
    ];

    const hasSuccess = successPatterns.some(p => p.test(lastLinesLower));
    const hasFailure = failurePatterns.some(p => p.test(lastLinesLower));
    const isWaiting = waitingPatterns.some(p => p.test(lastLinesLower));

    logService.debug('llm', 'Pattern matching results', {
      hasSuccess,
      hasFailure,
      isWaiting,
    });

    if (isWaiting) {
      logService.info('llm', 'Fallback: detected waiting for input');
      return {
        passed: false,
        feedback: 'Session appears to be waiting for user input.',
        confidence: 0.7,
      };
    }

    if (hasFailure && !hasSuccess) {
      logService.info('llm', 'Fallback: detected failure patterns');
      return {
        passed: false,
        feedback: 'Output contains error indicators.',
        confidence: 0.6,
      };
    }

    if (hasSuccess && !hasFailure) {
      logService.info('llm', 'Fallback: detected success patterns');
      return {
        passed: true,
        feedback: 'Output contains success indicators.',
        confidence: 0.6,
      };
    }

    logService.warn('llm', 'Fallback: no patterns matched - marking as incomplete');
    return {
      passed: false,
      feedback: 'Unable to determine task completion status (no LLM configured).',
      confidence: 0.3,
    };
  }

  /**
   * Check if LLM verification is available
   */
  async isAvailable(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled && !!config.apiKey;
  }

  /**
   * Get a brief status summary of what's happening
   */
  async getStatusSummary(taskName: string, output: string): Promise<string> {
    const config = await this.getConfig();

    if (!config.enabled || !config.apiKey) {
      return this.fallbackStatusSummary(output);
    }

    // Use AbortController for timeout (15 seconds for status summary)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${config.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 100,
          messages: [
            {
              role: 'system',
              content: 'You summarize terminal output in 10 words or less. Be concise. No punctuation at end.',
            },
            {
              role: 'user',
              content: `Task: ${taskName}\n\nRecent output:\n${output.slice(-2000)}\n\nWhat is happening now?`,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return this.fallbackStatusSummary(output);
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content || '';
      return summary.trim().slice(0, 100);
    } catch {
      return this.fallbackStatusSummary(output);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fallback status summary from output patterns
   */
  private fallbackStatusSummary(output: string): string {
    const lastLines = output.trim().split('\n').slice(-5).join(' ').toLowerCase();

    if (/compiling|building|bundling/i.test(lastLines)) return 'Compiling...';
    if (/installing|npm|yarn|bun/i.test(lastLines)) return 'Installing dependencies...';
    if (/testing|test|spec/i.test(lastLines)) return 'Running tests...';
    if (/error|failed|exception/i.test(lastLines)) return 'Error encountered';
    if (/success|passed|done|complete/i.test(lastLines)) return 'Task completed';
    if (/writing|creating|generating/i.test(lastLines)) return 'Generating files...';
    if (/reading|loading|fetching/i.test(lastLines)) return 'Loading...';
    if (/\?|y\/n|continue/i.test(lastLines)) return 'Waiting for input...';

    return 'Working...';
  }
}

// Export singleton instance
export const llmVerifier = new LLMVerifier();
