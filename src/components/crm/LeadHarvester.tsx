import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vpsAuthedFetch, supabase } from '@/lib/vpsDb';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  cidade: string;
  website?: string;
}

const NICHES = [
  { value: 'all', label: 'Todos os nichos' },
  { value: 'varejo', label: 'Comércio / Varejo' },
  { value: 'saude', label: 'Saúde' },
  { value: 'aliment', label: 'Alimentação e Gastronomia' },
  { value: 'serviç', label: 'Prestação de Serviços' },
  { value: 'indústria', label: 'Indústria' },
  { value: 'construção', label: 'Construção Civil' },
  { value: 'agro', label: 'Agronegócio' },
  { value: 'automotiv', label: 'Automotivo' },
];

export function LeadHarvester() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [city, setCity] = useState('all');
  const [location, setLocation] = useState('');
  const [niche, setNiche] = useState('all');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data: companies = [], isLoading, refetch } = useQuery({
    queryKey: ['lead_harvest', city, location, niche, term],
    queryFn: async () => {
      const res = await vpsAuthedFetch('/crm/harvest/search', {
        method: 'POST',
        body: JSON.stringify({ city, location, niche, term }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Falha ao buscar empresas');
      return (result.data || []) as Company[];
    },
    enabled: false,
    retry: false,
  });

  const selectedCompanies = useMemo(
    () => companies.filter(c => selected[c.id]),
    [companies, selected]
  );

  const clearLeads = () => {
    queryClient.setQueryData(['lead_harvest', city, location, niche, term], []);
    setSelected({});
    toast.info('Resultados da colheita limpos.');
  };

  const insertLead = async (company: Company) => {
    if (!user?.id) throw new Error('Sessão expirada');
    const { error } = await supabase.from('crm_leads').insert([{
      name: company.contato,
      company: company.razao_social,
      email: company.email,
      phone: company.telefone,
      description: `Endereço: ${company.endereco || 'não informado'}\nAtuação: ${company.atuacao}${company.website ? `\nSite: ${company.website}` : ''}`,
      city: company.cidade,
      status: 'lead',
      source_tag: 'colheita',
      user_id: user.id,
    }]);
    if (error) throw error;
  };

  const addLead = useMutation({
    mutationFn: insertLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      toast.success('Empresa adicionada ao CRM como novo lead!');
    },
    onError: (err: any) => toast.error('Erro ao adicionar lead: ' + err.message),
  });

  const addSelected = async () => {
    if (selectedCompanies.length === 0) return;
    setBulkLoading(true);
    let ok = 0;
    const fails: string[] = [];
    for (const company of selectedCompanies) {
      try {
        await insertLead(company);
        ok++;
      } catch (err: any) {
        fails.push(`${company.razao_social}: ${err?.message || 'erro'}`);
      }
    }
    setBulkLoading(false);
    setSelected({});
    queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
    if (ok > 0) toast.success(`${ok} lead(s) adicionado(s) ao CRM.`);
    if (fails.length > 0) toast.error(`${fails.length} falha(s): ${fails[0]}`);
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) { setSelected({}); return; }
    const next: Record<string, boolean> = {};
    companies.forEach(c => { next[c.id] = true; });
    setSelected(next);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (city === 'all' && !location.trim()) {
      toast.error('Informe uma cidade ou localização para buscar empresas reais.');
      return;
    }
    setSelected({});
    const result = await refetch();
    if (result.error) {
      toast.error((result.error as Error).message);
    } else if ((result.data || []).length === 0) {
      toast.info('Nenhuma empresa encontrada com esses filtros.');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/50 border-none shadow-sm">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="space-y-2">
            <Label>Cidade base</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger><SelectValue placeholder="Selecione a cidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Cidades</SelectItem>
                <SelectItem value="Minaçu">Minaçu</SelectItem>
                <SelectItem value="Uruaçu">Uruaçu</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Localização (cidade, bairro, rua)</Label>
            <Input
              placeholder="Ex.: Centro, Setor Industrial"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Nicho / Atuação</Label>
            <Select value={niche} onValueChange={setNiche}>
              <SelectTrigger><SelectValue placeholder="Selecione o nicho" /></SelectTrigger>
              <SelectContent>
                {NICHES.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Busca livre</Label>
            <Input
              placeholder="Nome, contato, atividade"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1 gap-2 h-10" disabled={isLoading}>
              <Search className="h-4 w-4" />
              {isLoading ? 'Buscando...' : 'Colher'}
            </Button>
            {companies.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="gap-2 h-10 border-destructive/20 text-destructive hover:bg-destructive/10"
                onClick={clearLeads}
              >
                Limpar
              </Button>
            )}
          </div>
        </form>
      </Card>

      {companies.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/40 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selectedCompanies.length === companies.length && companies.length > 0}
              onCheckedChange={(v) => toggleAll(Boolean(v))}
            />
            Selecionar todos ({companies.length})
          </label>
          <span className="text-sm text-muted-foreground">
            {selectedCompanies.length} selecionado(s)
          </span>
          <Button
            className="ml-auto gap-2"
            size="sm"
            disabled={selectedCompanies.length === 0 || bulkLoading}
            onClick={addSelected}
          >
            <UserPlus className="h-4 w-4" />
            {bulkLoading ? 'Adicionando...' : 'Adicionar selecionados ao CRM'}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => (
          <Card
            key={company.id}
            className={`p-5 flex flex-col gap-4 border shadow-sm hover:shadow-md transition-all overflow-hidden ${selected[company.id] ? 'border-primary ring-1 ring-primary/40' : 'border-transparent'}`}
          >
            <div className="flex justify-between items-start gap-3">
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
              <Checkbox
                aria-label={`Selecionar ${company.razao_social}`}
                checked={Boolean(selected[company.id])}
                onCheckedChange={(v) => setSelected(prev => ({ ...prev, [company.id]: Boolean(v) }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-tighter">
                  <DollarSign className="h-3 w-3" /> Site
                </p>
                <p className="font-bold text-primary truncate">{company.website || '—'}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-tighter">
                  <Briefcase className="h-3 w-3" /> Contato
                </p>
                <p className="font-bold truncate">{company.contato}</p>
              </div>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="truncate">{company.endereco || 'Endereço não informado'}</p>
              <p>{company.telefone || 'Telefone não informado'}</p>
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
