import { create } from 'zustand';
import type { ViewMode } from '@vibemanager/shared';
import { getPreviewUrl } from '../lib/baseUrl';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
}

interface UIState {
  theme: 'dark' | 'light';
  viewMode: ViewMode;
  previewUrl: string;
  previewPort: number | null;
  isConnecting: boolean;
  toasts: Toast[];

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setViewMode: (mode: ViewMode) => void;
  setPreviewUrl: (url: string) => void;
  setPreviewPort: (port: number | null) => void;
  setIsConnecting: (connecting: boolean) => void;
  setPreviewFromPort: (port: number | null) => void;
  showToast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  viewMode: 'dashboard',
  previewUrl: '',
  previewPort: null,
  isConnecting: false,
  toasts: [],

  setTheme: (theme) => set({ theme }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  setViewMode: (viewMode) => set({ viewMode }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setPreviewPort: (previewPort) => set({ previewPort }),
  setIsConnecting: (isConnecting) => set({ isConnecting }),

  setPreviewFromPort: (port) => {
    if (port) {
      const url = getPreviewUrl(port);
      set({ previewUrl: url, previewPort: port });
    } else {
      set({ previewUrl: '', previewPort: null });
    }
  },

  showToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
