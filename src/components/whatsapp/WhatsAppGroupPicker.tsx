import { useEffect, useState } from 'react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Group {
  jid: string;
  subject: string | null;
  size: number | null;
  connections: string[];
}

/**
 * Grupo do WhatsApp do cliente: escolhe da lista de grupos em que os números conectados estão (grava o id do
 * grupo) ou cola o link de convite. As mensagens do cliente vão para o grupo; cobrança continua no privado.
 */
export default function WhatsAppGroupPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    vpsAuthedFetch('/whatsapp/groups')
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((body) => setGroups(body.groups || []))
      .catch(() => setGroups([]))
      .finally(() => setLoaded(true));
  }, []);

  const current = groups.find((g) => g.jid === value);
  const isLink = /chat\.whatsapp\.com\//i.test(value || '');

  return (
    <div className="space-y-1.5">
      <Select value={current ? current.jid : ''} onValueChange={(v) => onChange(v === '__none' ? '' : v)}>
        <SelectTrigger>
          <SelectValue placeholder={loaded ? (groups.length ? 'Escolher um grupo dos números conectados' : 'Nenhum grupo encontrado nos números conectados') : 'Carregando grupos…'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Sem grupo (manda no WhatsApp do cliente)</SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.jid} value={g.jid}>
              {g.subject || g.jid}{g.size ? ` · ${g.size} pessoas` : ''} · {g.connections.join(', ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!current && (
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ou cole o link de convite (https://chat.whatsapp.com/…)"
        />
      )}
      <p className="text-[10px] text-muted-foreground">
        {current
          ? `As mensagens deste cliente vão para o grupo "${current.subject}" (cobrança continua no privado).`
          : isLink
            ? 'Link de convite: o número que envia precisa estar no grupo.'
            : value
              ? 'Grupo não encontrado entre os números conectados: confira se o número do sistema está no grupo.'
              : 'Se escolher um grupo, as mensagens do cliente vão para lá (cobrança continua no privado). O número do sistema precisa estar no grupo.'}
      </p>
    </div>
  );
}
