import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format seconds to human readable uptime string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format date relative to now
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * Generate ASCII bar for progress visualization
 */
export function generateAsciiBar(percent: number, width = 20): { filled: string; empty: string } {
  const filledCount = Math.round((percent / 100) * width);
  const emptyCount = width - filledCount;
  return {
    filled: '█'.repeat(filledCount),
    empty: '░'.repeat(emptyCount),
  };
}

/**
 * Generate sparkline from values
 */
export function generateSparkline(values: number[], max?: number): string {
  const chars = '▁▂▃▄▅▆▇█';
  const maxVal = max ?? Math.max(...values);
  if (maxVal === 0) return chars[0].repeat(values.length);

  return values
    .map((v) => {
      const index = Math.min(Math.floor((v / maxVal) * (chars.length - 1)), chars.length - 1);
      return chars[index];
    })
    .join('');
}

/**
 * Get temperature class based on value
 */
export function getTemperatureClass(temp: number): 'cool' | 'warm' | 'hot' {
  if (temp >= 80) return 'hot';
  if (temp >= 60) return 'warm';
  return 'cool';
}

/**
 * Truncate path for display
 */
export function truncatePath(path: string, maxLength = 40): string {
  if (path.length <= maxLength) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return '...' + path.slice(-maxLength + 3);
  return '.../' + parts.slice(-2).join('/');
}
