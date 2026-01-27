import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import type { CreateSessionInput, SessionActivity } from '@vibemanager/shared';

// Default activity for newly created sessions
const defaultActivity: SessionActivity = {
  lastOutputAt: Date.now(),
  activityState: 'active',
};

export function useSessions() {
  const queryClient = useQueryClient();
  const { addSession, removeSession, updateSession, setCurrentSession } = useSessionStore();

  const createMutation = useMutation({
    mutationFn: (input: CreateSessionInput) => sessionsApi.create(input),
    onSuccess: (session) => {
      addSession({ ...session, activity: defaultActivity });
      setCurrentSession(session.name);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: (_, id) => {
      removeSession(id);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.stop(id),
    onSuccess: (_, id) => {
      updateSession(id, { alive: false });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const reviveMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.revive(id),
    onSuccess: (session) => {
      updateSession(session.name, { alive: true });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  return {
    create: createMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
    stop: stopMutation.mutateAsync,
    revive: reviveMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isStopping: stopMutation.isPending,
    isReviving: reviveMutation.isPending,
  };
}
