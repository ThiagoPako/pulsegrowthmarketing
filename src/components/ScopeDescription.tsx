import ReactMarkdown from 'react-markdown';

interface ScopeDescriptionProps {
  text: string;
  accentColor?: string;
  compact?: boolean;
}

/**
 * Normaliza textos de escopo que vêm como markdown em uma linha só
 * (ex.: "...vendas. ## 1. Produção ... * Planejamento. * Edição.")
 * Garante quebras de linha antes de cabeçalhos (#, ##, ###) e bullets (*).
 */
function normalizeMarkdown(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n').trim();

  // Quebrar antes de "## N." / "# " / "### " se não estiverem no começo da linha
  text = text.replace(/\s*(#{1,4})\s+/g, (_m, hashes) => `\n\n${hashes} `);

  // Quebrar antes de bullets "* " (mantendo asteriscos de ênfase **bold** intactos)
  text = text.replace(/\s+\*\s+(?!\*)/g, '\n* ');

  // Limpa múltiplas linhas em branco
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

export default function ScopeDescription({ text, accentColor = 'hsl(16 82% 51%)', compact = false }: ScopeDescriptionProps) {
  const normalized = normalizeMarkdown(text);
  if (!normalized) return null;

  const baseText = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`prose prose-sm max-w-none ${baseText} text-gray-700 bg-gray-50 rounded-xl p-4 sm:p-5 leading-relaxed`}
      style={{ ['--tw-prose-bullets' as any]: accentColor }}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mt-4 mb-2 first:mt-0 pb-1 border-b" style={{ borderColor: accentColor }}>
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="text-sm sm:text-base font-bold text-gray-900 mt-4 mb-1.5 first:mt-0 flex items-start gap-2">
              <span className="inline-block w-1 h-4 rounded mt-0.5 shrink-0" style={{ background: accentColor }} />
              <span>{children}</span>
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-sm font-semibold text-gray-800 mt-3 mb-1 first:mt-0">{children}</h4>
          ),
          p: ({ children }) => <p className="text-gray-700 mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-none pl-0 my-2 space-y-1">{children}</ul>,
          li: ({ children }) => (
            <li className="flex items-start gap-2 text-gray-700">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />
              <span className="flex-1">{children}</span>
            </li>
          ),
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
