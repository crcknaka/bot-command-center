import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'a', 'br', 'code', 'pre', 'p', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

/** For use with dangerouslySetInnerHTML */
export function safeHtml(html: string): { __html: string } {
  return { __html: sanitizeHtml(html) };
}
