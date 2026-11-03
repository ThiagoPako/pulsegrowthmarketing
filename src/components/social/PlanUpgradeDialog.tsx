import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Gift, Loader2, Receipt, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

// Upgrade do plano ao marcar uma rede nova no cadastro do cliente (pedido do usuário, 03/11/2026): o valor mensal do
// upgrade vai ao contrato, e a próxima fatura em aberto ganha só os dias até o vencimento (vps-api-server/lib/planAddons.mjs).

interface Preview { nextDue: string; days: number; cycleDays: number; amount: number; monthly: number; contract_value: number; new_contract_value: number; pix_auto: { valor: number } | null }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string) => d.split('-').reverse().join('/');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export default function PlanUpgradeDialog({ clientId, network, onClose, onDone }: {
  clientId: string;
  network: { id: string; label: string } | null;
  onClose: () => void;
  /** novo valor do contrato (o formulário do cadastro não pode gravar o antigo por cima) */
  onDone: (newContractValue: number | null) => void;
}) {
  const [mode, setMode] = useState<'proporcional' | 'cortesia'>('proporcional');
  const [value, setValue] = useState('');
  const [start, setStart] = useState(today());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const monthly = Number(value.replace(/\./g, '').replace(',', '.')) || 0;

  useEffect(() => { if (network) { setMode('proporcional'); setValue(''); setStart(today()); setPreview(null); setPreviewError(null); } }, [network]);

  // prévia ao vivo do que entra na fatura (espera parar de digitar)
  useEffect(() => {
    if (!network || mode !== 'proporcional' || !(monthly > 0)) { setPreview(null); return; }
    const t = setTimeout(async () => {
      const { data, error } = await invokeVpsFunction(`clients/${clientId}/plan-addons/preview`, { body: { monthly, start_date: start } });
      if (error || data?.error) { setPreview(null); setPreviewError(data?.error || error?.message || 'Não deu para calcular'); return; }
      setPreviewError(null);
      setPreview(data as Preview);
    }, 350);
    return () => clearTimeout(t);
  }, [clientId, network, mode, monthly, start]);

  const save = async () => {
    if (!network) return;
    setSaving(true);
    const { data, error } = await invokeVpsFunction(`clients/${clientId}/plan-addons`, { body: { network: network.id, monthly, start_date: start, charge: mode } });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Não deu para salvar o upgrade'); return; }
    toast.success(mode === 'cortesia'
      ? `${network.label} entrou no plano sem cobrança`
      : `${network.label} entrou no plano: +${brl(monthly)}/mês, ${brl(data.amount)} (${data.days} dias) na fatura de ${br(data.nextDue)}`);
    onDone(typeof data?.new_contract_value === 'number' ? data.new_contract_value : null);
  };

  return (
    <Dialog open={!!network} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TrendingUp size={18} className="text-primary" /> Upgrade do plano · {network?.label}</DialogTitle>
          <DialogDescription>Esta rede não estava no plano do cliente. Como fica a cobrança?</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cobrança do upgrade">
          {([
            { v: 'proporcional', icon: Receipt, t: 'Cobrar upgrade', d: 'Valor mensal, proporcional no 1º mês' },
            { v: 'cortesia', icon: Gift, t: 'Sem cobrança', d: 'Já estava combinado ou é cortesia' },
          ] as const).map(({ v, icon: Icon, t, d }) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mode === v}
              onClick={() => setMode(v)}
              className={cn('rounded-xl border p-3 text-left transition-colors', mode === v ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}
            >
              <Icon size={16} className={mode === v ? 'text-primary' : 'text-muted-foreground'} />
              <p className="mt-1.5 text-sm font-semibold">{t}</p>
              <p className="text-[11px] text-muted-foreground">{d}</p>
            </button>
          ))}
        </div>

        {mode === 'proporcional' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs font-medium">Valor mensal do upgrade</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <Input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0,00" className="pl-8" />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium">Começou em</span>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
            </div>

            {previewError && <p className="text-xs text-destructive">{previewError}</p>}
            {preview && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <CalendarClock size={15} className="mt-0.5 shrink-0 text-primary" />
                  <p>
                    Na fatura de <b>{br(preview.nextDue)}</b>: + <b>{brl(preview.amount)}</b>
                    <span className="text-muted-foreground"> ({preview.days} de {preview.cycleDays} dias)</span>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Receipt size={15} className="mt-0.5 shrink-0 text-primary" />
                  <p>Depois: <b>{brl(preview.new_contract_value)}</b> por mês <span className="text-muted-foreground">(era {brl(preview.contract_value)})</span></p>
                </div>
                <p className="text-[11px] text-muted-foreground">Nada é cobrado antes do vencimento: só muda o valor da fatura que já ia sair.</p>
                {preview.pix_auto && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    O cliente paga por Pix Automático autorizado em {brl(preview.pix_auto.valor)}. Se a fatura nova passar desse valor, o banco pode recusar: peça nova autorização.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || (mode === 'proporcional' && (!(monthly > 0) || !preview))} className="gap-1.5">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {mode === 'cortesia' ? 'Adicionar sem cobrança' : 'Confirmar upgrade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
