import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, Loader2, Printer, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { generateBriefingPdf } from '@/lib/briefingPdf';

const VERSIONS_API = 'https://agenciapulse.tech/api/briefing-versions';

interface VersionRow {
  id: string;
  version: number;
  briefing_data: any;
  editorial: string | null;
  submitted_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  companyName: string;
}

// Mesma legenda de campos usada em ClientBriefingView
const FIELD_MAP: Record<string, string> = {
  ownerName: 'Responsável', niche: 'Nicho', mainDifferential: 'Principal Diferencial',
  productsServices: 'Produtos / Serviços', businessGoals: 'Objetivos do Negócio',
  attendanceType: 'Forma de Atendimento', targetCities: 'Cidades-alvo',
  hasVisualIdentity: 'Possui Identidade Visual?', hasSite: 'Site',
  competitors: 'Concorrentes', digitalReferences: 'Referências Digitais',
  nicheReferences: 'Referências do Nicho', dislikedCommunication: 'Comunicação que Não Gosta',
  socialObjectives: 'Objetivos nas Redes', digitalDifficulty: 'Dificuldade no Digital',
  socialLinks: 'Links das Redes', importantTopics: 'Assuntos Importantes',
  comfortOnCamera: 'Conforto na Câmera', focusProducts: 'Produtos em Foco',
  businessDifficulty: 'Dificuldade no Negócio', desiredRecognition: 'Reconhecimento Desejado',
  undesiredRecognition: 'Reconhecimento Indesejado', contentReferences: 'Referências de Conteúdo',
  keywords: 'Palavras-chave', ageRangesTarget: 'Faixa Etária do Público',
  ageRangesBuyer: 'Faixa Etária de Quem Compra', isAuthority: 'É Autoridade?',
  educationLevel: 'Escolaridade', socialClass: 'Classe Social',
  clientUsesSocial: 'Cliente Usa Redes?', idealClient: 'Cliente Ideal',
  finalNotes: 'Considerações Finais', useRealPhotos: 'Usar Fotos Reais?',
};

const fmtVal = (v: any): string => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
};

const collectKeys = (a: any, b: any): string[] => {
  const ks = new Set<string>();
  [a, b].forEach(obj => {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(k => { if (!k.startsWith('_')) ks.add(k); });
    }
  });
  // ordena: campos conhecidos primeiro, na ordem do FIELD_MAP
  const known = Object.keys(FIELD_MAP).filter(k => ks.has(k));
  const extras = Array.from(ks).filter(k => !FIELD_MAP[k]).sort();
  return [...known, ...extras];
};

export default function BriefingVersionsDialog({ open, onOpenChange, clientId, companyName }: Props) {
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [leftId, setLeftId] = useState<string>('');
  const [rightId, setRightId] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const token = localStorage.getItem('auth_token') || '';
    fetch(`${VERSIONS_API}?clientId=${clientId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const list: VersionRow[] = data?.versions || [];
        setVersions(list);
        if (list.length >= 1) setLeftId(list[0].id); // mais recente
        if (list.length >= 2) setRightId(list[1].id); // anterior
        else if (list.length === 1) setRightId(list[0].id);
      })
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const left = useMemo(() => versions.find(v => v.id === leftId), [versions, leftId]);
  const right = useMemo(() => versions.find(v => v.id === rightId), [versions, rightId]);

  const keys = useMemo(() => collectKeys(left?.briefing_data, right?.briefing_data), [left, right]);

  const downloadVersionPdf = async (v?: VersionRow) => {
    if (!v) return;
    try {
      await generateBriefingPdf({
        companyName: `${companyName} (v${v.version})`,
        briefingData: v.briefing_data,
        editorial: v.editorial || '',
        submittedAt: v.submitted_at,
      });
    } catch {
      toast.error('Erro ao gerar PDF');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={18} /> Histórico de versões — {companyName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin mr-2" size={18} /> Carregando…
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhuma versão registrada ainda. As versões são criadas automaticamente quando o cliente envia o briefing.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Seletores */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Versão A (mais recente)</p>
                <Select value={leftId} onValueChange={setLeftId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        v{v.version} — {format(new Date(v.submitted_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-center pb-2">
                <ArrowLeftRight size={18} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Versão B (comparar com)</p>
                <Select value={rightId} onValueChange={setRightId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        v{v.version} — {format(new Date(v.submitted_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ações por lado */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-2">
                <Badge variant="outline">v{left?.version}</Badge>
                <Button size="sm" variant="ghost" onClick={() => downloadVersionPdf(left)} className="gap-1.5">
                  <Printer size={12} /> PDF
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-2">
                <Badge variant="outline">v{right?.version}</Badge>
                <Button size="sm" variant="ghost" onClick={() => downloadVersionPdf(right)} className="gap-1.5">
                  <Printer size={12} /> PDF
                </Button>
              </div>
            </div>

            {/* Comparação campo a campo */}
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-2 pr-2">
                {keys.map(k => {
                  const va = fmtVal(left?.briefing_data?.[k]);
                  const vb = fmtVal(right?.briefing_data?.[k]);
                  const changed = va !== vb;
                  return (
                    <div
                      key={k}
                      className={`grid grid-cols-2 gap-2 rounded-lg border p-2 ${changed ? 'border-primary/50 bg-primary/5' : 'border-border'}`}
                    >
                      <div className="col-span-2 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        <span>{FIELD_MAP[k] || k}</span>
                        {changed && <Badge className="text-[9px] px-1.5 py-0">alterado</Badge>}
                      </div>
                      <div className="text-xs whitespace-pre-line">{va}</div>
                      <div className={`text-xs whitespace-pre-line ${changed ? 'text-muted-foreground line-through' : ''}`}>{vb}</div>
                    </div>
                  );
                })}
                {keys.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Sem dados nessas versões.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
