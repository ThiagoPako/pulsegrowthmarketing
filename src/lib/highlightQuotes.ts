/**
 * Limpa artefatos de HTML colado: remove estilos inline e remove spans vazios.
 */
export function cleanHtml(html: string): string {
  if (!html) return '';
  // Remove atributos de estilo, mas preserva a tag
  let cleaned = html.replace(/\sstyle="[^"]*"/gi, '');
  // Remove spans que não possuem mais atributos
  cleaned = cleaned.replace(/<span\s*>(.*?)<\/span>/gi, '$1');
  return cleaned;
}

/**
 * Normaliza todos os tipos de aspas duplas (Unicode + entidades HTML) para o padrão "
 */
function normalizeDoubleQuotes(html: string): string {
  return html
    .replace(/&ldquo;|&rdquo;|&quot;|&#8220;|&#8221;|&#34;/g, '"')
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"');
}

/**
 * Normaliza todos os tipos de aspas simples/apóstrofos para o padrão '
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
 * Substitui segmentos entre aspas usando um callback.
 * Lógica robusta para ignorar aspas dentro de tags HTML e tratar apóstrofos.
 */
function replaceQuoted(
  html: string,
  wrap: (inner: string, kind: 'double' | 'single') => string
): string {
  // Divide o HTML em tags e texto puro para evitar corromper atributos
  const parts = html.split(/(<[^>]+>)/g);
  
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg || seg.startsWith('<')) continue;

    let out = '';
    let idx = 0;
    while (idx < seg.length) {
      const ch = seg[idx];

      // Bloco de aspas duplas: "..."
      if (ch === '"') {
        const end = seg.indexOf('"', idx + 1);
        if (end > idx + 1) {
          // Recursão simples para suportar aspas simples dentro de duplas no mesmo segmento
          const inner = seg.slice(idx + 1, end);
          out += wrap(inner, 'double');
          idx = end + 1;
          continue;
        }
      }

      // Bloco de aspas simples: '...' (proteção contra apóstrofos como "don't")
      if (ch === "'") {
        const prev = seg[idx - 1] ?? ' ';
        // Verifica se é início de palavra ou símbolo (limite de palavra)
        const isWordBoundaryStart = !/[A-Za-zÀ-ÿ0-9]/.test(prev);
        
        if (isWordBoundaryStart) {
          let end = -1;
          for (let j = idx + 1; j < seg.length; j++) {
            if (seg[j] === "'") {
              const next = seg[j + 1] ?? ' ';
              // O fechamento deve ser seguido por espaço, pontuação ou fim de linha
              if (!/[A-Za-zÀ-ÿ0-9]/.test(next)) {
                end = j;
                break;
              }
            }
          }
          
          if (end > idx + 1) {
            const inner = seg.slice(idx + 1, end);
            out += wrap(inner, 'single');
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
 * Destaca o texto entre aspas com a tag <mark>.
 */
export function highlightQuotes(html: string): string {
  if (!html) return html;
  const cleaned = cleanHtml(html);
  const normalized = normalizeQuotes(cleaned);
  
  return replaceQuoted(normalized, (inner, kind) => {
    const open = kind === 'double' ? '&ldquo;' : '&lsquo;';
    const close = kind === 'double' ? '&rdquo;' : '&rsquo;';
    return `<mark style="background-color: #fef9c3; padding: 0.1em 0.2em; border-radius: 2px;">${open}${inner}${close}</mark>`;
  });
}

/**
 * Versão para PDF: utiliza <span> com display:inline-block para garantir o fundo.
 */
export function highlightQuotesForPdf(html: string): string {
  if (!html) return html;
  const cleaned = cleanHtml(html);
  const normalized = normalizeQuotes(cleaned);

  return replaceQuoted(normalized, (inner, kind) => {
    const open = kind === 'double' ? '&ldquo;' : '&lsquo;';
    const close = kind === 'double' ? '&rdquo;' : '&rsquo;';
    // Estilo otimizado para PDF: garante cobertura 100% sem sobrepor linhas.
    // O uso de em para padding e line-height garante calibração automática com a fonte.
    const style = [
      'background-color: #fef9c3',
      'padding: 0.12em 0.15em',
      'border-radius: 2px',
      'box-decoration-break: clone',
      '-webkit-box-decoration-break: clone',
      'display: inline',
      'line-height: normal',
      'vertical-align: baseline',
      'color: #1a1a1a'
    ].join('; ');
    
    return `<span style="${style}">${open}${inner}${close}</span>`;
  });
}
