import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Edit2, Link2, Smartphone, MapPin, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { useCity } from '@/contexts/CityContext';

export default function BioLinksManager() {
  const [links, setLinks] = useState<any[]>([]);
  const { activeCity } = useCity();

  async function load() {
    try {
      const res = await vpsAuthedFetch('/api/client_bio_links', {
        headers: { 'x-pulse-city': activeCity || 'minacu' }
      });
      const data = await res.json();
      setLinks(data.data || []);
    } catch (e) {
      toast.error('Erro ao carregar links');
    }
  }

  useEffect(() => { load(); }, [activeCity]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Módulo Link Bio</h1>
        <Button><Plus className="mr-2 h-4 w-4" /> Criar Bio</Button>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map(l => (
          <Card key={l.id} className="p-4 space-y-3">
            <h3 className="font-semibold">{l.title}</h3>
            <p className="text-sm text-muted-foreground truncate">{l.slug}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline"><Edit2 className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}