import { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, MapPin, Pencil, Plus, Search, Stethoscope, Trash2 } from 'lucide-react';
import ProfessionalDialog from '@/components/clientdb/ProfessionalDialog';
import UnitDialog, { UNIT_TYPES } from '@/components/clientdb/UnitDialog';
import { useClientDatabase, type ClientProfessional, type ClientUnit } from '@/hooks/useClientDatabase';

/**
 * Banco de Dados de Clientes Pulse.
 * Centraliza profissionais (médicos, CRM/RQE, fotos e agenda) e unidades de rede
 * (postos, provedores) com dados por cidade para uso da designer e das campanhas.
 */
export default function ClientDatabase() {
  const { clients } = useApp();
  const [clientId, setClientId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [proDialogOpen, setProDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [editingPro, setEditingPro] = useState<ClientProfessional | null>(null);
  const [editingUnit, setEditingUnit] = useState<ClientUnit | null>(null);

  const { professionals, units, saveRecord, deleteRecord } = useClientDatabase(clientId || undefined);

  const sortedClients = useMemo(
    () => [...(clients || [])].sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [clients],
  );

  const term = search.trim().toLowerCase();
  const filteredPros = (professionals.data || []).filter((p) =>
    !term || `${p.name} ${p.specialty || ''} ${p.council_number || ''}`.toLowerCase().includes(term),
  );
  const filteredUnits = (units.data || []).filter((u) =>
    !term || `${u.unit_name} ${u.city_name || ''}`.toLowerCase().includes(term),
  );

  const unitTypeLabel = (value?: string | null) =>
    UNIT_TYPES.find((t) => t.value === value)?.label || 'Unidade geral';

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Banco de Dados de Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro de profissionais (CRM, RQE, fotos e agenda) e das unidades de redes em várias cidades.
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
              <SelectContent>
                {sortedClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, especialidade ou cidade" />
            </div>
          </div>
        </div>
      </Card>

      {!clientId ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Selecione um cliente para visualizar e cadastrar profissionais e unidades.
        </Card>
      ) : (
        <Tabs defaultValue="profissionais">
          <TabsList>
            <TabsTrigger value="profissionais">
              <Stethoscope className="mr-1.5 h-4 w-4" /> Profissionais ({filteredPros.length})
            </TabsTrigger>
            <TabsTrigger value="unidades">
              <Building2 className="mr-1.5 h-4 w-4" /> Rede / Unidades ({filteredUnits.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profissionais" className="space-y-4 pt-4">
            <Button onClick={() => { setEditingPro(null); setProDialogOpen(true); }}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo profissional
            </Button>

            {professionals.isLoading ? (
              <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : filteredPros.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum profissional cadastrado.</Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredPros.map((pro) => (
                  <Card key={pro.id} className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      {pro.photos?.[0] ? (
                        <img src={pro.photos[0]} alt={pro.name} loading="lazy" className="h-14 w-14 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Stethoscope className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{pro.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{pro.specialty || 'Sem especialidade'}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pro.council_number && <Badge variant="secondary">{pro.council_type} {pro.council_number}</Badge>}
                          {pro.rqe && <Badge variant="outline">RQE {pro.rqe}</Badge>}
                          {!pro.active && <Badge variant="destructive">Inativo</Badge>}
                        </div>
                      </div>
                    </div>

                    {pro.schedule_notes && (
                      <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{pro.schedule_notes}</p>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{(pro.photos?.length || 0)} fotos · {(pro.videos?.length || 0)} vídeos</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => { setEditingPro(pro); setProDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remover"
                          onClick={() => deleteRecord.mutate({ table: 'client_professionals', id: pro.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="unidades" className="space-y-4 pt-4">
            <Button onClick={() => { setEditingUnit(null); setUnitDialogOpen(true); }}>
              <Plus className="mr-1.5 h-4 w-4" /> Nova unidade
            </Button>

            {units.isLoading ? (
              <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : filteredUnits.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma unidade cadastrada.</Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredUnits.map((unit) => (
                  <Card key={unit.id} className="space-y-3 p-4">
                    {unit.photos?.[0] && (
                      <img src={unit.photos[0]} alt={unit.unit_name} loading="lazy" className="h-28 w-full rounded-lg object-cover" />
                    )}
                    <div>
                      <p className="font-semibold">{unit.unit_name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {unit.city_name || 'Cidade não informada'}{unit.state ? ` / ${unit.state}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{unitTypeLabel(unit.unit_type)}</Badge>
                      {unit.city_anniversary && <Badge variant="outline">Aniversário: {unit.city_anniversary.split('-').reverse().join('/')}</Badge>}
                      {unit.population != null && <Badge variant="outline">{unit.population.toLocaleString('pt-BR')} hab.</Badge>}
                      {unit.has_convenience && <Badge variant="outline">Conveniência</Badge>}
                      {unit.has_lodging && <Badge variant="outline">Pousada</Badge>}
                      {unit.has_restaurant && <Badge variant="outline">Restaurante</Badge>}
                    </div>

                    {unit.competitors && (
                      <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">Concorrentes: {unit.competitors}</p>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{(unit.photos?.length || 0)} fotos · {(unit.videos?.length || 0)} vídeos</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => { setEditingUnit(unit); setUnitDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remover"
                          onClick={() => deleteRecord.mutate({ table: 'client_units', id: unit.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <ProfessionalDialog
        open={proDialogOpen}
        onOpenChange={setProDialogOpen}
        clientId={clientId}
        professional={editingPro}
        saving={saveRecord.isPending}
        onSave={(payload) =>
          saveRecord.mutate({ table: 'client_professionals', payload }, { onSuccess: () => setProDialogOpen(false) })
        }
      />

      <UnitDialog
        open={unitDialogOpen}
        onOpenChange={setUnitDialogOpen}
        clientId={clientId}
        unit={editingUnit}
        saving={saveRecord.isPending}
        onSave={(payload) =>
          saveRecord.mutate({ table: 'client_units', payload }, { onSuccess: () => setUnitDialogOpen(false) })
        }
      />
    </div>
  );
}
