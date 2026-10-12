import { useQuery } from '@tanstack/react-query';
import { useBots } from '../../hooks/use-bots.js';
import { apiFetch } from '../../lib/api.js';
import type { ComposerChannel } from './composer.js';
import type { HomeChat } from './types.js';

/** Bots with everything a post or a rule can target: channel rows and the groups behind them */
export function useWorkspace() {
  const { data: bots, isLoading } = useBots();

  // Every channel and topic of every bot
  const channels: ComposerChannel[] = (bots ?? []).flatMap((bot: any) =>
    (bot.channels ?? []).map((ch: any) => ({
      id: ch.id,
      title: ch.title + (ch.threadId ? ` # ${ch.threadTitle || ch.threadId}` : ''),
      chatTitle: ch.title,
      type: ch.type,
      chatId: ch.chatId,
      threadId: ch.threadId ?? null,
      threadTitle: ch.threadTitle ?? null,
      botId: bot.id,
      botName: bot.name,
      botRunning: !!bot.isRunning,
    }))
  );

  // Groups the bot sits in; topics of one group are separate channel rows, so they collapse here
  const groups: HomeChat[] = [];
  for (const ch of channels) {
    if (ch.type !== 'group' && ch.type !== 'supergroup') continue;
    if (groups.some((g) => g.chatId === ch.chatId && g.botId === ch.botId)) continue;
    groups.push({ chatId: ch.chatId, title: ch.chatTitle, botId: ch.botId, botName: ch.botName, botRunning: ch.botRunning });
  }

  return { bots: (bots ?? []) as any[], channels, groups, isLoading };
}

/** Things that need a look: posts that failed to send and bots that are not running */
export function useAlerts() {
  const { data: bots } = useBots();
  const { data: failed } = useQuery({
    queryKey: ['posts', { status: 'failed' }],
    queryFn: () => apiFetch('/posts?status=failed'),
    refetchInterval: 60000,
  });
  const failedPosts: any[] = failed ?? [];
  const stoppedBots: any[] = bots?.filter((b: any) => b.status === 'stopped' || b.status === 'error') ?? [];
  return { failedPosts, stoppedBots, count: failedPosts.length + stoppedBots.length };
}
