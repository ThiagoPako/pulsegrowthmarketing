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
function normalizeDoubleQuotes(html: string): string {
  return html
    .replace(/&ldquo;|&rdquo;|&quot;|&#8220;|&#8221;|&#34;/g, '"')
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"');
}

/**
 * Normalize all types of single quotes/apostrophes to a standard '
 */
function normalizeSingleQuotes(html: string): string {
  return html
    .replace(/&lsquo;|&rsquo;|&apos;|&#8216;|&#8217;|&#39;/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

function normalizeQuotes(html: string): string {
  return normalizeSingleQuotes(normalizeDoubleQuotes(html));
}

/**
 * Replace quoted segments using a callback. Handles:
 *  - Double quotes: "..."
 *  - Single quotes: '...'  (only when clearly quoting, not apostrophes inside words)
 *  - Mixed: "...'...'..." or '..."..."...'  → outer wrapper wins.
 *
 * Skips matches inside HTML tags so attributes are not corrupted.
 */
function replaceQuoted(
  html: string,
  wrap: (inner: string, kind: 'double' | 'single') => string
): string {
  // Tokenize: keep HTML tags untouched, only process text segments.
  const parts = html.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg || seg.startsWith('<')) continue;

    let out = '';
    let idx = 0;
    while (idx < seg.length) {
      const ch = seg[idx];

      // Double-quoted block
      if (ch === '"') {
        const end = seg.indexOf('"', idx + 1);
        if (end > idx + 1) {
          out += wrap(seg.slice(idx + 1, end), 'double');
          idx = end + 1;
          continue;
        }
      }

      // Single-quoted block — guard against apostrophes (don't, it's, anos'70)
      if (ch === "'") {
        const prev = seg[idx - 1] ?? ' ';
        const isWordBoundaryStart = !/[A-Za-zÀ-ÿ0-9]/.test(prev);
        if (isWordBoundaryStart) {
          // Find a closing ' that is followed by non-letter/digit (so it's a quote close, not apostrophe)
          let end = -1;
          for (let j = idx + 1; j < seg.length; j++) {
            if (seg[j] === "'") {
              const next = seg[j + 1] ?? ' ';
              if (!/[A-Za-zÀ-ÿ0-9]/.test(next)) { end = j; break; }
            }
          }
          if (end > idx + 1) {
            out += wrap(seg.slice(idx + 1, end), 'single');
            idx = end + 1;
            continue;
          }
        }
      }

      out += ch;
      idx++;
    }
    parts[i] = out;
  }
  return parts.join('');
}

/**
 * Highlights text within quotes (double or single) with a yellow marker effect.
 */
export function highlightQuotes(html: string): string {
  if (!html) return html;
  const normalized = normalizeQuotes(cleanHtml(html));
  return replaceQuoted(normalized, (inner, kind) => {
    const open = kind === 'double' ? '&ldquo;' : '&lsquo;';
    const close = kind === 'double' ? '&rdquo;' : '&rsquo;';
    return `<mark style="background-color: #fef9c3; padding: 1px 3px; border-radius: 2px;">${open}${inner}${close}</mark>`;
  });
}

/**
 * Same highlight but for PDF rendering. Uses <span> inline so it can live inside <p>
 * without breaking the DOM (blocks inside paragraphs cause silent content loss).
 */
export function highlightQuotesForPdf(html: string): string {
  if (!html) return html;
  const normalized = normalizeQuotes(cleanHtml(html));
  return replaceQuoted(normalized, (inner, kind) => {
    const open = kind === 'double' ? '&ldquo;' : '&lsquo;';
    const close = kind === 'double' ? '&rdquo;' : '&rsquo;';
    return `<span style="background-color:#fef9c3; border:1px solid #eab308; padding:1px 6px; border-radius:4px; box-decoration-break:clone; -webkit-box-decoration-break:clone;">${open}${inner}${close}</span>`;
  });
}
