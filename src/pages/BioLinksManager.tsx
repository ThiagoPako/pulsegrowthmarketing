import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Edit2, Link2, Share2, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { vpsAuthedFetch, supabase } from '@/lib/vpsDb';
import { useCity } from '@/contexts/CityContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function BioLinksManager() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingPro] = useState<any>(null);
  const { activeCity } = useCity();
  const [clients, setClients] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    client_id: '',
    slug: '',
    title: '',
    description: '',
    logo_url: ''
  });

  async function load() {
    setLoading(true);
    try {
      const res = await vpsAuthedFetch('/api/client_bio_links', {
        headers: { 'x-pulse-city': activeCity || 'minacu' }
      });
      const data = await res.json();
      setLinks(data.data || []);
      
      const { data: clientsData } = await supabase.from('clients').select('id, company_name');
      setClients(clientsData || []);
    } catch (e) {
      toast.error('Erro ao carregar links');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [activeCity]);

  async function handleSave() {
    if (!formData.client_id || !formData.slug) return toast.error('Preencha os campos obrigatórios');
    try {
      const res = await vpsAuthedFetch('/api/client_bio_links', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upsert',
          table: 'client_bio_links',
          data: { ...formData, city: activeCity || 'minacu' }
        })
      });
      if (res.ok) {
        toast.success('Bio salva com sucesso!');
        setDialogOpen(false);
        load();
      }
    } catch (e) {
      toast.error('Erro ao salvar');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Módulo Link Bio</h1>
          <p className="text-sm text-muted-foreground">Gerencie as árvores de links dos seus clientes</p>
        </div>
        <Button onClick={() => { setFormData({ client_id: '', slug: '', title: '', description: '', logo_url: '' }); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Criar Bio
        </Button>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map(l => (
            <Card key={l.id} className="p-4 space-y-3 relative group">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="font-semibold">{l.title || 'Sem título'}</h3>
                  <p className="text-xs font-mono text-primary">/bio/{l.slug}</p>
                </div>
                <Badge variant="secondary">{clients.find(c => c.id === l.client_id)?.company_name}</Badge>
              </div>
              
              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => window.open(`/bio/${l.slug}`, '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Ver
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/bio/${l.slug}`);
                  toast.success('Link copiado!');
                }}>
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configurar Link Bio</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={formData.client_id} onValueChange={(v) => setFormData({...formData, client_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Slug Único (URL)</Label>
              <Input placeholder="ex: agenciapulse" value={formData.slug} onChange={e => setFormData({...formData, slug: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Título da Página</Label>
              <Input placeholder="ex: Pulse Growth Marketing" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Descrição / Bio</Label>
              <Textarea placeholder="Uma breve descrição..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar Bio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}