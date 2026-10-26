import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { MessagesSquare, Loader2, PlugZap, QrCode, RefreshCw, Send, Unplug } from 'lucide-react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Connection {
  id: string;
  name: string;
  purposes: string[];
  status: string;
  qr_image: string | null;
  pairing_code: string | null;
  phone: string | null;
  push_name: string | null;
  last_error: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
}

const WAITING = ['conectando', 'reconectando', 'qr', 'codigo'];

function formatPhone(phone: string | null) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}`;
  return `+${d}`;
}

const ago = (value: string | null) => (value ? formatDistanceToNow(new Date(value), { locale: ptBR, addSuffix: false }) : null);

/**
 * Cartão do número do PULSE: mostra se o WhatsApp do assistente está conectado e tem o botão para conectar,
 * reconectar, testar ou desligar. Usa as mesmas rotas da tela de Conexões (/api/whatsapp/connections).
 * A conexão da PULSE é a que tem a função "assistente". Uma conexão sem funções com "pulse" no nome (criada antes
 * pela tela de Conexões) pode ser adotada sem novo QR.
 */
export default function PulseWhatsAppCard({ onChange }: { onChange?: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [engineAlive, setEngineAlive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pairPhone, setPairPhone] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [showTest, setShowTest] = useState(false);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await vpsAuthedFetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Falha na operação');
    return body;
  }, []);

  const load = useCallback(async () => {
    const body = await api('/whatsapp/connections');
    setConnections(body.connections || []);
    setEngineAlive(!!body.engine_alive);
  }, [api]);

  const pulse = useMemo(() => {
    const own = connections.filter((c) => c.purposes.includes('assistente'));
    return own.find((c) => c.status === 'conectada') || own[0] || null;
  }, [connections]);
  const adoptable = useMemo(
    () => (pulse ? null : connections.find((c) => c.purposes.length === 0 && /pulse/i.test(c.name)) || null),
    [connections, pulse],
  );
  const waiting = !!pulse && WAITING.includes(pulse.status);
  const connected = pulse?.status === 'conectada';

  useEffect(() => {
    load().catch((error) => toast.error(error.message)).finally(() => setLoading(false));
  }, [load]);

  // atualiza sozinho enquanto a tela está aberta e a aba do navegador visível (mais rápido enquanto espera o QR)
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load().catch(() => {});
    };
    const timer = window.setInterval(tick, waiting ? 3000 : 8000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [waiting, load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
      onChange?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const connectById = (id: string, byCode: boolean) => api(`/whatsapp/connections/${id}/connect`, {
    method: 'POST',
    body: JSON.stringify(byCode ? { pair_phone: pairPhone.replace(/\D/g, '') } : {}),
  });

  // sem conexão da PULSE: cria "PULSE" só com a função assistente e já pede o QR (ou o código)
  const createAndConnect = (byCode: boolean) => run(async () => {
    const { connection } = await api('/whatsapp/connections', { method: 'POST', body: JSON.stringify({ name: 'PULSE', purposes: ['assistente'] }) });
    await connectById(connection.id, byCode);
    setShowCode(false);
  }, byCode ? 'Código pedido: veja abaixo' : 'Gerando o QR…');

  const reconnect = (byCode: boolean) => run(async () => {
    if (!pulse) return;
    await connectById(pulse.id, byCode);
    setShowCode(false);
  }, byCode ? 'Código pedido: veja abaixo' : 'Conectando…');

  const adopt = () => run(async () => {
    if (!adoptable) return;
    await api(`/whatsapp/connections/${adoptable.id}`, { method: 'PATCH', body: JSON.stringify({ purposes: ['assistente'] }) });
  }, `"${adoptable?.name}" agora é o WhatsApp da PULSE`);

  const codeValid = pairPhone.replace(/\D/g, '').length >= 12;

  const codeForm = (onSubmit: () => void) => (
    <div className="space-y-1.5 rounded-md border border-border p-3">
      <Label className="text-xs">Conectar com código (sem câmera): número do celular da PULSE, com 55 e DDD</Label>
      <div className="flex gap-2">
        <Input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} placeholder="5562999998888" inputMode="numeric" />
        <Button variant="outline" onClick={onSubmit} disabled={busy || !codeValid}>Gerar código</Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Verificando o WhatsApp da PULSE…</CardContent></Card>
    );
  }

  // estado em linguagem simples
  const tone = connected ? 'ok' : waiting || adoptable ? 'wait' : 'off';
  const toneClass = tone === 'ok'
    ? 'border-emerald-500/60 bg-emerald-500/5'
    : tone === 'wait' ? 'border-amber-500/60 bg-amber-500/5' : 'border-red-500/50 bg-red-500/5';
  const headline = !pulse
    ? adoptable ? 'Conexão da PULSE encontrada' : 'Não conectado'
    : connected ? 'Conectado'
      : pulse.status === 'qr' ? 'Aguardando leitura do QR'
        : pulse.status === 'codigo' ? 'Aguardando o código de pareamento'
          : waiting ? 'Conectando…'
            : pulse.status === 'erro' ? 'Com erro' : 'Desconectado';

  return (
    <Card className={`border-2 ${toneClass}`} data-testid="pulse-whatsapp-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <MessagesSquare size={26} className="text-primary" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">WhatsApp da PULSE</p>
            <p className={`text-xl font-semibold ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'wait' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
              <span aria-hidden>{tone === 'ok' ? '🟢' : tone === 'wait' ? '🟡' : '🔴'}</span> {headline}
            </p>
            {connected && pulse && (
              <p className="text-sm text-muted-foreground">
                {formatPhone(pulse.phone)}{pulse.push_name ? ` · ${pulse.push_name}` : ''}
                {pulse.last_seen_at && <> · ativo (último sinal há {ago(pulse.last_seen_at)})</>}
              </p>
            )}
            {!connected && pulse?.last_error && !waiting && <p className="text-sm text-red-600 dark:text-red-400">{pulse.last_error}</p>}
            {!pulse && !adoptable && <p className="text-sm text-muted-foreground">Conecte um número só para o PULSE: a equipe manda os comandos (texto ou áudio) para ele.</p>}
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {!pulse && !adoptable && (
              <Button size="lg" className="w-full sm:w-auto whitespace-normal h-auto min-h-11 py-2" onClick={() => createAndConnect(false)} disabled={busy}>
                {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <PlugZap size={16} className="mr-2" />} Conectar WhatsApp da PULSE
              </Button>
            )}
            {!pulse && adoptable && (
              <Button size="lg" className="w-full sm:w-auto whitespace-normal h-auto min-h-11 py-2" onClick={adopt} disabled={busy}>
                {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <PlugZap size={16} className="mr-2" />} Usar esta conexão para a PULSE
              </Button>
            )}
            {pulse && connected && (
              <>
                <Button variant="outline" onClick={() => setShowTest((v) => !v)} disabled={busy}><Send size={14} className="mr-1" /> Testar envio</Button>
                <Button variant="ghost" onClick={() => run(() => api(`/whatsapp/connections/${pulse.id}/disconnect`, { method: 'POST' }), 'WhatsApp da PULSE desligado')} disabled={busy}>
                  <Unplug size={14} className="mr-1" /> Desconectar
                </Button>
              </>
            )}
            {pulse && waiting && (
              <Button variant="ghost" onClick={() => run(() => api(`/whatsapp/connections/${pulse.id}/disconnect`, { method: 'POST' }), 'Cancelado')} disabled={busy}>Cancelar</Button>
            )}
            {pulse && !connected && !waiting && (
              <Button size="lg" className="w-full sm:w-auto whitespace-normal h-auto min-h-11 py-2" onClick={() => reconnect(false)} disabled={busy}>
                {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />} {pulse.status === 'nova' ? 'Conectar' : 'Reconectar'}
              </Button>
            )}
          </div>
        </div>

        {!engineAlive && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">O processo do WhatsApp (pulse-wa) não está respondendo na VPS: a conexão volta quando ele voltar.</AlertDescription>
          </Alert>
        )}

        {!pulse && adoptable && (
          <p className="text-sm text-muted-foreground">
            Achei a conexão <strong>"{adoptable.name}"</strong> sem nenhuma função{adoptable.status === 'conectada' ? `, já conectada (${formatPhone(adoptable.phone)})` : ''}.
            Usar ela marca só a função <em>assistente</em>, sem criar outra e sem ler o QR de novo.
          </p>
        )}

        {/* QR / código: aparecem na hora, com instruções curtas */}
        {pulse?.status === 'qr' && pulse.qr_image && (
          <div className="flex flex-wrap items-center gap-4 rounded-md bg-background/70 p-3">
            <img src={pulse.qr_image} alt="QR Code do WhatsApp da PULSE" className="h-52 w-52 rounded bg-white p-1" />
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-4">
              <li>No celular do número da PULSE, abra o <strong>WhatsApp</strong>.</li>
              <li>Toque em <strong>Aparelhos conectados → Conectar aparelho</strong>.</li>
              <li>Aponte a câmera para este QR (ele se renova sozinho; vale 3 minutos).</li>
            </ol>
          </div>
        )}
        {pulse?.status === 'codigo' && pulse.pairing_code && (
          <div className="rounded-md bg-background/70 p-3 text-sm text-muted-foreground space-y-1">
            <p>No celular: <strong>WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</strong>, e digite:</p>
            <p className="font-mono text-3xl tracking-widest text-foreground">{pulse.pairing_code.match(/.{1,4}/g)?.join('-')}</p>
          </div>
        )}
        {pulse && waiting && !pulse.qr_image && !pulse.pairing_code && (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Preparando o QR…</p>
        )}

        {/* conectar por código (sem câmera): na criação, na reconexão e enquanto o QR está na tela */}
        {(!connected && (!pulse ? !adoptable : true)) && (
          <div className="space-y-2">
            {!showCode ? (
              <button type="button" className="text-xs text-primary underline-offset-2 hover:underline flex items-center gap-1" onClick={() => setShowCode(true)}>
                <QrCode size={12} /> Sem câmera? Conectar com código pelo número
              </button>
            ) : codeForm(() => (pulse ? reconnect(true) : createAndConnect(true)))}
          </div>
        )}

        {connected && showTest && pulse && (
          <div className="flex gap-2">
            <Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="Seu número, ex.: 62999998888" inputMode="numeric" />
            <Button onClick={() => run(async () => {
              await api(`/whatsapp/connections/${pulse.id}/test`, {
                method: 'POST',
                body: JSON.stringify({ number: testNumber, message: 'Teste do PULSE ✅ Este é o número do assistente da agência.' }),
              });
              setShowTest(false);
            }, 'Teste na fila: chega em alguns segundos')} disabled={busy || testNumber.replace(/\D/g, '').length < 10}>
              <Send size={14} className="mr-1" /> Enviar
            </Button>
          </div>
        )}

        {pulse && (
          <p className="text-[11px] text-muted-foreground">
            ⚠️ Não adicione este número aos grupos dos clientes: ele é só para os comandos da equipe.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
