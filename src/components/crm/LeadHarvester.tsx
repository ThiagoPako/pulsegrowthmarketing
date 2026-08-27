import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vpsAuthedFetch, supabase } from '@/lib/vpsDb';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, UserPlus, Sparkles, Download, FileJson, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { LeadCard } from './LeadCard';
import { Company, HarvestResult, brl, exportCompanies } from './harvestTypes';

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

const CONTACT_FILTERS = [
  { value: 'todos', label: 'Todas as empresas' },
  { value: 'qualquer', label: 'Somente com algum contato' },
  { value: 'whatsapp', label: 'Somente com WhatsApp' },
  { value: 'telefone', label: 'Somente com telefone' },
  { value: 'email', label: 'Somente com e-mail' },
  { value: 'instagram', label: 'Somente com Instagram' },
];

const QUALITY_FILTERS = [
  { value: '0', label: 'Qualquer completude' },
  { value: '40', label: 'Dados parcialmente completos (40%+)' },
  { value: '70', label: 'Dados completos (70%+)' },
];

const PAGE_SIZES = ['25', '50', '100', '250', '500', '1000'];

export function LeadHarvester() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [city, setCity] = useState('all');
  const [state, setState] = useState('Goiás');
  const [location, setLocation] = useState('');
  const [niche, setNiche] = useState('all');
  const [term, setTerm] = useState('');
  const [contactFilter, setContactFilter] = useState('todos');
  const [onlyWithDecisor, setOnlyWithDecisor] = useState(false);
  const [minCompletude, setMinCompletude] = useState('0');
  const [mode, setMode] = useState<'rapido' | 'profundo'>('rapido');
  const [pageSize, setPageSize] = useState('100');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const queryKey = ['lead_harvest', city, state, location, niche, term, contactFilter, onlyWithDecisor, minCompletude, mode, pageSize, page];

  const { data: result, isLoading, refetch } = useQuery<HarvestResult>({
    queryKey,
    queryFn: async () => {
      const res = await vpsAuthedFetch('/crm/harvest/search', {
        method: 'POST',
        body: JSON.stringify({
          city, state, location, niche, term, mode,
          contactFilter, onlyWithDecisor,
          minCompletude: Number(minCompletude),
          pageSize: Number(pageSize), page, limit: 5000,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Falha ao buscar empresas');
      return {
        data: (json.data || []) as Company[],
        total: json.total || 0,
        com_contato: json.com_contato || 0,
        potencial_total: json.potencial_total || 0,
        page: json.page || 1,
        total_pages: json.total_pages || 1,
        stats: json.stats,
        mode: json.mode,
      };
    },
    enabled: false,
    retry: false,
  });

  const companies = result?.data || [];
  const stats = result?.stats;

  const selectedCompanies = useMemo(() => companies.filter(c => selected[c.id]), [companies, selected]);

  const setCompanies = (next: Company[]) => {
    queryClient.setQueryData(queryKey, { ...(result || {}), data: next });
  };

  const clearLeads = () => {
    queryClient.setQueryData(queryKey, { data: [], total: 0, com_contato: 0, potencial_total: 0, page: 1, total_pages: 1 });
    setSelected({});
    toast.info('Resultados da colheita limpos.');
  };

  const insertLead = async (company: Company) => {
    if (!user?.id) throw new Error('Sessão expirada');
    const detalhes = [
      company.decisor ? `Responsável: ${company.decisor}${company.decisor_cargo ? ` (${company.decisor_cargo})` : ''}` : 'Responsável: não identificado',
      company.socios?.length ? `Sócios: ${company.socios.join(' | ')}` : '',
      company.cnpj ? `CNPJ: ${company.cnpj}` : '',
      company.porte ? `Porte: ${company.porte}` : '',
      `Endereço: ${company.endereco || 'não identificado'}`,
      company.cep ? `CEP: ${company.cep}` : '',
      `Segmento: ${company.categoria || company.atuacao}`,
      company.telefones?.length ? `Telefones: ${company.telefones.join(' | ')}` : '',
      company.whatsapp ? `WhatsApp (${company.whatsapp_status === 'confirmado' ? 'confirmado' : 'provável'}): ${company.whatsapp}` : '',
      company.website ? `Site: ${company.website}` : '',
      company.instagram ? `Instagram: ${company.instagram}` : '',
      company.facebook ? `Facebook: ${company.facebook}` : '',
      company.maps_url ? `Mapa: ${company.maps_url}` : '',
      `Score: ${company.score ?? 0}/100 • Completude: ${company.completude ?? 0}% • Confiança: ${company.confianca || 'não confirmada'}`,
      company.fontes?.length ? `Fontes: ${company.fontes.join(', ')}` : '',
      `Capturado em: ${new Date().toLocaleDateString('pt-BR')}`,
      `Potencial estimado: ${brl(company.potencial_mensal)}/mês`,
    ].filter(Boolean).join('\n');

    const { error } = await supabase.from('crm_leads').insert([{
      name: company.decisor || company.contato,
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
      toast.success('Empresa enviada para o CRM como novo lead!');
    },
    onError: (err: Error) => toast.error('Erro ao adicionar lead: ' + err.message),
  });

  const addSelected = async () => {
    if (selectedCompanies.length === 0) return;
    setBulkLoading(true);
    let ok = 0;
    const fails: string[] = [];
    for (const company of selectedCompanies) {
      try { await insertLead(company); ok++; }
      catch (err) { fails.push(`${company.razao_social}: ${(err as Error)?.message || 'erro'}`); }
    }
    setBulkLoading(false);
    setSelected({});
    queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
    if (ok > 0) toast.success(`${ok} lead(s) enviado(s) ao CRM.`);
    if (fails.length > 0) toast.error(`${fails.length} falha(s): ${fails[0]}`);
  };

  const enrichSelected = async () => {
    const alvo = selectedCompanies.length ? selectedCompanies : companies;
    if (!alvo.length) return;
    setEnriching(true);
    try {
      const res = await vpsAuthedFetch('/crm/harvest/enrich', {
        method: 'POST',
        body: JSON.stringify({ companies: alvo.slice(0, 200), niche, force: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Falha ao enriquecer');
      const byId = new Map((json.data as Company[]).map(c => [c.id, c]));
      setCompanies(companies.map(c => byId.get(c.id) || c));
      toast.success(`${json.data.length} lead(s) enriquecido(s).`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnriching(false);
    }
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) { setSelected({}); return; }
    const next: Record<string, boolean> = {};
    companies.forEach(c => { next[c.id] = true; });
    setSelected(next);
  };

  const runSearch = async (targetPage = 1) => {
    if (city === 'all' && !location.trim()) {
      toast.error('Informe uma cidade para buscar empresas reais.');
      return;
    }
    setSelected({});
    setPage(targetPage);
    const res = await refetch();
    if (res.error) toast.error((res.error as Error).message);
    else if ((res.data?.data || []).length === 0) toast.info('Nenhuma empresa encontrada com esses filtros.');
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/50 border-none shadow-sm">
        <form onSubmit={(e) => { e.preventDefault(); runSearch(1); }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input
              placeholder="Ex.: Goiânia, Uruaçu..."
              value={city === 'all' ? '' : city}
              onChange={(e) => setCity(e.target.value.trim() ? e.target.value : 'all')}
              list="harvest-city-suggestions"
            />
            <datalist id="harvest-city-suggestions">
              <option value="Minaçu" /><option value="Uruaçu" /><option value="Goiânia" />
              <option value="Anápolis" /><option value="Porangatu" />
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
            <Input placeholder="Ex.: Centro" value={location} onChange={(e) => setLocation(e.target.value)} />
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
            <Input placeholder="Nome ou atividade" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1 gap-2 h-10" disabled={isLoading}>
              <Search className="h-4 w-4" />
              {isLoading ? 'Buscando...' : 'Colher'}
            </Button>
            {companies.length > 0 && (
              <Button type="button" variant="outline" className="gap-2 h-10 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={clearLeads}>
                Limpar
              </Button>
            )}
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label>Leads prontos para contato</Label>
            <Select value={contactFilter} onValueChange={setContactFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_FILTERS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label>Qualidade dos dados</Label>
            <Select value={minCompletude} onValueChange={setMinCompletude}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUALITY_FILTERS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Resultados por página</Label>
            <Select value={pageSize} onValueChange={setPageSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant={mode === 'profundo' ? 'default' : 'outline'}
              className="gap-2 h-10 w-full"
              onClick={() => setMode(mode === 'profundo' ? 'rapido' : 'profundo')}
            >
              {mode === 'profundo' ? <Sparkles className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
              {mode === 'profundo' ? 'Enriquecimento profundo' : 'Busca rápida'}
            </Button>
          </div>

          <div className="lg:col-span-6 space-y-1">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={onlyWithDecisor} onCheckedChange={(v) => setOnlyWithDecisor(Boolean(v))} />
              Somente empresas com responsável/decisor identificado
            </label>
            {mode === 'profundo' && (
              <p className="text-xs text-muted-foreground">Esta busca utiliza mais consultas e pode levar mais tempo.</p>
            )}
          </div>
        </form>
      </Card>

      {stats && companies.length > 0 && (
        <Card className="p-5 space-y-3">
          <p className="text-sm font-semibold uppercase tracking-tight text-muted-foreground">Central de prospecção</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
            {[
              ['Empresas', stats.total], ['Com telefone', stats.com_telefone], ['Com WhatsApp', stats.com_whatsapp],
              ['Com Instagram', stats.com_instagram], ['Com e-mail', stats.com_email], ['Com decisor', stats.com_decisor],
              ['Prontos p/ contato', stats.prontos], ['Completude média', `${stats.completude_media}%`],
              ['Score médio', stats.score_medio], ['Taxa de enriquecimento', `${stats.taxa_enriquecimento}%`],
              ['Potencial', brl(result?.potencial_total)], ['Selecionados', selectedCompanies.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-muted/40 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                <p className="text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>
        </Card>
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
          <Button variant="outline" size="sm" className="gap-2" onClick={enrichSelected} disabled={enriching}>
            <Sparkles className="h-4 w-4" /> {enriching ? 'Enriquecendo...' : 'Enriquecer leads'}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCompanies(selectedCompanies.length ? selectedCompanies : companies, 'csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCompanies(selectedCompanies.length ? selectedCompanies : companies, 'json')}>
            <FileJson className="h-4 w-4" /> JSON
          </Button>
          <Button className="ml-auto gap-2" size="sm" disabled={selectedCompanies.length === 0 || bulkLoading} onClick={addSelected}>
            <UserPlus className="h-4 w-4" />
            {bulkLoading ? 'Enviando...' : 'Enviar selecionados ao CRM'}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => (
          <LeadCard
            key={company.id}
            company={company}
            selected={Boolean(selected[company.id])}
            onToggle={(v) => setSelected(prev => ({ ...prev, [company.id]: v }))}
            onSendToCrm={() => addLead.mutate(company)}
            sending={addLead.isPending}
          />
        ))}

        {companies.length === 0 && !isLoading && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground bg-card/30 rounded-2xl border-2 border-dashed border-muted/50">
            <Search className="h-12 w-12 opacity-10 mb-4" />
            <p className="text-sm italic">Use os filtros acima para iniciar a colheita de leads.</p>
          </div>
        )}
      </div>

      {(result?.total_pages || 1) > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => runSearch(page - 1)}>Anterior</Button>
          <span className="text-sm text-muted-foreground">Página {result?.page} de {result?.total_pages}</span>
          <Button variant="outline" size="sm" disabled={page >= (result?.total_pages || 1) || isLoading} onClick={() => runSearch(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
