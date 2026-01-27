import { z } from 'zod';

// Session validation
export const shellTypeSchema = z.enum(['opencode', 'claude', 'bash']);
export const shellTypeWithAutoSchema = z.enum(['opencode', 'claude', 'bash', 'auto']);

export const createSessionSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(50, 'Name must be 50 characters or less')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Name can only contain letters, numbers, underscores, and hyphens'),
  projectPath: z.string().min(1, 'Project path is required'),
  shell: shellTypeWithAutoSchema.optional().default('auto'),
  initialPrompt: z.string().optional(),
  autonomous: z.boolean().optional().default(true),
});

export const updateSessionSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  initialPrompt: z.string().optional(),
  autonomous: z.boolean().optional(),
});

// Terminal resize validation
export const terminalResizeSchema = z.object({
  cols: z.number().int().min(1).max(500),
  rows: z.number().int().min(1).max(200),
});

// Directory browse validation
export const browseDirectorySchema = z.object({
  path: z.string().min(1),
});

// Settings validation
export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  codeServerPort: z.number().int().min(1024).max(65535).optional(),
  defaultShell: shellTypeWithAutoSchema.optional(),
});

// Type exports - using z.input for types that have optional fields with defaults
export type CreateSessionInput = z.input<typeof createSessionSchema>;
export type UpdateSessionInput = z.input<typeof updateSessionSchema>;
export type TerminalResizeInput = z.infer<typeof terminalResizeSchema>;
export type BrowseDirectoryInput = z.infer<typeof browseDirectorySchema>;
export type SettingsInput = z.input<typeof settingsSchema>;
