import { useCallback, useEffect, useState } from 'react';
import { supabase, vpsAuthedFetch } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bot, Copy, KeyRound, Loader2, Trash2 } from 'lucide-react';

interface AgentKey {
  id: string;
  user_id: string;
  role: string;
  key_hint: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  name: string | null;
  email: string | null;
}

interface Member {
  id: string;
  name: string;
  email: string;
}

const ROLE_LABELS: Record<string, string> = {
  editor: 'Editor',
  revisor: 'Revisão',
  chefe: 'Chefe',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Chaves dos agentes de edição: cada membro da equipe que trabalha pelo Claude
 * (editores, revisão, chefe) usa uma chave própria em vez de login no navegador.
 * A chave aparece uma única vez; o servidor guarda só o hash.
 */
export default function AgentKeysCard() {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState('editor');
  const [newKey, setNewKey] = useState<{ key: string; name: string } | null>(null);

  const loadKeys = useCallback(async () => {
    const response = await vpsAuthedFetch('/agent-keys');
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Falha ao carregar as chaves');
    setKeys(body.keys || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [{ data }] = await Promise.all([
          supabase.from('profiles').select('id, name, email').order('name'),
          loadKeys(),
        ]);
        setMembers((data as Member[]) || []);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!memberId) {
      toast.error('Escolha o membro da equipe');
      return;
    }
    setCreating(true);
    try {
      const response = await vpsAuthedFetch('/agent-keys', {
        method: 'POST',
        body: JSON.stringify({ user_id: memberId, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Falha ao gerar a chave');
      setNewKey({ key: body.key, name: body.name });
      setMemberId('');
      await loadKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: AgentKey) => {
    if (!window.confirm(`Revogar a chave de ${key.name || key.email}? O agente para de funcionar na hora.`)) return;
    const response = await vpsAuthedFetch(`/agent-keys/${key.id}`, { method: 'DELETE' });
    if (!response.ok) {
      toast.error('Falha ao revogar');
      return;
    }
    toast.success('Chave revogada');
    await loadKeys();
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      toast.success('Chave copiada');
    } catch {
      toast.error('O navegador não deixou copiar. Selecione a chave com o mouse e use Cmd+C.');
    }
  };

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-center gap-2 text-primary">
        <Bot size={18} />
        <h2 className="text-base font-semibold">Agentes de edição</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Gere uma chave para cada membro que trabalha pelo Claude. Ele pega cards da fila de edição, entrega o vídeo
        direto no card e aparece com o próprio nome no histórico e nos relatórios.
      </p>

      {newKey && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
          <p className="text-sm font-medium">Chave de {newKey.name} — copie agora, ela não aparece de novo:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded bg-background px-2 py-1 text-xs">{newKey.key}</code>
            <Button size="sm" variant="outline" onClick={copyKey}>
              <Copy size={14} className="mr-1" /> Copiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            No Mac que edita, salve com: <code className="select-all">read -rs "K?Cole a chave: " &amp;&amp; printf %s "$K" &gt; ~/.config/pulse/agentes/{newKey.name.split(' ')[0].toLowerCase()}.key &amp;&amp; chmod 600 ~/.config/pulse/agentes/{newKey.name.split(' ')[0].toLowerCase()}.key &amp;&amp; unset K</code>
          </p>
          <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Já guardei</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Membro da equipe</Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>{member.name} · {member.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Função</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate} disabled={creating || loading}>
          {creating ? <Loader2 size={14} className="mr-1 animate-spin" /> : <KeyRound size={14} className="mr-1" />}
          Gerar chave
        </Button>
      </div>

      {loading ? (
        <Loader2 className="animate-spin text-muted-foreground" size={18} />
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma chave gerada ainda.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {keys.map((key) => (
            <div key={key.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-medium">{key.name || key.email}</span>
              <Badge variant="outline">{ROLE_LABELS[key.role] || key.role}</Badge>
              <span className="text-xs text-muted-foreground">…{key.key_hint}</span>
              <span className="text-xs text-muted-foreground">último uso: {formatDate(key.last_used_at)}</span>
              {key.revoked_at ? (
                <Badge variant="secondary" className="ml-auto">Revogada</Badge>
              ) : (
                <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => handleRevoke(key)}>
                  <Trash2 size={14} className="mr-1" /> Revogar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
