import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  MapPin, UserPlus, Building2, Phone, Mail, Globe, Instagram, Facebook,
  Clock, MessageCircle, Map, Copy, PhoneCall, ShieldCheck, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { Company, brl, CLASS_LABEL, CONFIDENCE_LABEL, classTone } from './harvestTypes';

interface LeadCardProps {
  company: Company;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onSendToCrm: () => void;
  sending: boolean;
}

const copy = (value: string, label: string) => {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copiado.`);
};

export function LeadCard({ company, selected, onToggle, onSendToCrm, sending }: LeadCardProps) {
  const naoIdentificado = <span className="text-muted-foreground">Não identificado</span>;

  return (
    <Card
      className={`p-5 flex flex-col gap-4 border shadow-sm hover:shadow-md transition-all overflow-hidden ${selected ? 'border-primary ring-1 ring-primary/40' : 'border-transparent'}`}
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
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {company.cidade}</span>
            {company.cnpj && <span>CNPJ {company.cnpj}</span>}
          </div>
        </div>
        <Checkbox
          aria-label={`Selecionar ${company.razao_social}`}
          checked={selected}
          onCheckedChange={(v) => onToggle(Boolean(v))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className={`p-2 rounded-lg space-y-1 ${classTone(company.classificacao)}`}>
          <p className="font-semibold uppercase tracking-tighter">{CLASS_LABEL[company.classificacao || 'fraco']}</p>
          <p className="font-bold text-base">{company.score ?? 0}/100</p>
        </div>
        <div className="p-2 rounded-lg bg-muted/50 space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-tighter">Completude</p>
          <p className="font-bold text-base">{company.completude ?? 0}%</p>
          <Progress value={company.completude ?? 0} className="h-1" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {CONFIDENCE_LABEL[company.confianca || 'nao_confirmado']}
        </Badge>
        <Badge variant="outline">Potencial {brl(company.potencial_mensal)}/mês</Badge>
        {company.fontes?.length ? <Badge variant="outline">Fontes: {company.fontes.join(', ')}</Badge> : null}
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-1 text-xs">
        <p className="flex items-center gap-1.5 font-semibold text-primary uppercase tracking-tight text-[10px]">
          <UserPlus className="h-3 w-3" /> Responsável
        </p>
        <p className="font-medium truncate">
          {company.decisor || naoIdentificado}
          {company.decisor_cargo ? <span className="text-muted-foreground font-normal"> • {company.decisor_cargo}</span> : null}
        </p>
        {company.socios?.length ? (
          <p className="text-[10px] text-muted-foreground truncate">Sócios: {company.socios.join(' | ')}</p>
        ) : null}
      </div>

      <div className="space-y-1.5 text-xs">
        <p className="flex items-start gap-2">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {company.endereco || 'Não identificado'}{company.cep ? ` • ${company.cep}` : ''}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {company.telefones?.length ? <span className="font-medium">{company.telefones.join(' | ')}</span> : naoIdentificado}
        </p>
        <p className="flex items-center gap-2">
          <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {company.whatsapp
            ? <span className="font-medium">WhatsApp {company.whatsapp_status === 'confirmado' ? 'confirmado' : 'provável'}</span>
            : naoIdentificado}
        </p>
        <p className="flex items-center gap-2 truncate">
          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {company.email ? <span className="truncate font-medium">{company.email}</span> : naoIdentificado}
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
        {company.telefone && (
          <>
            <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
              <a href={`tel:${company.telefone.replace(/\D/g, '')}`}>
                <PhoneCall className="h-3.5 w-3.5" /> Ligar
              </a>
            </Button>
            <Button size="sm" variant="ghost" className="gap-1 h-8 text-xs" onClick={() => copy(company.telefone, 'Telefone')}>
              <Copy className="h-3.5 w-3.5" /> Telefone
            </Button>
          </>
        )}
        {company.email && (
          <Button size="sm" variant="ghost" className="gap-1 h-8 text-xs" onClick={() => copy(company.email, 'E-mail')}>
            <Copy className="h-3.5 w-3.5" /> E-mail
          </Button>
        )}
        {company.website && (
          <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
            <a href={company.website} target="_blank" rel="noopener noreferrer"><Globe className="h-3.5 w-3.5" /> Site</a>
          </Button>
        )}
        {company.instagram && (
          <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
            <a href={company.instagram} target="_blank" rel="noopener noreferrer"><Instagram className="h-3.5 w-3.5" /> Instagram</a>
          </Button>
        )}
        {company.facebook && (
          <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
            <a href={company.facebook} target="_blank" rel="noopener noreferrer"><Facebook className="h-3.5 w-3.5" /> Facebook</a>
          </Button>
        )}
        {company.maps_url && (
          <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
            <a href={company.maps_url} target="_blank" rel="noopener noreferrer"><Map className="h-3.5 w-3.5" /> Mapa</a>
          </Button>
        )}
      </div>

      {company.historico?.length ? (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer flex items-center gap-1"><History className="h-3 w-3" /> Histórico de enriquecimento</summary>
          <ul className="mt-1 space-y-0.5 pl-4 list-disc">
            {company.historico.map((h, i) => (
              <li key={i}>{new Date(h.em).toLocaleDateString('pt-BR')} — {h.evento}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <Button className="w-full gap-2 mt-auto bg-primary/90 hover:bg-primary" onClick={onSendToCrm} disabled={sending}>
        <UserPlus className="h-4 w-4" />
        {sending ? 'Enviando...' : 'Enviar para CRM'}
      </Button>
    </Card>
  );
}
