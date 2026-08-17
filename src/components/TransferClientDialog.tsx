import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useCity } from '@/contexts/CityContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RefreshCw, ArrowRightLeft, Loader2, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Client } from '@/types';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { normalizeCityValue, buildTransferPreviewRequest } from '@/lib/cityScope';


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
  const [transferProgress, setTransferProgress] = useState(0);
  const [step, setStep] = useState<'security' | 'confirm' | 'validating' | 'preview' | 'preparing' | 'done'>('security');
  const [preview, setPreview] = useState<TransferPreview | null>(null);

  const resetState = () => {
    setStep('security');
    setPreview(null);
    setTransferProgress(0);
  };

  const handleValidate = async () => {
    if (!targetCity) {
      toast.error('Selecione a cidade de destino');
      return;
    }
    setIsBusy(true);
    setStep('validating');
    try {
      const normalizedCity = targetCity.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');
      // The city validation error in the preview endpoint is often due to missing 'city' param 
      // or rigid validation against a header that might be outdated. 
      // We pass the city BOTH in the query param and the header for maximum compatibility.
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
      const progressInterval = setInterval(() => {
        setTransferProgress(prev => (prev < 90 ? prev + 5 : prev));
      }, 300);

      const res = await vpsAuthedFetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        body: JSON.stringify({ city: targetCity }),
      });

      clearInterval(progressInterval);
      setTransferProgress(100);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao transferir cliente');
      }

      setTimeout(() => {
        setStep('done');
        toast.success(`Cliente ${client.companyName} transferido para ${targetCity} com sucesso!`);
        setTimeout(() => {
          onOpenChange(false);
          refetchData();
          resetState();
        }, 2000);
      }, 500);
    } catch (error: any) {
      toast.error(error.message);
      setStep('preview');
      setTransferProgress(0);
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
          <div className="flex items-center justify-between mb-6 px-2">
            {[
              { id: 'security', icon: ShieldCheck },
              { id: 'validating', icon: RefreshCw },
              { id: 'preview', icon: CheckCircle2 },
              { id: 'preparing', icon: Loader2 }
            ].map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.id || (step === 'confirm' && s.id === 'security') || (step === 'done' && s.id === 'preparing');
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center transition-colors
                    ${isActive ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'}
                  `}>
                    <Icon className={`w-4 h-4 ${isActive && s.id === 'preparing' ? 'animate-spin' : ''}`} />
                  </div>
                  {i < 3 && (
                    <div className={`h-[2px] flex-1 mx-2 ${isActive ? 'bg-orange-200' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {step === 'security' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                <ShieldCheck className="w-8 h-8 text-blue-500 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold text-blue-900">Segurança de Dados</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Para garantir a integridade da transferência, o sistema irá preparar todos os registros vinculados ao cliente <strong>{client.companyName}</strong>. 
                    Esta ação é segura, mas requer confirmação de que os dados estão prontos.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Contexto Atual</Label>
                <div className="p-3 bg-muted/50 rounded-md text-xs font-medium">
                  Cidade de Origem: {CITY_LABELS[(client.city || activeCity).toLowerCase()] || client.city || activeCity}
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button 
                  className="bg-orange-500 hover:bg-orange-600 text-white gap-2" 
                  onClick={() => setStep('confirm')}
                >
                  Preparar Dados <ArrowRightLeft className="w-4 h-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg flex gap-3">
                <AlertTriangle className="w-8 h-8 text-orange-500 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold text-orange-900">Destino da Transferência</p>
                  <p className="text-xs text-orange-700">
                    Selecione para qual cidade deseja mover o cliente e todos os seus <strong>roteiros, gravações e tarefas</strong>.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cidade de Destino</Label>
                <Select value={targetCity} onValueChange={setTargetCity}>
                  <SelectTrigger className="bg-muted/50 h-12">
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
                <Button variant="ghost" onClick={() => setStep('security')}>Voltar</Button>
                <Button 
                  className="bg-orange-500 hover:bg-orange-600 text-white flex-1" 
                  onClick={handleValidate}
                  disabled={isBusy || !targetCity}
                >
                  Liberar Validação
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 'validating' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in zoom-in-95 duration-300">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500/20 rounded-full animate-ping" />
                <Loader2 className="h-12 w-12 text-orange-500 animate-spin relative" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-lg">Validando Checklist...</p>
                <p className="text-sm text-muted-foreground italic">Mapeando vínculos e dependências</p>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center justify-center gap-4 bg-muted/30 p-4 rounded-xl border border-dashed">
                <div className="text-center">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold mb-1">DE</p>
                  <Badge variant="outline" className="px-3 py-1">{CITY_LABELS[preview.from.toLowerCase()] || preview.from}</Badge>
                </div>
                <ArrowRightLeft className="h-5 w-5 text-orange-500 animate-pulse" />
                <div className="text-center">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold mb-1">PARA</p>
                  <Badge className="bg-orange-500 text-white border-none px-3 py-1">{CITY_LABELS[preview.to.toLowerCase()] || preview.to}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-gradient-to-br from-white to-orange-50/30 text-center shadow-sm">
                  <p className="text-3xl font-black text-orange-600 leading-none">{preview.total_records}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mt-2">Registros Totais</p>
                </div>
                <div className="p-4 rounded-xl border bg-gradient-to-br from-white to-blue-50/30 text-center shadow-sm">
                  <p className="text-3xl font-black text-blue-600 leading-none">{preview.tables_affected}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mt-2">Módulos Sincronizados</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Checklist de Transferência</Label>
                <div className="max-h-48 overflow-y-auto rounded-xl border bg-white divide-y shadow-inner">
                  {preview.details.map((row) => (
                    <div key={row.table} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-orange-50/20 transition-colors">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="font-medium text-slate-700">{row.label}</span>
                      </div>
                      <Badge variant="secondary" className="font-mono bg-slate-100">{row.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button variant="ghost" onClick={() => setStep('confirm')} disabled={isBusy}>Alterar Destino</Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white flex-1 font-bold h-12 shadow-lg shadow-orange-200"
                  onClick={handleTransfer}
                  disabled={isBusy}
                >
                  Clique para Transferir
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 'preparing' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-6 animate-in fade-in duration-300">
              <div className="w-full max-w-[280px] space-y-3">
                <div className="flex justify-between text-xs font-bold uppercase tracking-tighter text-orange-600">
                  <span>Processando Migração</span>
                  <span>{transferProgress}%</span>
                </div>
                <Progress value={transferProgress} className="h-3 bg-orange-100" />
              </div>
              
              <div className="text-center space-y-1">
                <p className="font-black text-slate-800 text-xl">Organizando dados...</p>
                <p className="text-sm text-muted-foreground animate-pulse">
                  Movendo {client.companyName} para {targetCity}
                </p>
              </div>

              <div className="p-3 bg-slate-50 border rounded-lg w-full text-[10px] text-slate-500 font-mono flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                UPDATE clients SET city = '{targetCity}' WHERE id = '{client.id}';
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6 animate-in zoom-in-95 duration-500">
              <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center border-4 border-green-50 shadow-xl">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-slate-900">Transferência Concluída!</h3>
                <p className="text-muted-foreground max-w-[280px] mx-auto text-sm">
                  O cliente e todos os seus registros agora pertencem à unidade de <strong>{targetCity}</strong>.
                </p>
              </div>
              <div className="w-full bg-green-50 p-3 rounded-lg border border-green-100 text-center">
                <span className="text-[10px] uppercase font-bold text-green-700">O sistema será atualizado automaticamente</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
