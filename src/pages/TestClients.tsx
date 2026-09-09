import { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { FlaskConical, Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import type { Client } from '@/types';

/** Prefixo que identifica visualmente os clientes criados para teste/avaliação. */
const TEST_PREFIX = '[TESTE]';

interface TestClientForm {
  companyName: string;
  responsiblePerson: string;
  whatsapp: string;
  city: string;
  niche: string;
}

const EMPTY_FORM: TestClientForm = {
  companyName: '',
  responsiblePerson: '',
  whatsapp: '',
  city: '',
  niche: '',
};

/**
 * Módulo exclusivo do cargo "Revisor Meta": permite cadastrar clientes de teste
 * (sandbox) sem tocar nas configurações contratuais/financeiras reais.
 */
export default function TestClients() {
  const { clients, addClient, deleteClient, users } = useApp();
  const [form, setForm] = useState<TestClientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const testClients = useMemo(
    () => clients.filter(c => c.companyName.trim().toUpperCase().startsWith(TEST_PREFIX)),
    [clients],
  );

  const setField = (key: keyof TestClientForm, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const buildTestClient = (): Client => {
    const fallbackVideomaker = users[0]?.id ?? '';
    return {
      id: crypto.randomUUID(),
      companyName: `${TEST_PREFIX} ${form.companyName.trim()}`,
      responsiblePerson: form.responsiblePerson.trim() || 'Responsável Teste',
      phone: form.whatsapp.trim(),
      email: '',
      city: form.city.trim() || 'Minaçu',
      color: '217 91% 60%',
      fixedDay: 'segunda',
      fixedTime: '09:00',
      videomaker: fallbackVideomaker,
      backupTime: '14:00',
      backupDay: 'terca',
      extraDay: 'quarta',
      extraContentTypes: [],
      acceptsExtra: false,
      extraClientAppears: false,
      whatsapp: form.whatsapp.trim(),
      weeklyReels: 0,
      weeklyCreatives: 0,
      weeklyGoal: 0,
      hasEndomarketing: false,
      hasVehicleFlyer: false,
      weeklyStories: 0,
      presenceDays: 0,
      monthlyRecordings: 0,
      niche: form.niche.trim() || 'Teste',
      selectedWeeks: [1, 2, 3, 4],
      clientType: 'novo',
      status: 'ativo',
    };
  };

  const handleCreate = async () => {
    if (saving) return;
    if (!form.companyName.trim() || !form.whatsapp.trim()) {
      toast.error('Informe o nome da empresa e o WhatsApp');
      return;
    }

    setSaving(true);
    try {
      const created = await addClient(buildTestClient());
      if (!created) {
        toast.error('Já existe um cliente com esse nome');
        return;
      }
      toast.success('Cliente de teste cadastrado');
      setForm(EMPTY_FORM);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao cadastrar cliente de teste';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (client: Client) => {
    if (deletingId) return;
    if (!window.confirm(`Excluir o cliente de teste "${client.companyName}"?`)) return;
    setDeletingId(client.id);
    try {
      const ok = await deleteClient(client.id);
      if (ok) toast.success('Cliente de teste removido');
      else toast.error('Não foi possível remover o cliente');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <FlaskConical size={22} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Clientes de Teste</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre perfis fictícios para testar agendamento, conexões sociais e o portal.
          </p>
        </div>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="test-company">Nome da empresa *</Label>
            <Input
              id="test-company"
              value={form.companyName}
              onChange={e => setField('companyName', e.target.value)}
              placeholder="Loja Demo"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-responsible">Responsável</Label>
            <Input
              id="test-responsible"
              value={form.responsiblePerson}
              onChange={e => setField('responsiblePerson', e.target.value)}
              placeholder="Maria Teste"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-whatsapp">WhatsApp *</Label>
            <Input
              id="test-whatsapp"
              value={form.whatsapp}
              onChange={e => setField('whatsapp', e.target.value)}
              placeholder="5562999999999"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-city">Cidade</Label>
            <Input
              id="test-city"
              value={form.city}
              onChange={e => setField('city', e.target.value)}
              placeholder="Minaçu"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="test-niche">Segmento</Label>
            <Input
              id="test-niche"
              value={form.niche}
              onChange={e => setField('niche', e.target.value)}
              placeholder="Varejo"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Plus size={16} className="mr-2" />}
            Cadastrar cliente de teste
          </Button>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          Cadastrados ({testClients.length})
        </h2>

        {testClients.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente de teste cadastrado ainda.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {testClients.map(client => (
              <Card key={client.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{client.companyName}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {client.responsiblePerson} · {client.whatsapp}
                  </p>
                  <p className="text-xs text-muted-foreground">{client.city} · {client.niche}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir ${client.companyName}`}
                  onClick={() => handleDelete(client)}
                  disabled={deletingId === client.id}
                >
                  {deletingId === client.id
                    ? <Loader2 size={16} className="animate-spin" />
                    : <Trash2 size={16} className="text-destructive" />}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
