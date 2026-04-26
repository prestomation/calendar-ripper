import { describe, it, expect } from 'vitest';
import { sanitizeEventText } from './html-sanitize.js';

describe('sanitizeEventText', () => {
  it('returns clean text unchanged with hadHtml=false', () => {
    const result = sanitizeEventText('Hello, world!', 'test-source', 'summary');
    expect(result.text).toBe('Hello, world!');
    expect(result.hadHtml).toBe(false);
    expect(result.details).toBe('');
  });

  it('returns text with & unchanged (not an entity) with hadHtml=false', () => {
    const result = sanitizeEventText('Cats & Dogs', 'test-source', 'description');
    expect(result.text).toBe('Cats & Dogs');
    expect(result.hadHtml).toBe(false);
  });

  it('replaces <br> with newline', () => {
    const result = sanitizeEventText('Line one<br>Line two', 'test-source', 'description');
    expect(result.text).toBe('Line one\nLine two');
    expect(result.hadHtml).toBe(true);
  });

  it('replaces <br/> with newline', () => {
    const result = sanitizeEventText('Line one<br/>Line two', 'test-source', 'description');
    expect(result.text).toBe('Line one\nLine two');
    expect(result.hadHtml).toBe(true);
  });

  it('replaces </p> with newline', () => {
    const result = sanitizeEventText('<p>Para one</p><p>Para two</p>', 'test-source', 'description');
    expect(result.text).toContain('Para one');
    expect(result.text).toContain('Para two');
    expect(result.hadHtml).toBe(true);
  });

  it('collapses multiple <br> tags to max two newlines', () => {
    const result = sanitizeEventText('A<br><br><br>B', 'test-source', 'description');
    expect(result.text).toBe('A\n\nB');
    expect(result.hadHtml).toBe(true);
  });

  it('keeps <a href> tag but strips extra attributes', () => {
    const result = sanitizeEventText(
      '<a href="https://example.com" id="ow495" __is_owner="true" style="color:red">link text</a>',
      'test-source',
      'description'
    );
    expect(result.text).toBe('<a href="https://example.com">link text</a>');
    expect(result.hadHtml).toBe(true);
  });

  it('keeps clean <a href> unchanged', () => {
    const result = sanitizeEventText(
      'See <a href="https://example.com">this link</a> for details.',
      'test-source',
      'description'
    );
    expect(result.text).toBe('See <a href="https://example.com">this link</a> for details.');
    // No stripping occurred — the <a> was already clean
    expect(result.hadHtml).toBe(false);
  });

  it('removes empty <a> tags', () => {
    const result = sanitizeEventText(
      'Before<a href="https://example.com">  </a>After',
      'test-source',
      'description'
    );
    expect(result.text).toBe('Before After');
    expect(result.hadHtml).toBe(true);
  });

  it('strips <a> with no href, keeps inner text', () => {
    const result = sanitizeEventText('<a name="anchor">text</a>', 'test-source', 'description');
    expect(result.text).toBe('text');
    expect(result.hadHtml).toBe(true);
  });

  it('strips <strong> but keeps inner text', () => {
    const result = sanitizeEventText('<strong>bold</strong>', 'test-source', 'description');
    expect(result.text).toBe('bold');
    expect(result.hadHtml).toBe(true);
  });

  it('strips <b>, <em>, <span> but keeps inner text', () => {
    const result = sanitizeEventText(
      '<b>bold</b> and <em>italic</em> and <span style="color:red">colored</span>',
      'test-source',
      'description'
    );
    expect(result.text).toBe('bold and italic and colored');
    expect(result.hadHtml).toBe(true);
  });

  it('decodes &nbsp; to space', () => {
    const result = sanitizeEventText('Hello&nbsp;World', 'test-source', 'description');
    expect(result.text).toBe('Hello\u00a0World');
    expect(result.hadHtml).toBe(true);
  });

  it('decodes &amp; to &', () => {
    const result = sanitizeEventText('Cats &amp; Dogs', 'test-source', 'description');
    expect(result.text).toBe('Cats & Dogs');
    expect(result.hadHtml).toBe(true);
  });

  it('decodes &#8217; to right single quotation mark', () => {
    const result = sanitizeEventText('it&#8217;s', 'test-source', 'description');
    expect(result.text).toBe('it\u2019s');
    expect(result.hadHtml).toBe(true);
  });

  it('strips CSS style attributes from tags before removing them', () => {
    const result = sanitizeEventText(
      '<span style="color: rgb(34, 34, 34); font-family: arial">text</span>',
      'test-source',
      'description'
    );
    expect(result.text).toBe('text');
    expect(result.hadHtml).toBe(true);
  });

  it('strips <table>, <tr>, <td> structures keeping inner text', () => {
    const result = sanitizeEventText(
      '<table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>',
      'test-source',
      'description'
    );
    expect(result.text).toContain('Cell 1');
    expect(result.text).toContain('Cell 2');
    expect(result.hadHtml).toBe(true);
  });

  it('preserves Facebook tracking redirect URL href as-is', () => {
    const href = 'https://l.facebook.com/l.php?u=https%3A%2F%2Factual-url.com&h=AT1abc';
    const result = sanitizeEventText(
      `<a href="${href}">See event</a>`,
      'test-source',
      'description'
    );
    expect(result.text).toBe(`<a href="${href}">See event</a>`);
    // href was already clean (no extra attributes to strip)
    expect(result.hadHtml).toBe(false);
  });

  it('handles mixed HTML: <p>, <br>, <a href>', () => {
    const result = sanitizeEventText(
      '<p>Some text<br><a href="https://example.com">link</a></p>',
      'test-source',
      'description'
    );
    expect(result.text).toContain('Some text');
    expect(result.text).toContain('<a href="https://example.com">link</a>');
    expect(result.text).not.toContain('<p>');
    expect(result.hadHtml).toBe(true);
  });

  it('collapses multiple spaces to single space', () => {
    const result = sanitizeEventText(
      '<span>Hello</span>   <span>World</span>',
      'test-source',
      'description'
    );
    expect(result.text).toBe('Hello World');
    expect(result.hadHtml).toBe(true);
  });

  it('trims leading/trailing whitespace', () => {
    const result = sanitizeEventText('  <p>hello</p>  ', 'test-source', 'description');
    expect(result.text).toBe('hello');
    expect(result.hadHtml).toBe(true);
  });

  it('includes source and field in details when HTML is stripped', () => {
    const result = sanitizeEventText('<p>text</p>', 'action-network', 'description');
    expect(result.details).toContain('action-network');
    expect(result.details).toContain('description');
  });

  it('works for summary field', () => {
    const result = sanitizeEventText('<b>Event Title</b>', 'test-source', 'summary');
    expect(result.text).toBe('Event Title');
    expect(result.hadHtml).toBe(true);
  });

  it('works for location field', () => {
    const result = sanitizeEventText(
      '<span>123 Main St</span>, Seattle, WA',
      'test-source',
      'location'
    );
    expect(result.text).toBe('123 Main St, Seattle, WA');
    expect(result.hadHtml).toBe(true);
  });
});
