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
      const { error } = await supabase
        .from('clients')
        .update({ city: targetCity })
        .eq('id', client.id);

      if (error) throw error;

      toast.success(`Cliente ${client.companyName} transferido para ${targetCity}`);
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
