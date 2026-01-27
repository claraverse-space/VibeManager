import { create } from 'zustand';
import type { Terminal } from '@xterm/xterm';

interface TerminalState {
  terminal: Terminal | null;
  isConnected: boolean;
  connectedSession: string | null;

  // Modifier keys state
  ctrlActive: boolean;
  altActive: boolean;
  shiftActive: boolean;

  // Actions
  setTerminal: (terminal: Terminal | null) => void;
  setIsConnected: (connected: boolean) => void;
  setConnectedSession: (session: string | null) => void;
  toggleCtrl: () => void;
  toggleAlt: () => void;
  toggleShift: () => void;
  clearModifiers: () => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  terminal: null,
  isConnected: false,
  connectedSession: null,
  ctrlActive: false,
  altActive: false,
  shiftActive: false,

  setTerminal: (terminal) => set({ terminal }),
  setIsConnected: (isConnected) => set({ isConnected }),
  setConnectedSession: (connectedSession) => set({ connectedSession }),
  toggleCtrl: () => set((state) => ({ ctrlActive: !state.ctrlActive })),
  toggleAlt: () => set((state) => ({ altActive: !state.altActive })),
  toggleShift: () => set((state) => ({ shiftActive: !state.shiftActive })),
  clearModifiers: () =>
    set({ ctrlActive: false, altActive: false, shiftActive: false }),
}));
