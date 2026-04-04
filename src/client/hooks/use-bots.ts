import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';

export function useBots() {
  return useQuery({ queryKey: ['bots'], queryFn: () => apiFetch('/bots') });
}

export function useBot(id: number) {
  return useQuery({ queryKey: ['bot', id], queryFn: () => apiFetch(`/bots/${id}`) });
}

export function useCreateBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => apiFetch('/bots', { method: 'POST', body: JSON.stringify({ token }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bots'] }),
  });
}

export function useDeleteBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/bots/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bots'] }),
  });
}

export function useBotAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' | 'restart' | 'test' }) =>
      apiFetch(`/bots/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_data, vars) => { qc.invalidateQueries({ queryKey: ['bots'] }); qc.invalidateQueries({ queryKey: ['bot', vars.id] }); },
  });
}
