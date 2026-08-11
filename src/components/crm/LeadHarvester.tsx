import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vpsAuthedFetch, supabase } from '@/lib/vpsDb';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Briefcase, DollarSign, UserPlus, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Company {
  id: string;
  razao_social: string;
  contato: string;
  email: string;
  telefone: string;
  atuacao: string;
  endereco: string;
  capital_social: number;
  cidade: string;
}

export function LeadHarvester() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [city, setCity] = useState('all');
  const [niche, setNiche] = useState('');
  const [minCapital, setMinCapital] = useState('');

  const { data: companies = [], isLoading, refetch } = useQuery({
    queryKey: ['lead_harvest', city, niche, minCapital],
    queryFn: async () => {
      const res = await vpsAuthedFetch('/crm/harvest/search', {
        method: 'POST',
        body: JSON.stringify({ city, niche, min_capital: minCapital })
      });
      const result = await res.json();
      return result.data as Company[];
    },
    enabled: false
  });

  const addLead = useMutation({
    mutationFn: async (company: Company) => {
      if (!user?.id) throw new Error('Sessão expirada');

      const { error } = await supabase.from('crm_leads').insert([{
        name: company.contato,
        company: company.razao_social,
        email: company.email,
        phone: company.telefone,
        description: `Endereço: ${company.endereco}\nAtuação: ${company.atuacao}\nCapital Social: R$ ${company.capital_social.toLocaleString()}`,
        city: company.cidade,
        status: 'lead',
        source_tag: 'colheita',
        user_id: user.id
      }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      toast.success('Empresa adicionada ao CRM como novo lead!');
    },
    onError: (err: any) => {
      toast.error('Erro ao adicionar lead: ' + err.message);
    }
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refetch();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/50 border-none shadow-sm">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Cidades</SelectItem>
                <SelectItem value="Minaçu">Minaçu</SelectItem>
                <SelectItem value="Uruaçu">Uruaçu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nicho / Atuação</Label>
            <Input 
              placeholder="Ex: Saúde, Varejo..." 
              value={niche} 
              onChange={(e) => setNiche(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Capital Social Mínimo (R$)</Label>
            <Input 
              type="number" 
              placeholder="1000" 
              value={minCapital} 
              onChange={(e) => setMinCapital(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full gap-2 h-10" disabled={isLoading}>
            <Search className="h-4 w-4" />
            {isLoading ? 'Buscando...' : 'Colher Leads'}
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => (
          <Card key={company.id} className="p-5 flex flex-col gap-4 border-none shadow-sm hover:shadow-md transition-all group overflow-hidden">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1 min-w-0">
                <h3 className="font-bold text-lg truncate flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  {company.razao_social}
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-none">
                    {company.atuacao}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {company.cidade}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-tighter">
                  <DollarSign className="h-3 w-3" /> Capital Social
                </p>
                <p className="font-bold text-primary">R$ {company.capital_social.toLocaleString()}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-tighter">
                  <Briefcase className="h-3 w-3" /> Contato
                </p>
                <p className="font-bold truncate">{company.contato}</p>
              </div>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="truncate">{company.endereco}</p>
              <p>{company.telefone}</p>
            </div>

            <Button 
              className="w-full gap-2 mt-2 bg-primary/90 hover:bg-primary"
              onClick={() => addLead.mutate(company)}
              disabled={addLead.isPending}
            >
              <UserPlus className="h-4 w-4" />
              {addLead.isPending ? 'Adicionando...' : 'Adicionar como Lead'}
            </Button>
          </Card>
        ))}

        {companies.length === 0 && !isLoading && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground bg-card/30 rounded-2xl border-2 border-dashed border-muted/50">
            <Search className="h-12 w-12 opacity-10 mb-4" />
            <p className="text-sm italic">Use os filtros acima para iniciar a colheita de leads.</p>
          </div>
        )}
      </div>
    </div>
  );
}
