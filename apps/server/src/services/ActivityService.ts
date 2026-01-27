import { captureRecentOutput } from '../lib/tmux';
import { ACTIVITY_IDLE_THRESHOLD, ACTIVITY_WAITING_THRESHOLD } from '@vibemanager/shared';
import type { ActivityState, SessionActivity } from '@vibemanager/shared';

interface ActivityData {
  lastOutputAt: number;
  lastOutputHash: string;
}

// Patterns that indicate waiting for user input
const WAITING_PATTERNS = [
  /\?\s*$/,                           // Ends with ?
  /\(y\/n\)/i,                         // Yes/no prompt
  /\[Y\/n\]/i,                         // Default yes prompt
  /\[y\/N\]/i,                         // Default no prompt
  /\(yes\/no\)/i,                      // yes/no prompt
  /Press any key/i,                    // Press any key
  /Continue\?/i,                       // Continue prompt
  /Enter.*:/i,                         // Enter something:
  /Password:/i,                        // Password prompt
  // Claude Code specific patterns
  /Do you want to proceed/i,
  /Would you like me to/i,
  /Should I continue/i,
  /May I make this change/i,
  /Shall I proceed/i,
  /Allow this action/i,
  /Approve the following/i,
  /Do you want to/i,
  // OpenCode specific patterns
  /\[allow\]/i,
  /\[deny\]/i,
];

class ActivityService {
  private activities = new Map<string, ActivityData>();

  /**
   * Simple hash of string for comparison
   */
  private hashOutput(output: string): string {
    let hash = 0;
    for (let i = 0; i < output.length; i++) {
      const char = output.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Poll a session for activity by capturing recent output
   */
  pollSession(sessionName: string): void {
    const output = captureRecentOutput(sessionName, 15);
    if (output === null) return;

    const now = Date.now();
    const outputHash = this.hashOutput(output);
    const existing = this.activities.get(sessionName);

    if (existing) {
      // Only update timestamp if output has changed
      if (existing.lastOutputHash !== outputHash) {
        existing.lastOutputAt = now;
        existing.lastOutputHash = outputHash;
      }
    } else {
      this.activities.set(sessionName, {
        lastOutputAt: now,
        lastOutputHash: outputHash,
      });
    }
  }

  /**
   * Check if recent output indicates waiting for input
   */
  private checkWaitingForInput(sessionName: string): boolean {
    const output = captureRecentOutput(sessionName, 5);
    if (!output) return false;

    // Check last few lines for waiting patterns
    const lastLines = output.trim().split('\n').slice(-3).join('\n');
    return WAITING_PATTERNS.some(p => p.test(lastLines));
  }

  /**
   * Get activity state for a session
   */
  getActivity(sessionName: string): SessionActivity {
    const data = this.activities.get(sessionName);
    const now = Date.now();

    if (!data) {
      return {
        lastOutputAt: 0,
        activityState: 'idle',
      };
    }

    const timeSinceOutput = now - data.lastOutputAt;

    let activityState: ActivityState = 'idle';

    if (timeSinceOutput < ACTIVITY_IDLE_THRESHOLD) {
      activityState = 'active';
    } else if (timeSinceOutput >= ACTIVITY_WAITING_THRESHOLD) {
      // Check for waiting patterns only if idle for a bit
      if (this.checkWaitingForInput(sessionName)) {
        activityState = 'waiting_for_input';
      }
    }

    return {
      lastOutputAt: data.lastOutputAt,
      activityState,
    };
  }

  /**
   * Remove tracking for a session
   */
  remove(sessionName: string): void {
    this.activities.delete(sessionName);
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.activities.clear();
  }
}

export const activityService = new ActivityService();
