const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Сервер вернул не-JSON ответ (${res.status}). Попробуйте перезагрузить страницу.`);
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data as T;
}
