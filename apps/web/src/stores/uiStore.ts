import { create } from 'zustand';
import type { ViewMode } from '@vibemanager/shared';
import { getPreviewUrl } from '../lib/baseUrl';

interface UIState {
  theme: 'dark' | 'light';
  viewMode: ViewMode;
  previewUrl: string;
  previewPort: number | null;
  isConnecting: boolean;

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setViewMode: (mode: ViewMode) => void;
  setPreviewUrl: (url: string) => void;
  setPreviewPort: (port: number | null) => void;
  setIsConnecting: (connecting: boolean) => void;
  setPreviewFromPort: (port: number | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  viewMode: 'dashboard',
  previewUrl: '',
  previewPort: null,
  isConnecting: false,

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
}));
