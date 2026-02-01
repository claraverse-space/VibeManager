import { create } from 'zustand';
import type { Task } from '@vibemanager/shared';

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;

  // Actions
  setTasks: (tasks: Task[]) => void;
  setSelectedTask: (id: string | null) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  selectedTaskId: null,

  setTasks: (tasks) => set({ tasks }),
  setSelectedTask: (selectedTaskId) => set({ selectedTaskId }),
  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
    })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    })),
}));

// Selectors
export const useSelectedTask = () => {
  const { tasks, selectedTaskId } = useTaskStore();
  return tasks.find((t) => t.id === selectedTaskId) || null;
};

export const useSessionTasks = (sessionId: string | null) => {
  const { tasks } = useTaskStore();
  if (!sessionId) return [];
  return tasks.filter((t) => t.sessionId === sessionId);
};

export const useRunningTasks = () => {
  const { tasks } = useTaskStore();
  return tasks.filter((t) => t.status === 'running' || t.status === 'paused');
};

export const usePendingTasks = () => {
  const { tasks } = useTaskStore();
  return tasks.filter((t) => t.status === 'pending');
};

export const useCompletedTasks = () => {
  const { tasks } = useTaskStore();
  return tasks.filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');
};
