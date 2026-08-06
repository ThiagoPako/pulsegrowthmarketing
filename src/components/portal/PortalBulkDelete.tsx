import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2, Calendar } from 'lucide-react';
import { portalAction } from '@/lib/portalApi';
import { toast } from 'sonner';

interface VideoMonth {
  season_year: number;
  season_month: number;
}

export default function PortalBulkDelete({ clientId }: { clientId?: string }) {
  const [months, setMonths] = useState<VideoMonth[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadMonths = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://agenciapulse.tech/api/portal-videos/months');
      const data = await res.json();
      if (data.months) setMonths(data.months);
    } catch (err) {
      console.error('Erro ao carregar meses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonths();
  }, []);

  const handleDelete = async () => {
    if (selectedMonths.length === 0) {
      toast.error('Selecione ao menos um mês para deletar');
      return;
    }

    if (!confirm(`Tem certeza que deseja deletar os vídeos de ${selectedMonths.length} mês(es)? Esta ação é irreversível.`)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch('https://agenciapulse.tech/api/portal-videos/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          months: selectedMonths,
          clientId: clientId || null,
          allClients: !clientId
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`${data.deletedCount} vídeos deletados com sucesso!`);
        setSelectedMonths([]);
        loadMonths();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast.error('Erro ao deletar vídeos: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleMonth = (m: string) => {
    setSelectedMonths(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  return (
    <div className="space-y-4 p-4 border border-border rounded-xl bg-card">
      <div className="flex items-center gap-2 text-primary font-semibold">
        <Trash2 size={18} />
        <h3>Limpeza de Vídeos do Portal</h3>
      </div>
      
      <p className="text-xs text-muted-foreground">
        Selecione os meses dos vídeos que deseja remover permanentemente do sistema para liberar espaço.
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {months.map(m => {
            const val = `${m.season_year}-${m.season_month.toString().padStart(2, '0')}`;
            const label = `${m.season_month.toString().padStart(2, '0')}/${m.season_year}`;
            return (
              <div key={val} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <Checkbox 
                  id={`month-${val}`} 
                  checked={selectedMonths.includes(val)}
                  onCheckedChange={() => toggleMonth(val)}
                />
                <Label htmlFor={`month-${val}`} className="text-xs cursor-pointer">{label}</Label>
              </div>
            );
          })}
        </div>
      )}

      {months.length === 0 && !loading && (
        <p className="text-center py-4 text-xs text-muted-foreground">Nenhum vídeo encontrado para limpeza.</p>
      )}

      <Button 
        variant="destructive" 
        className="w-full gap-2" 
        disabled={selectedMonths.length === 0 || deleting}
        onClick={handleDelete}
      >
        {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
        {deleting ? 'Deletando...' : `Deletar Vídeos Selecionados (${selectedMonths.length})`}
      </Button>
    </div>
  );
}