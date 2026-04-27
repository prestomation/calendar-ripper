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
 * - <a href="url">text</a> → "text (url)" (or just "url" if text equals url)
 * - <a href="url"></a> (empty) → "url"
 * - All other HTML tags stripped (inner text preserved)
 * - HTML entities decoded via html-entities
 * - Excessive whitespace collapsed (multiple blank lines → max 2, multiple spaces → 1)
 *
 * Result is plain text suitable for ICS, RSS, and plain-text consumers.
 * The website should linkify bare URLs separately (presentation concern).
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

  // Step 2: Convert <a href="url">link text</a> to plain text.
  // - If link text differs from URL: "link text (url)"
  // - If link text equals URL: just "url"
  // - If empty link text: just "url"
  // Also strips any inner HTML from the link text.
  result = result.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_match, href, inner) => {
      const strippedInner = inner.replace(/<[^>]+>/g, '').trim();
      if (!strippedInner) return href;
      // Decode entities in both for comparison
      const decodedHref = decode(href);
      const decodedInner = decode(strippedInner);
      if (decodedInner === decodedHref) return decodedHref;
      return `${strippedInner} (${href})`;
    }
  );
  // <a> WITHOUT href — strip tag, keep inner text
  result = result.replace(
    /<a\b(?![^>]*href=["'])[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_match, inner) => inner.replace(/<[^>]+>/g, '').trim()
  );

  // Collect tag names about to be stripped (for details reporting)
  const strippedTags = new Set<string>();
  result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*/g, (_, tag) => {
    strippedTags.add(tag.toLowerCase());
    return '';
  });

  // Step 3: Strip all remaining HTML tags (inner text preserved where applicable)
  result = result.replace(/<[^>]+>/g, '');

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