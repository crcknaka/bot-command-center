import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';

export function usePosts(params?: { status?: string; channelId?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.channelId) searchParams.set('channelId', String(params.channelId));
  const qs = searchParams.toString();

  return useQuery({
    queryKey: ['posts', params],
    queryFn: () => apiFetch(`/posts${qs ? `?${qs}` : ''}`),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { channelId: number; content: string; imageUrl?: string; status?: string; scheduledFor?: string }) =>
      apiFetch('/posts', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

export function usePublishPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/posts/${id}/publish`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; content?: string; status?: string; scheduledFor?: string }) =>
      apiFetch(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

export function useGeneratePost() {
  return useMutation({
    mutationFn: (data: {
      providerId: number;
      modelId: string;
      topic: string;
      systemPrompt?: string;
      language?: string;
      maxLength?: number;
      useSearch?: boolean;
    }) => apiFetch('/ai-providers/generate', { method: 'POST', body: JSON.stringify(data) }),
  });
}
