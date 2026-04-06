// ─── Post Status ─────────────────────────────────────────────────────────────

export const postStatusConfig: Record<string, { badge: string; label: string; dot: string }> = {
  draft:      { badge: 'bg-zinc-500/15 text-zinc-400',  label: 'Черновик',       dot: 'bg-zinc-500' },
  queued:     { badge: 'bg-yellow-500/15 text-yellow-400', label: 'В очереди',    dot: 'bg-yellow-500' },
  publishing: { badge: 'bg-cyan-500/15 text-cyan-400',  label: 'Публикуется...', dot: 'bg-cyan-500' },
  published:  { badge: 'bg-green-500/15 text-green-400', label: 'Опубликован',   dot: 'bg-green-500' },
  failed:     { badge: 'bg-red-500/15 text-red-400',    label: 'Ошибка',         dot: 'bg-red-500' },
};

export const postStatusFilters = [
  { value: 'all', label: 'Все' },
  { value: 'draft', label: 'Черновики' },
  { value: 'queued', label: 'В очереди' },
  { value: 'published', label: 'Опубликовано' },
  { value: 'failed', label: 'Ошибки' },
] as const;

// ─── Bot Status ──────────────────────────────────────────────────────────────

export const botStatusConfig: Record<string, { dot: string; label: string; badge: string }> = {
  active:  { dot: 'bg-green-500', label: 'Работает',    badge: 'bg-green-500/15 text-green-400' },
  stopped: { dot: 'bg-zinc-500',  label: 'Остановлен',  badge: 'bg-zinc-500/15 text-zinc-400' },
  error:   { dot: 'bg-red-500',   label: 'Ошибка',      badge: 'bg-red-500/15 text-red-400' },
};

// ─── Member Status ───────────────────────────────────────────────────────────

export const memberStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  member:        { label: 'Участник',   color: 'text-green-400',  bg: 'bg-green-500/10' },
  administrator: { label: 'Админ',      color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  creator:       { label: 'Создатель',  color: 'text-purple-400', bg: 'bg-purple-500/10' },
  restricted:    { label: 'Ограничен',  color: 'text-orange-400', bg: 'bg-orange-500/10' },
  kicked:        { label: 'Забанен',    color: 'text-red-400',    bg: 'bg-red-500/10' },
  left:          { label: 'Вышел',      color: 'text-zinc-400',   bg: 'bg-zinc-500/10' },
  unknown:       { label: 'Неизвестно', color: 'text-zinc-400',   bg: 'bg-zinc-500/10' },
};
