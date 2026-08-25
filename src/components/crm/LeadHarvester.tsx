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
import {
  Search, MapPin, UserPlus, Building2, Phone, Mail, Globe, Instagram,
  Facebook, Clock, TrendingUp, MessageCircle, Map,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Company {
  id: string;
  razao_social: string;
  contato: string;
  email: string;
  telefone: string;
  telefones?: string[];
  whatsapp?: string;
  atuacao: string;
  categoria?: string;
  endereco: string;
  bairro?: string;
  cep?: string;
  cidade: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  horario?: string;
  maps_url?: string;
  score?: number;
  potencial_mensal?: number;
  tem_contato?: boolean;
  cnpj?: string;
  decisor?: string;
  decisor_cargo?: string;
  socios?: string[];
  porte?: string;
  capital_social?: number | null;
  fontes?: string[];
}

interface HarvestResult {
  data: Company[];
  total: number;
  com_contato: number;
  potencial_total: number;
}

const NICHES = [
  { value: 'all', label: 'Todos os nichos' },
  { value: 'varejo', label: 'Comércio / Varejo' },
  { value: 'saude', label: 'Saúde' },
  { value: 'aliment', label: 'Alimentação e Gastronomia' },
  { value: 'serviços', label: 'Prestação de Serviços' },
  { value: 'indústria', label: 'Indústria' },
  { value: 'construção', label: 'Construção Civil' },
  { value: 'agro', label: 'Agronegócio' },
  { value: 'automotiv', label: 'Automotivo' },
];

const UFS = [
  'Goiás', 'Distrito Federal', 'Minas Gerais', 'São Paulo', 'Bahia', 'Tocantins',
  'Mato Grosso', 'Mato Grosso do Sul', 'Paraná', 'Santa Catarina', 'Rio Grande do Sul',
  'Rio de Janeiro', 'Espírito Santo', 'Pará', 'Maranhão', 'Piauí', 'Ceará',
  'Rio Grande do Norte', 'Paraíba', 'Pernambuco', 'Alagoas', 'Sergipe',
  'Amazonas', 'Acre', 'Rondônia', 'Roraima', 'Amapá',
];

const brl = (v?: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

const scoreTone = (score = 0) => {
  if (score >= 75) return 'bg-primary/15 text-primary';
  if (score >= 50) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
};

export function LeadHarvester() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [city, setCity] = useState('all');
  const [state, setState] = useState('Goiás');
  const [location, setLocation] = useState('');
  const [niche, setNiche] = useState('all');
  const [term, setTerm] = useState('');
  const [onlyWithContact, setOnlyWithContact] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const queryKey = ['lead_harvest', city, state, location, niche, term, onlyWithContact];

  const { data: result, isLoading, refetch } = useQuery<HarvestResult>({
    queryKey,
    queryFn: async () => {
      const res = await vpsAuthedFetch('/crm/harvest/search', {
        method: 'POST',
        body: JSON.stringify({ city, state, location, niche, term, onlyWithContact, limit: 5000 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Falha ao buscar empresas');
      return {
        data: (json.data || []) as Company[],
        total: json.total || 0,
        com_contato: json.com_contato || 0,
        potencial_total: json.potencial_total || 0,
      };
    },
    enabled: false,
    retry: false,
  });

  const companies = result?.data || [];

  const selectedCompanies = useMemo(
    () => companies.filter(c => selected[c.id]),
    [companies, selected]
  );

  const clearLeads = () => {
    queryClient.setQueryData(queryKey, { data: [], total: 0, com_contato: 0, potencial_total: 0 });
    setSelected({});
    toast.info('Resultados da colheita limpos.');
  };

  const insertLead = async (company: Company) => {
    if (!user?.id) throw new Error('Sessão expirada');
    const detalhes = [
      company.decisor ? `Decisor: ${company.decisor}${company.decisor_cargo ? ` (${company.decisor_cargo})` : ''}` : '',
      company.socios?.length ? `Sócios: ${company.socios.join(' | ')}` : '',
      company.cnpj ? `CNPJ: ${company.cnpj}` : '',
      company.porte ? `Porte: ${company.porte}` : '',
      `Endereço: ${company.endereco || 'não informado'}`,
      company.bairro ? `Bairro: ${company.bairro}` : '',
      company.cep ? `CEP: ${company.cep}` : '',
      `Atuação: ${company.categoria || company.atuacao}`,
      company.telefones?.length ? `Telefones: ${company.telefones.join(' | ')}` : '',
      company.website ? `Site: ${company.website}` : '',
      company.instagram ? `Instagram: ${company.instagram}` : '',
      company.facebook ? `Facebook: ${company.facebook}` : '',
      company.horario ? `Horário: ${company.horario}` : '',
      company.maps_url ? `Mapa: ${company.maps_url}` : '',
      company.fontes?.length ? `Fontes: ${company.fontes.join(', ')}` : '',
      `Potencial estimado: ${brl(company.potencial_mensal)}/mês`,
    ].filter(Boolean).join('\n');

    const { error } = await supabase.from('crm_leads').insert([{
      name: company.contato,
      company: company.razao_social,
      email: company.email,
      phone: company.telefone,
      description: detalhes,
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
      toast.error('Informe uma cidade para buscar empresas reais.');
      return;
    }
    setSelected({});
    const res = await refetch();
    if (res.error) {
      toast.error((res.error as Error).message);
    } else if ((res.data?.data || []).length === 0) {
      toast.info('Nenhuma empresa encontrada com esses filtros.');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/50 border-none shadow-sm">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input
              placeholder="Ex.: Goiânia, Uruaçu..."
              value={city === 'all' ? '' : city}
              onChange={(e) => setCity(e.target.value.trim() ? e.target.value : 'all')}
              list="harvest-city-suggestions"
            />
            <datalist id="harvest-city-suggestions">
              <option value="Minaçu" />
              <option value="Uruaçu" />
              <option value="Goiânia" />
              <option value="Anápolis" />
              <option value="Porangatu" />
            </datalist>
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Bairro / rua</Label>
            <Input
              placeholder="Ex.: Centro"
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
              placeholder="Nome ou atividade"
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

          <label className="flex items-center gap-2 text-sm text-muted-foreground lg:col-span-6">
            <Checkbox checked={onlyWithContact} onCheckedChange={(v) => setOnlyWithContact(Boolean(v))} />
            Mostrar apenas empresas com telefone ou e-mail
          </label>
        </form>
      </Card>

      {companies.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Empresas</p>
            <p className="text-2xl font-bold">{result?.total ?? companies.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Com contato</p>
            <p className="text-2xl font-bold text-primary">{result?.com_contato ?? 0}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Potencial mensal</p>
            <p className="text-2xl font-bold">{brl(result?.potencial_total)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Selecionados</p>
            <p className="text-2xl font-bold">{selectedCompanies.length}</p>
          </Card>
        </div>
      )}

      {companies.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/40 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selectedCompanies.length === companies.length && companies.length > 0}
              onCheckedChange={(v) => toggleAll(Boolean(v))}
            />
            Selecionar todos ({companies.length})
          </label>
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-none">
                    {company.categoria || company.atuacao}
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
              <div className={`p-2 rounded-lg space-y-1 ${scoreTone(company.score)}`}>
                <p className="font-semibold uppercase tracking-tighter flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Score
                </p>
                <p className="font-bold text-base">{company.score ?? 0}/100</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-tighter">Potencial</p>
                <p className="font-bold text-base">{brl(company.potencial_mensal)}<span className="text-[10px] font-normal">/mês</span></p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <p className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {company.endereco || 'Endereço não informado'}{company.cep ? ` • ${company.cep}` : ''}
                </span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {company.telefones?.length
                  ? <span className="font-medium">{company.telefones.join(' | ')}</span>
                  : <span className="text-muted-foreground">Telefone não informado</span>}
              </p>
              <p className="flex items-center gap-2 truncate">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {company.email
                  ? <span className="truncate font-medium">{company.email}</span>
                  : <span className="text-muted-foreground">E-mail não informado</span>}
              </p>
              {company.horario && (
                <p className="flex items-center gap-2 text-muted-foreground truncate">
                  <Clock className="h-3.5 w-3.5 shrink-0" /> {company.horario}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {company.whatsapp && (
                <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
                  <a href={company.whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </Button>
              )}
              {company.website && (
                <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
                  <a href={company.website} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-3.5 w-3.5" /> Site
                  </a>
                </Button>
              )}
              {company.instagram && (
                <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
                  <a href={company.instagram} target="_blank" rel="noopener noreferrer">
                    <Instagram className="h-3.5 w-3.5" /> Instagram
                  </a>
                </Button>
              )}
              {company.facebook && (
                <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
                  <a href={company.facebook} target="_blank" rel="noopener noreferrer">
                    <Facebook className="h-3.5 w-3.5" /> Facebook
                  </a>
                </Button>
              )}
              {company.maps_url && (
                <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
                  <a href={company.maps_url} target="_blank" rel="noopener noreferrer">
                    <Map className="h-3.5 w-3.5" /> Mapa
                  </a>
                </Button>
              )}
            </div>

            <Button
              className="w-full gap-2 mt-auto bg-primary/90 hover:bg-primary"
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
