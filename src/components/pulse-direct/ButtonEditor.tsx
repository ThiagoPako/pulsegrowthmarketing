// Botões de link do direct (até 3): "WhatsApp" pede só o número (e a mensagem, se quiser) e monta o link sozinho;
// "Site ou link" aceita qualquer endereço. Usado no editor de funil e na caixa de entrada.
import { Globe, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseWhatsapp, whatsappLink } from './theme';
import type { LinkButton } from './types';

interface Draft { kind: 'whatsapp' | 'link'; title: string; number: string; message: string; url: string }

const toDraft = (b: LinkButton): Draft => {
  const w = parseWhatsapp(b.url);
  return w ? { kind: 'whatsapp', title: b.title, number: w.number, message: w.message, url: '' } : { kind: 'link', title: b.title, number: '', message: '', url: b.url };
};
const toButton = (d: Draft): LinkButton => ({ title: d.title, url: d.kind === 'whatsapp' ? whatsappLink(d.number, d.message) || '' : d.url });

export default function ButtonEditor({ value, onChange, max = 3 }: { value: LinkButton[]; onChange: (v: LinkButton[]) => void; max?: number }) {
  const drafts = value.map(toDraft);
  const set = (i: number, patch: Partial<Draft>) => onChange(drafts.map((d, j) => toButton(j === i ? { ...d, ...patch } : d)));
  const add = (kind: Draft['kind']) => onChange([...value, toButton(kind === 'whatsapp'
    ? { kind, title: 'Chamar no WhatsApp', number: '', message: '', url: '' }
    : { kind, title: 'Ver agora', number: '', message: '', url: 'https://' })]);

  return (
    <div className="space-y-2">
      {drafts.map((d, i) => {
        const bad = d.kind === 'whatsapp' ? d.number.replace(/\D/g, '').length > 0 && !whatsappLink(d.number) : d.url.length > 8 && !/^https?:\/\/\S+\.\S+/.test(d.url);
        return (
          <div key={i} className="rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center gap-2">
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white', d.kind === 'whatsapp' ? 'bg-[#25D366]' : 'bg-[#3797F0]')}>
                {d.kind === 'whatsapp' ? <MessageCircle size={14} /> : <Globe size={14} />}
              </span>
              <Input className="h-8 w-40" maxLength={20} value={d.title} placeholder="Texto do botão" onChange={(e) => set(i, { title: e.target.value })} />
              <span className="ml-auto text-[11px] text-muted-foreground">{d.title.length}/20</span>
              <Button type="button" size="sm" variant="ghost" className="h-8" aria-label="Remover botão" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>
            </div>
            {d.kind === 'whatsapp' ? (
              <div className="mt-2 grid gap-2 md:grid-cols-[180px_1fr]">
                <Input className={cn('h-8', bad && 'border-destructive')} inputMode="tel" value={d.number} placeholder="(62) 99999-0000" onChange={(e) => set(i, { number: e.target.value })} />
                <Input className="h-8" value={d.message} placeholder="Mensagem que já vem escrita (opcional)" onChange={(e) => set(i, { message: e.target.value })} />
              </div>
            ) : (
              <Input className={cn('mt-2 h-8', bad && 'border-destructive')} value={d.url} placeholder="https://site-do-cliente.com.br" onChange={(e) => set(i, { url: e.target.value })} />
            )}
            {bad && <p className="mt-1 text-[11px] text-destructive">{d.kind === 'whatsapp' ? 'Confira o número: DDD + número, ex.: (62) 99999-0000.' : 'O link precisa começar com https:// e ter um endereço completo.'}</p>}
          </div>
        );
      })}
      {value.length < max && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 border-[#25D366]/50 text-xs" onClick={() => add('whatsapp')}><Plus size={12} /><MessageCircle size={12} className="text-[#25D366]" /> Botão de WhatsApp</Button>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 border-[#3797F0]/50 text-xs" onClick={() => add('link')}><Plus size={12} /><Globe size={12} className="text-[#3797F0]" /> Botão de site ou link</Button>
        </div>
      )}
    </div>
  );
}
