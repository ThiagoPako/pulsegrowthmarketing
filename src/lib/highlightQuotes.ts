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
 * Highlights text within double quotes ("...") with a yellow marker effect.
 * First cleans any inline styles/spans that might break quote detection.
 */
export function highlightQuotes(html: string): string {
  if (!html) return html;
  const cleaned = cleanHtml(html);
  return cleaned.replace(
    /["""]([^"""]+)["""]/g,
    '<mark style="background-color: #fef9c3; padding: 1px 3px; border-radius: 2px;">&ldquo;$1&rdquo;</mark>'
  );
}

/**
 * Same highlight but for PDF rendering (slightly darker yellow for print)
 */
export function highlightQuotesForPdf(html: string): string {
  if (!html) return html;
  const cleaned = cleanHtml(html);
  return cleaned.replace(
    /["""]([^"""]+)["""]/g,
    '<mark style="background-color: #fef08a; padding: 1px 3px; border-radius: 2px;">&ldquo;$1&rdquo;</mark>'
  );
}
