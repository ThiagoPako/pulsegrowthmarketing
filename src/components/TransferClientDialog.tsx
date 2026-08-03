import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import type { Client } from '@/types';

interface TransferClientDialogProps {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferClientDialog({ client, open, onOpenChange }: TransferClientDialogProps) {
  const { availableCities, activeCity } = useCity();
  const { refetchData } = useApp();
  const [targetCity, setTargetCity] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleTransfer = async () => {
    if (!targetCity) {
      toast.error('Selecione a cidade de destino');
      return;
    }

    setLoading(true);
    try {
      // 1. Verificar conflitos de horários na cidade de destino para as gravações futuras
      const now = new Date().toISOString().split('T')[0];
      
      // Buscar gravações futuras do cliente que será transferido
      const { data: clientFutureRecordings, error: fetchError } = await supabase
        .from('scheduled_recordings')
        .select('*')
        .eq('client_id', client.id)
        .gte('date', now);

      if (fetchError) throw fetchError;

      if (clientFutureRecordings && clientFutureRecordings.length > 0) {
        // Para cada gravação futura, verificar se já existe outra gravação na cidade de destino
        // no mesmo dia, hora e para o mesmo videomaker
        for (const recording of clientFutureRecordings) {
          const { data: conflicts, error: conflictError } = await supabase
            .from('scheduled_recordings')
            .select('id, client_id')
            .eq('city', targetCity)
            .eq('date', recording.date)
            .eq('time', recording.time)
            .eq('videomaker_id', recording.videomaker_id)
            .neq('client_id', client.id); // Ignorar o próprio cliente caso ele já tenha algo lá

          if (conflictError) throw conflictError;

          if (conflicts && conflicts.length > 0) {
            toast.error(`Conflito de horário: O dia ${recording.date} às ${recording.time} já está ocupado na cidade ${targetCity}.`);
            setLoading(false);
            return;
          }
        }
      }

      // 2. Atualizar a cidade do cliente
      const { error: clientError } = await supabase
        .from('clients')
        .update({ city: targetCity })
        .eq('id', client.id);

      if (clientError) throw clientError;

      // 3. Migrar gravações futuras
      const { error: recordingsError } = await supabase
        .from('scheduled_recordings')
        .update({ city: targetCity })
        .eq('client_id', client.id)
        .gte('date', now);

      if (recordingsError) {
        console.error('Erro ao migrar gravações futuras:', recordingsError);
        toast.warning('Cliente transferido, mas houve um erro ao migrar gravações futuras.');
      } else {
        toast.success(`Cliente ${client.companyName} e ${clientFutureRecordings?.length || 0} gravações futuras transferidos com sucesso.`);
      }

      onOpenChange(false);
      refetchData();
    } catch (error: any) {
      console.error('Erro ao transferir cliente:', error);
      toast.error(`Erro na transferência: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Transferir Cliente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">Cliente: {client.companyName}</p>
            <p className="text-xs text-muted-foreground">Cidade atual: {client.city || activeCity}</p>
          </div>

          <div className="space-y-2">
            <Label>Cidade de Destino</Label>
            <Select value={targetCity} onValueChange={setTargetCity}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a cidade" />
              </SelectTrigger>
              <SelectContent>
                {availableCities.filter(c => c !== client.city).map(city => (
                  <SelectItem key={city} value={city}>
                    {city.charAt(0).toUpperCase() + city.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            className="w-full" 
            onClick={handleTransfer} 
            disabled={loading || !targetCity}
          >
            {loading ? 'Transferindo...' : 'Confirmar Transferência'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
