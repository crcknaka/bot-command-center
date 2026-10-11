/** Telegram limits, counted on the text the reader sees (tags excluded) */
export const MESSAGE_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

// Tags Telegram renders in parse_mode=HTML
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'blockquote', 'tg-spoiler', 'a', 'span']);
// Block-level tags that Telegram does not know but that imply a line break
const LINE_BREAK_AFTER = new Set(['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr']);

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*)?)\s*\/?>/g;

function escapeText(text: string): string {
  return text
    .replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** Opening tag as Telegram accepts it, or null when the tag has to be dropped */
function openTag(tag: string, attrs: string): string | null {
  if (tag === 'a') {
    const href = attr(attrs, 'href');
    if (!href || !/^(https?:|tg:|mailto:)/i.test(href.trim())) return null;
    return `<a href="${href.trim().replace(/&(?!amp;)/g, '&amp;').replace(/"/g, '&quot;')}">`;
  }
  if (tag === 'span') {
    return attr(attrs, 'class') === 'tg-spoiler' ? '<span class="tg-spoiler">' : null;
  }
  if (tag === 'code') {
    const cls = attr(attrs, 'class');
    return cls && /^language-[\w+-]+$/.test(cls) ? `<code class="${cls}">` : '<code>';
  }
  if (tag === 'blockquote') {
    return /\sexpandable\b/i.test(attrs) ? '<blockquote expandable>' : '<blockquote>';
  }
  return `<${tag}>`;
}

/**
 * Make HTML safe for Telegram's parse_mode=HTML: keep supported tags, turn <br> and
 * block tags into line breaks, drop everything else, escape stray &, < and >,
 * and close whatever was left open. Telegram rejects the whole message otherwise.
 */
export function sanitizeForTelegram(html: string): string {
  let out = '';
  let last = 0;
  // Open tags in order; `emitted` is false for tags that were dropped (their closing tag is dropped too)
  const stack: Array<{ tag: string; emitted: boolean }> = [];

  for (const m of html.matchAll(TAG_RE)) {
    out += escapeText(html.slice(last, m.index));
    last = m.index! + m[0].length;

    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';

    if (tag === 'br') { out += '\n'; continue; }

    if (!ALLOWED.has(tag)) {
      if (tag === 'li' && !closing) out += '• ';
      if (closing && LINE_BREAK_AFTER.has(tag)) out += '\n';
      continue;
    }

    if (!closing) {
      const open = openTag(tag, attrs);
      stack.push({ tag, emitted: open !== null });
      if (open) out += open;
      continue;
    }

    // Closing tag: close everything opened after its match, then the match itself
    const idx = stack.map((s) => s.tag).lastIndexOf(tag);
    if (idx === -1) continue;
    for (const s of stack.splice(idx).reverse()) {
      if (s.emitted) out += `</${s.tag}>`;
    }
  }

  out += escapeText(html.slice(last));
  for (const s of stack.reverse()) {
    if (s.emitted) out += `</${s.tag}>`;
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Length of the text as the reader sees it — what Telegram's limits apply to */
export function visibleLength(html: string): number {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot);/g, 'x')
    .length;
}
