import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useCity } from '@/contexts/CityContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RefreshCw, ArrowRightLeft, Loader2 } from 'lucide-react';
import type { Client } from '@/types';
import { vpsAuthedFetch } from '@/lib/vpsDb';

function normalizeCityValue(value: string | null | undefined): string | null {
  if (!value) return null;
  // Acentuação e cedilha já são tratados via normalização NFD e regex.
  // IMPORTANTE: O backend agora é soberano na normalização final.
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');
}

interface TransferClientDialogProps {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TransferPreviewRow {
  table: string;
  label: string;
  count: number;
}

interface TransferPreview {
  client: { id: string; name: string };
  from: string;
  to: string;
  same_city: boolean;
  total_records: number;
  tables_affected: number;
  details: TransferPreviewRow[];
}

const CITY_LABELS: Record<string, string> = { minacu: 'Minaçu', uruacu: 'Uruaçu' };

export function TransferClientDialog({ client, open, onOpenChange }: TransferClientDialogProps) {
  const { availableCities, activeCity } = useCity();
  const { refetchData } = useApp();
  const [targetCity, setTargetCity] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [step, setStep] = useState<'security' | 'confirm' | 'validating' | 'preview' | 'preparing' | 'done'>('security');
  const [preview, setPreview] = useState<TransferPreview | null>(null);

  const resetState = () => {
    setStep('confirm');
    setPreview(null);
  };

  const handleValidate = async () => {
    if (!targetCity) {
      toast.error('Selecione a cidade de destino');
      return;
    }
    setIsBusy(true);
    setStep('validating');
    try {
      // Normalização idêntica à do CRM para consistência absoluta
      const normalizedCity = targetCity.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');
      // Passar a cidade normalizada via query E via header manual para garantir que o backend receba o contexto
      const res = await vpsAuthedFetch(
        `/api/clients/${client.id}/transfer-preview?city=${encodeURIComponent(normalizedCity)}`,
        {
          headers: {
            'x-pulse-city': normalizedCity
          }
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao validar a transferência');
      }
      const data: TransferPreview = await res.json();
      setPreview(data);
      setStep('preview');
    } catch (error: any) {
      toast.error(error.message);
      setStep('confirm');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTransfer = async () => {
    setIsBusy(true);
    setStep('preparing');
    try {
      const res = await vpsAuthedFetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        body: JSON.stringify({ city: targetCity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao transferir cliente');
      }

      setStep('done');
      toast.success(`Cliente ${client.companyName} transferido para ${targetCity} com sucesso!`);
      setTimeout(() => {
        onOpenChange(false);
        refetchData();
        resetState();
      }, 1500);
    } catch (error: any) {
      toast.error(error.message);
      setStep('preview');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(val) => {
        onOpenChange(val);
        if (!val) resetState();
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <ArrowRightLeft className="w-5 h-5" />
            Transferência de Cidade
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {step === 'confirm' && (
            <>
              <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-800 space-y-2">
                <p className="font-medium">Cliente: {client.companyName}</p>
                <p>Ao transferir este cliente, todos os dados vinculados (histórico, tarefas, roteiros, financeiro, gravações) serão movidos para a nova cidade.</p>
              </div>

              <div className="space-y-2">
                <Label>Cidade de Destino</Label>
                <Select value={targetCity} onValueChange={setTargetCity}>
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue placeholder="Selecione a cidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCities.filter(c => normalizeCityValue(c) !== normalizeCityValue(client.city || activeCity)).map(city => (
                      <SelectItem key={city} value={city}>
                        {city.charAt(0).toUpperCase() + city.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>Cancelar</Button>
                <Button 
                  className="bg-orange-500 hover:bg-orange-600 text-white" 
                  onClick={handleValidate}
                  disabled={isBusy || !targetCity}
                >
                  Validar transferência
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'validating' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
              <div className="text-center space-y-1">
                <p className="font-bold">Analisando registros...</p>
                <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="flex items-center justify-center gap-3 text-sm font-bold">
                <Badge variant="outline">{CITY_LABELS[preview.from.toLowerCase()] || preview.from}</Badge>
                <ArrowRightLeft className="h-4 w-4 text-orange-500" />
                <Badge className="bg-orange-500 text-white border-none">{CITY_LABELS[preview.to.toLowerCase()] || preview.to}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-muted/40 text-center">
                  <p className="text-2xl font-bold text-orange-500">{preview.total_records}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Registros afetados</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/40 text-center">
                  <p className="text-2xl font-bold text-orange-500">{preview.tables_affected}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Módulos envolvidos</p>
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
                {preview.details.map((row) => (
                  <div key={row.table} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-medium">{row.label}</span>
                    <Badge variant="secondary" className="text-[10px]">{row.count}</Badge>
                  </div>
                ))}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={resetState} disabled={isBusy}>Voltar</Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleTransfer}
                  disabled={isBusy}
                >
                  Confirmar transferência
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'preparing' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
              <div className="text-center space-y-1">
                <p className="font-bold">Organizando dados...</p>
                <p className="text-xs text-muted-foreground">Movendo registros para {targetCity}</p>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Badge className="bg-green-500 text-white border-none">OK</Badge>
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-green-600">Concluído!</p>
                <p className="text-xs text-muted-foreground">O cliente foi movido com sucesso.</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}