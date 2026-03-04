/**
 * Highlights text within double quotes ("...") with a yellow marker effect.
 * Works on HTML strings — wraps quoted speech in a highlighted span.
 */
export function highlightQuotes(html: string): string {
  if (!html) return html;
  // Match "text" (both regular and smart quotes)
  return html.replace(
    /["""]([^"""]+)["""]/g,
    '<mark style="background-color: #fef9c3; padding: 1px 3px; border-radius: 2px;">&ldquo;$1&rdquo;</mark>'
  );
}

/**
 * Same highlight but for PDF rendering (inline style with slightly different color for print)
 */
export function highlightQuotesForPdf(html: string): string {
  if (!html) return html;
  return html.replace(
    /["""]([^"""]+)["""]/g,
    '<mark style="background-color: #fef08a; padding: 1px 3px; border-radius: 2px;">&ldquo;$1&rdquo;</mark>'
  );
}
