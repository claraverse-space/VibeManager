import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, type CreateTaskWithFreshSessionInput } from '../lib/api';
import { useTaskStore } from '../stores/taskStore';
import type { CreateTaskInput, UpdateTaskInput } from '@vibemanager/shared';

export function useTasks() {
  const queryClient = useQueryClient();
  const { addTask, updateTask, removeTask } = useTaskStore();

  const createTask = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: (task) => {
      addTask(task);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createTaskWithFreshSession = useMutation({
    mutationFn: (input: CreateTaskWithFreshSessionInput) => tasksApi.createWithFreshSession(input),
    onSuccess: (task) => {
      addTask(task);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      tasksApi.update(id, input),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: (_, id) => {
      removeTask(id);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const startTask = useMutation({
    mutationFn: (id: string) => tasksApi.start(id),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const pauseTask = useMutation({
    mutationFn: (id: string) => tasksApi.pause(id),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const resumeTask = useMutation({
    mutationFn: (id: string) => tasksApi.resume(id),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const cancelTask = useMutation({
    mutationFn: ({ id, force = false }: { id: string; force?: boolean }) =>
      tasksApi.cancel(id, force),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const completeTask = useMutation({
    mutationFn: ({ id, result }: { id: string; result?: string }) =>
      tasksApi.complete(id, result),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const queueTask = useMutation({
    mutationFn: (id: string) => tasksApi.queue(id),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const unqueueTask = useMutation({
    mutationFn: (id: string) => tasksApi.unqueue(id),
    onSuccess: (task) => {
      if (task) {
        updateTask(task.id, task);
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return {
    createTask,
    createTaskWithFreshSession,
    updateTask: updateTaskMutation,
    deleteTask,
    startTask,
    pauseTask,
    resumeTask,
    cancelTask,
    completeTask,
    queueTask,
    unqueueTask,
  };
}
