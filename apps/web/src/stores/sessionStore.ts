import { create } from 'zustand';
import type { Session, SystemStats, ListeningPort, SessionActivity } from '@vibemanager/shared';

type SessionWithAlive = Session & { alive: boolean; activity: SessionActivity };

interface SessionState {
  sessions: SessionWithAlive[];
  currentSession: string | null;
  systemStats: SystemStats | null;
  ports: ListeningPort[];
  isLoading: boolean;

  // Actions
  setSessions: (sessions: SessionWithAlive[]) => void;
  setCurrentSession: (name: string | null) => void;
  setSystemStats: (stats: SystemStats) => void;
  setPorts: (ports: ListeningPort[]) => void;
  setIsLoading: (loading: boolean) => void;
  addSession: (session: SessionWithAlive) => void;
  removeSession: (name: string) => void;
  updateSession: (name: string, updates: Partial<SessionWithAlive>) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSession: null,
  systemStats: null,
  ports: [],
  isLoading: true,

  setSessions: (sessions) => set({ sessions, isLoading: false }),
  setCurrentSession: (currentSession) => set({ currentSession }),
  setSystemStats: (systemStats) => set({ systemStats }),
  setPorts: (ports) => set({ ports }),
  setIsLoading: (isLoading) => set({ isLoading }),
  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
    })),
  removeSession: (name) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.name !== name),
      currentSession: state.currentSession === name ? null : state.currentSession,
    })),
  updateSession: (name, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.name === name ? { ...s, ...updates } : s
      ),
    })),
}));

// Selector hooks
export const useCurrentSession = () => {
  const { sessions, currentSession } = useSessionStore();
  return sessions.find((s) => s.name === currentSession) || null;
};

export const useAliveSessions = () => {
  const { sessions } = useSessionStore();
  return sessions.filter((s) => s.alive);
};

export const useDeadSessions = () => {
  const { sessions } = useSessionStore();
  return sessions.filter((s) => !s.alive);
};
