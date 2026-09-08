import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

interface DeletionRequest {
  confirmation_code: string;
  kind: string;
  status: string;
  accounts_removed: number;
  created_at: string;
}

const API_BASE = 'https://agenciapulse.tech/api';

/**
 * Página pública exigida pela Meta (Data Deletion Instructions URL).
 * Se receber ?code=..., consulta o status da solicitação registrada pelo callback.
 */
export default function DataDeletion() {
  const [params] = useSearchParams();
  const code = params.get('code');
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/meta/deletion-status/${encodeURIComponent(code)}`)
      .then(async res => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Não foi possível consultar o código.');
        return json;
      })
      .then(json => { if (!cancelled) setRequest(json.request as DeletionRequest); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <LegalLayout
      title="Exclusão de Dados"
      subtitle="Como solicitar a remoção dos seus dados do sistema Pulse HUB."
    >
      {code && (
        <div className="rounded-lg border border-border p-4 bg-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Status da solicitação</p>
          {loading && (
            <p className="mt-2 flex items-center gap-2 text-foreground"><Loader2 size={16} className="animate-spin" /> Consultando…</p>
          )}
          {error && (
            <p className="mt-2 flex items-center gap-2 text-destructive"><AlertTriangle size={16} /> {error}</p>
          )}
          {request && (
            <div className="mt-2 space-y-1">
              <p className="flex items-center gap-2 text-foreground">
                <CheckCircle2 size={16} className="text-primary" />
                Solicitação concluída — dados removidos.
              </p>
              <p>Código de confirmação: <strong className="font-mono">{request.confirmation_code}</strong></p>
              <p>Vínculos de conta removidos: <strong>{request.accounts_removed}</strong></p>
              <p>Registrada em: <strong>{new Date(request.created_at).toLocaleString('pt-BR')}</strong></p>
            </div>
          )}
        </div>
      )}

      <h2>1. Exclusão pelo Facebook ou Instagram</h2>
      <p>
        Se você conectou sua conta ao aplicativo <strong>Pulse HUB</strong>, pode remover a autorização e pedir a
        exclusão dos dados diretamente pela Meta:
      </p>
      <ul>
        <li>Abra <strong>Configurações da conta</strong> no Facebook ou Instagram.</li>
        <li>Vá em <strong>Aplicativos e sites</strong> (ou “Apps e sites”).</li>
        <li>Localize <strong>Pulse HUB</strong> e clique em <strong>Remover</strong>.</li>
        <li>Ao remover, nosso servidor recebe a notificação e apaga automaticamente os tokens e vínculos da sua conta, devolvendo um código de confirmação consultável nesta página.</li>
      </ul>

      <h2>2. Exclusão por solicitação direta</h2>
      <p>
        Você também pode escrever para <strong>contato@agenciapulse.tech</strong> com o assunto
        “Exclusão de dados”, informando o nome da conta ou da empresa. Respondemos em até <strong>7 dias úteis</strong>
        e concluímos a exclusão em até <strong>30 dias</strong>.
      </p>

      <h2>3. O que é excluído</h2>
      <ul>
        <li>Tokens de acesso e vínculos com contas do Facebook e do Instagram.</li>
        <li>Identificadores de Página e de conta profissional do Instagram.</li>
        <li>Agendamentos de postagem pendentes associados à conta.</li>
      </ul>
      <p>
        Registros contábeis e fiscais exigidos por lei podem ser mantidos pelo prazo legal, sem qualquer dado
        proveniente das APIs da Meta.
      </p>
    </LegalLayout>
  );
}
