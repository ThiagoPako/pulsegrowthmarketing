import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Apple, CheckCircle2, Copy, Download, Loader2, Monitor, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const API_BASE = 'https://agenciapulse.tech/api';

type Os = 'windows' | 'mac';

interface LinkData {
  client_name: string;
  logo_url: string | null;
  current_image_url: string | null;
  devices: number;
  agent_interval_min: number;
}

function detectOs(): Os {
  const ua = navigator.userAgent;
  return /Mac|iPhone|iPad/i.test(ua) && !/Windows/i.test(ua) ? 'mac' : 'windows';
}

function CommandBox({ command }: { command: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success('Comando copiado');
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie à mão.');
    }
  };
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-xs">{command}</code>
      <Button variant="outline" onClick={copy} className="shrink-0"><Copy className="mr-1.5 h-4 w-4" />Copiar</Button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5 text-sm">{children}</div>
    </li>
  );
}

/**
 * Página pública do link do Wallpaper. O cliente abre em cada computador da empresa e instala o
 * agente (Windows: arquivo .bat ou comando no PowerShell; Mac: comando no Terminal).
 */
export default function WallpaperConnect() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [os, setOs] = useState<Os>(detectOs);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/wallpaper/public/${token}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || 'Link inválido.');
        setData(body as LinkData);
      })
      .catch((err) => setError((err as Error).message));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="font-semibold">Não foi possível abrir este link</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const installBase = `${API_BASE}/wallpaper/install/${token}`;
  const winCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '${installBase}/windows' | iex"`;
  const macCommand = `curl -fsSL '${installBase}/mac' | bash`;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex items-center gap-3">
          {data.logo_url && <img src={data.logo_url} alt="" className="h-12 w-12 rounded-lg border border-border bg-white object-contain" />}
          <div>
            <h1 className="text-xl font-bold">Papel de parede da {data.client_name}</h1>
            <p className="text-sm text-muted-foreground">Conecte este computador uma vez. Depois o papel de parede se atualiza sozinho.</p>
          </div>
        </header>

        {data.current_image_url && (
          <img src={data.current_image_url} alt="Papel de parede atual" className="aspect-video w-full rounded-xl border border-border object-cover shadow-sm" />
        )}

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1">
          {([['windows', 'Windows', Monitor], ['mac', 'Mac', Apple]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOs(key)}
              className={cn('flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors',
                os === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {os === 'windows' ? (
            <ol className="space-y-5">
              <Step n={1}>
                <p className="font-medium">Baixe o instalador</p>
                <Button asChild><a href={`${installBase}/windows-bat`}><Download className="mr-1.5 h-4 w-4" />Baixar Instalar-Wallpaper.bat</a></Button>
                <p className="text-muted-foreground">Se o navegador avisar sobre o arquivo, escolha <b>Manter</b>.</p>
              </Step>
              <Step n={2}>
                <p className="font-medium">Abra o arquivo baixado</p>
                <p className="text-muted-foreground">
                  Se o Windows mostrar “O Windows protegeu o computador”, clique em <b>Mais informações</b> e depois em <b>Executar assim mesmo</b>.
                  Não precisa de senha de administrador.
                </p>
              </Step>
              <Step n={3}>
                <p className="font-medium">Pronto</p>
                <p className="text-muted-foreground">Quando aparecer “Pronto! Este computador está conectado”, pode fechar a janela.</p>
              </Step>
              <li className="border-t border-border pt-4 text-sm">
                <p className="mb-2 text-muted-foreground">Se o download for bloqueado: abra o <b>PowerShell</b> (menu Iniciar → digite PowerShell), cole o comando abaixo e aperte Enter.</p>
                <CommandBox command={winCommand} />
              </li>
            </ol>
          ) : (
            <ol className="space-y-5">
              <Step n={1}>
                <p className="font-medium">Abra o Terminal</p>
                <p className="text-muted-foreground">Aperte <b>Command + Espaço</b>, digite <b>Terminal</b> e aperte Enter.</p>
              </Step>
              <Step n={2}>
                <p className="font-medium">Cole este comando e aperte Enter</p>
                <CommandBox command={macCommand} />
              </Step>
              <Step n={3}>
                <p className="font-medium">Permita a troca do fundo</p>
                <p className="text-muted-foreground">
                  Se o Mac perguntar se o Terminal ou “osascript” pode controlar o <b>System Events</b>, clique em <b>OK</b>.
                  Quando aparecer “Pronto! Este Mac está conectado”, pode fechar o Terminal.
                </p>
              </Step>
            </ol>
          )}
        </section>

        <div className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <p>
            O programa só troca o papel de parede. Ele não lê arquivos, não vê a tela e não pede senha. Confere a cada {data.agent_interval_min} minutos
            se há papel de parede novo e é removido sozinho quando a agência desconecta o computador.
          </p>
        </div>

        {data.devices > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />{data.devices} computador(es) já conectado(s)
          </p>
        )}
      </div>
    </div>
  );
}
