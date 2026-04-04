import { sanitizeHtml } from '../lib/sanitize.js';

interface TelegramPreviewProps {
  content: string;
  imageUrl?: string;
  channelTitle?: string;
}

export function TelegramPreview({ content, imageUrl, channelTitle }: TelegramPreviewProps) {
  return (
    <div className="max-w-sm rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
      {channelTitle && (
        <div className="px-3 py-2 text-xs font-semibold text-blue-400 border-b" style={{ borderColor: 'var(--border)' }}>
          {channelTitle}
        </div>
      )}

      {imageUrl && (
        <div className="aspect-video bg-zinc-800 flex items-center justify-center">
          <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}

      <div
        className="px-3 py-2.5 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
      />

      <div className="px-3 pb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
