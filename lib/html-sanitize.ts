import { decode } from 'html-entities';

export interface SanitizeResult {
  text: string;
  hadHtml: boolean;
  details: string;
}

/**
 * Sanitize HTML from an ICS event field (summary, description, location).
 *
 * Behaviour:
 * - <br> / <br/> / </p> / </div> / </li> → newlines
 * - <a href="..."> kept, all other attributes stripped, empty anchors removed
 * - All other HTML tags stripped (inner text preserved)
 * - HTML entities decoded via html-entities
 * - Excessive whitespace collapsed (multiple blank lines → max 2, multiple spaces → 1)
 */
export function sanitizeEventText(
  text: string,
  source: string,
  field: 'summary' | 'description' | 'location'
): SanitizeResult {
  // Quick bail-out for clean text (no tags, no entities)
  if (!/<[a-zA-Z\/!]|&(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);/.test(text)) {
    return { text, hadHtml: false, details: '' };
  }

  let result = text;

  // Step 1: Block-level closers → newlines so text reads naturally
  result = result
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n');

  // Step 2: <a href="..."> — keep href only, strip extra attributes.
  // Empty anchors (no visible text) are collapsed to their inner whitespace
  // so surrounding text gets a natural space rather than being joined.
  result = result.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_, href, inner) => {
      const strippedInner = inner.replace(/<[^>]+>/g, '');
      const cleanInner = strippedInner.trim();
      // Non-empty text: wrap in clean <a>; empty: return whitespace only (no tag)
      return cleanInner ? `<a href="${href}">${cleanInner}</a>` : strippedInner;
    }
  );
  // Remaining <a> WITHOUT href — strip tag, keep inner text.
  // The negative lookahead avoids re-processing the clean <a href> tags above.
  result = result.replace(
    /<a\b(?![^>]*href=["'])[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_, inner) => inner.replace(/<[^>]+>/g, '').trim()
  );

  // Collect tag names about to be stripped (for details reporting)
  const strippedTags = new Set<string>();
  result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*/g, (_, tag) => {
    const lower = tag.toLowerCase();
    if (lower !== 'a') strippedTags.add(lower);
    return '';
  });

  // Step 3: Strip all remaining non-<a> tags (keep <a href> and </a>)
  result = result.replace(/<(?!\/?a\b)[^>]+>/gi, '');

  // Step 4: Decode HTML entities
  result = decode(result);

  // Step 5: Collapse whitespace
  result = result.replace(/[ \t]+/g, ' ');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim();

  const hadHtml = result !== text;
  let details = '';
  if (hadHtml) {
    const parts: string[] = [];
    if (strippedTags.size > 0) {
      parts.push(`stripped <${Array.from(strippedTags).join('>, <')}>`);
    }
    if (/&(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);/.test(text)) {
      parts.push('decoded HTML entities');
    }
    details = `[${source}] ${field}: ${parts.join('; ')}`;
  }

  return { text: result, hadHtml, details };
}
