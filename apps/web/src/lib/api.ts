import type {
  Session,
  CreateSessionInput,
  SystemStats,
  ListeningPort,
  DirectoryEntry,
  ApiResponse,
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  VerifierConfig,
  ShellType,
} from '@vibemanager/shared';

// Fresh session task creation input
export interface CreateTaskWithFreshSessionInput {
  task: {
    name: string;
    prompt: string;
    runnerType?: 'ralph' | 'simple' | 'manual';
    maxIterations?: number;
    verificationPrompt?: string | null;
  };
  session: {
    name: string;
    projectPath: string;
    shell: ShellType;
  };
}
import { useAuthStore } from '../stores/authStore';

type SessionWithAlive = Session & { alive: boolean };

const API_BASE = '/api';

// Get auth token from store
function getToken(): string | null {
  return useAuthStore.getState().token;
}

// Handle 401 responses
function handleUnauthorized() {
  const { logout } = useAuthStore.getState();
  logout();
  // Redirect will be handled by the app router
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
  skipAuth = false
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  // Add auth header if token exists and auth is not skipped
  if (token && !skipAuth) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized
  if (response.status === 401 && !skipAuth) {
    handleUnauthorized();
    throw new Error('Session expired. Please login again.');
  }

  const json: ApiResponse<T> = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Request failed');
  }

  return json.data as T;
}

// Session API
export const sessionsApi = {
  list: () => request<SessionWithAlive[]>('/sessions'),

  get: (id: string) => request<SessionWithAlive>(`/sessions/${id}`),

  getLast: () => request<SessionWithAlive | null>('/sessions/last'),

  create: (input: CreateSessionInput) =>
    request<SessionWithAlive>('/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    request<void>(`/sessions/${id}`, {
      method: 'DELETE',
    }),

  stop: (id: string) =>
    request<void>(`/sessions/${id}/stop`, {
      method: 'POST',
    }),

  revive: (id: string) =>
    request<SessionWithAlive>(`/sessions/${id}/revive`, {
      method: 'POST',
    }),

  getScrollback: (id: string) =>
    request<string | null>(`/sessions/${id}/scrollback`),

  setPreviewPort: (id: string, port: number | null) =>
    request<void>(`/sessions/${id}/preview-port`, {
      method: 'PUT',
      body: JSON.stringify({ port }),
    }),
};

// System API
export const systemApi = {
  getStats: () => request<SystemStats>('/system'),
  getPorts: () => request<ListeningPort[]>('/system/ports'),
};

// Browse API
export const browseApi = {
  list: (path?: string) =>
    request<DirectoryEntry[]>(`/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),

  mkdir: (path: string) =>
    request<void>('/browse/mkdir', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
};

// Health API
export const healthApi = {
  check: () =>
    request<{ status: string; timestamp: string; availableShells: string[] }>(
      '/health'
    ),
};

// Auth types
interface AuthUser {
  id: string;
  username: string;
}

interface LoginResponse {
  user: AuthUser;
  token: string;
}

interface SetupStatusResponse {
  setupRequired: boolean;
}

// Settings API
type VerifierConfigResponse = VerifierConfig & { hasApiKey: boolean };

export const settingsApi = {
  getVerifier: () => request<VerifierConfigResponse>('/settings/verifier'),

  updateVerifier: (config: Partial<VerifierConfig>) =>
    request<VerifierConfigResponse>('/settings/verifier', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  testVerifier: () =>
    request<{ message: string }>('/settings/verifier/test', {
      method: 'POST',
    }),
};

// Tasks API
export const tasksApi = {
  list: (sessionId?: string) =>
    request<Task[]>(`/tasks${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),

  get: (id: string) => request<Task>(`/tasks/${id}`),

  create: (input: CreateTaskInput) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: UpdateTaskInput) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    request<void>(`/tasks/${id}`, {
      method: 'DELETE',
    }),

  start: (id: string) =>
    request<Task>(`/tasks/${id}/start`, {
      method: 'POST',
    }),

  pause: (id: string) =>
    request<Task>(`/tasks/${id}/pause`, {
      method: 'POST',
    }),

  resume: (id: string) =>
    request<Task>(`/tasks/${id}/resume`, {
      method: 'POST',
    }),

  cancel: (id: string, force = false) =>
    request<Task>(`/tasks/${id}/cancel${force ? '?force=true' : ''}`, {
      method: 'POST',
    }),

  complete: (id: string, result?: string) =>
    request<Task>(`/tasks/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ result: result || '' }),
    }),

  queue: (id: string) =>
    request<Task>(`/tasks/${id}/queue`, {
      method: 'POST',
    }),

  unqueue: (id: string) =>
    request<Task>(`/tasks/${id}/unqueue`, {
      method: 'POST',
    }),

  // Create a task with a fresh session (creates session, waits for it to be ready, then starts task)
  createWithFreshSession: (input: CreateTaskWithFreshSessionInput) =>
    request<Task>('/tasks/fresh-session', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// Auth API
export const authApi = {
  // Check if initial setup is required (no auth needed)
  getSetupStatus: () =>
    request<SetupStatusResponse>('/auth/setup-status', undefined, true),

  // Initial setup - create first user (no auth needed)
  setup: (username: string, password: string) =>
    request<LoginResponse>(
      '/auth/setup',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      true
    ),

  // Login (no auth needed)
  login: (username: string, password: string) =>
    request<LoginResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      true
    ),

  // Logout
  logout: () =>
    request<void>('/auth/logout', {
      method: 'POST',
    }),

  // Get current user
  me: () => request<AuthUser>('/auth/me'),

  // Change password
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
};
