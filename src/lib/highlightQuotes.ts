/**
 * Cleans pasted HTML artifacts: removes inline styles and unwraps empty spans.
 */
export function cleanHtml(html: string): string {
  // Remove style attributes
  let cleaned = html.replace(/\s*style="[^"]*"/gi, '');
  // Unwrap empty spans (no attributes left)
  cleaned = cleaned.replace(/<span\s*>(.*?)<\/span>/gi, '$1');
  return cleaned;
}

/**
 * Normalize all types of double quotes (Unicode + HTML entities) to a standard "
 */
function normalizeQuotes(html: string): string {
  return html
    // HTML entities for smart quotes
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#34;/g, '"')
    // Unicode smart quotes
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"');
}

/**
 * Highlights text within double quotes ("...") with a yellow marker effect.
 * First cleans inline styles/spans and normalizes quote characters.
 */
export function highlightQuotes(html: string): string {
  if (!html) return html;
  const cleaned = cleanHtml(html);
  const normalized = normalizeQuotes(cleaned);
  return normalized.replace(
    /"([^"]+)"/g,
    '<mark style="background-color: #fef9c3; padding: 1px 3px; border-radius: 2px;">&ldquo;$1&rdquo;</mark>'
  );
}

/**
 * Same highlight but for PDF rendering (slightly darker yellow for print)
 */
export function highlightQuotesForPdf(html: string): string {
  if (!html) return html;
  const cleaned = cleanHtml(html);
  const normalized = normalizeQuotes(cleaned);
  return normalized.replace(
    /"([^"]+)"/g,
    '<div style="background-color:#fef9c3; border:1px solid #eab308; padding:6px 12px; margin:4px 0; border-radius:8px;">&ldquo;$1&rdquo;</div>'
  );
}
