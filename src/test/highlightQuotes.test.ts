import { describe, it, expect } from 'vitest';
import { highlightQuotes, highlightQuotesForPdf, sanitizeScriptHtml, plainTextToScriptHtml, scriptHtmlToPlainText } from '@/lib/highlightQuotes';

describe('roteiro: HTML seguro na tela da equipe', () => {
  it('tira handlers e scripts e mantém o destaque das aspas', () => {
    const html = highlightQuotes('<p>Fala "oi" <img src=x onerror="alert(1)"><script>alert(2)</script></p>');
    expect(html).not.toMatch(/onerror|<script/i);
    expect(html).toContain('<mark');
    expect(html).toContain('background-color');
  });

  it('não deixa a normalização de &quot; reabrir um atributo', () => {
    const html = highlightQuotes('<p title="x&quot; onmouseover=&quot;alert(1)">texto</p>');
    expect(html).not.toMatch(/onmouseover/i);
  });

  it('PDF também sai sanitizado', () => {
    const html = highlightQuotesForPdf('<p>"oi"<a href="javascript:alert(1)">x</a></p>');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('<span');
  });

  it('sanitizeScriptHtml remove handlers de HTML cru', () => {
    expect(sanitizeScriptHtml('<img src=x onerror=alert(1)>')).not.toMatch(/onerror/i);
  });

  it('texto do portal vira <p> escapado e volta igual', () => {
    const html = plainTextToScriptHtml('preço < 100 & "bom"\n<b>x</b>');
    expect(html).toBe('<p>preço &lt; 100 &amp; "bom"</p><p>&lt;b&gt;x&lt;/b&gt;</p>');
    expect(scriptHtmlToPlainText(html)).toBe('preço < 100 & "bom"<b>x</b>');
  });
});
