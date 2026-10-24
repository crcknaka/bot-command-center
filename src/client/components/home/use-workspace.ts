import { useQuery } from '@tanstack/react-query';
import { useBots } from '../../hooks/use-bots.js';
import { apiFetch } from '../../lib/api.js';
import type { ComposerChannel } from './composer.js';
import type { HomeChat } from './types.js';

/** Bots with everything a post or a rule can target: channel rows and the groups behind them */
export function useWorkspace() {
  const { data: bots, isLoading } = useBots();

  // Every channel and topic of every bot
  const channels: ComposerChannel[] = (bots ?? []).flatMap((bot: any) => {
    // A topic row may carry the raw chat id as its title; the group's own row has the real name
    const chatTitles = new Map<string, string>();
    for (const ch of bot.channels ?? []) if (!ch.threadId && ch.title !== ch.chatId) chatTitles.set(ch.chatId, ch.title);
    return (bot.channels ?? []).map((ch: any) => {
      const chatTitle = chatTitles.get(ch.chatId) ?? ch.title;
      return {
        id: ch.id,
        title: chatTitle + (ch.threadId ? ` # ${ch.threadTitle || ch.threadId}` : ''),
        chatTitle,
        type: ch.type,
        chatId: ch.chatId,
        threadId: ch.threadId ?? null,
        threadTitle: ch.threadTitle ?? null,
        botId: bot.id,
        botName: bot.name,
        botRunning: !!bot.isRunning,
      };
    });
  });

  // Groups the bot sits in; topics of one group are separate channel rows, so they collapse here
  const groups: HomeChat[] = [];
  for (const ch of channels) {
    if (ch.type !== 'group' && ch.type !== 'supergroup') continue;
    if (groups.some((g) => g.chatId === ch.chatId && g.botId === ch.botId)) continue;
    groups.push({ chatId: ch.chatId, title: ch.chatTitle, botId: ch.botId, botName: ch.botName, botRunning: ch.botRunning });
  }

  // With a single bot its name only adds noise to chat labels
  const multiBot = (bots?.length ?? 0) > 1;

  return { bots: (bots ?? []) as any[], channels, groups, multiBot, isLoading };
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
