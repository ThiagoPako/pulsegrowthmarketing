import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';
import { Database, Trash2, ExternalLink, FileText, Image, ZoomIn, AlertTriangle } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import type { Client } from '@/types';

interface Props {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ArtRecord {
  id: string;
  title: string;
  format_type: string;
  attachment_url: string | null;
  mockup_url: string | null;
  editable_file_url: string | null;
  kanban_column: string;
  completed_at: string | null;
  created_at: string;
  priority: string;
}

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed',
  story: 'Story',
  logomarca: 'Logomarca',
  midia_fisica: 'Mídia Física',
};

const COLUMN_LABELS: Record<string, string> = {
  nova_tarefa: 'Nova Tarefa',
  executando: 'Executando',
  analise_ia: 'Análise IA',
  em_analise: 'Em Análise',
  enviar_cliente: 'Enviar Cliente',
  aprovado: 'Aprovado',
  ajustes: 'Ajustes',
};

export default function ClientArtDatabaseDialog({ client, open, onOpenChange }: Props) {
  const { currentUser } = useApp();
  // Apagar todas as artes do cliente é irreversível: só o administrador vê o botão
  // (o servidor também recusa a exclusão em massa para os outros cargos).
  const canClear = currentUser?.role === 'admin';
  const [arts, setArts] = useState<ArtRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (open) {
      fetchArts();
      setConfirmClear(false);
      setConfirmName('');
    }
  }, [open, client.id]);

  const fetchArts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('design_tasks')
      .select('id, title, format_type, attachment_url, mockup_url, editable_file_url, kanban_column, completed_at, created_at, priority')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar banco de dados');
    } else {
      setArts((data as ArtRecord[]) || []);
    }
    setLoading(false);
  };

  const nameMatches = confirmName.trim().toLowerCase() === (client.companyName || '').trim().toLowerCase();

  const handleClearDatabase = async () => {
    if (!canClear || !nameMatches || clearing) return;
    setClearing(true);
    try {
      // Delete history first (FK constraint)
      const taskIds = arts.map(a => a.id);
      if (taskIds.length > 0) {
        // O vpsDb não lança erro: devolve { error }. Antes o erro era ignorado e a tela dizia "limpo".
        const { error: historyError } = await supabase.from('design_task_history').delete().in('task_id', taskIds);
        if (historyError) throw new Error(historyError.message || 'Erro ao apagar o histórico das artes');
        const { error: tasksError } = await supabase.from('design_tasks').delete().eq('client_id', client.id);
        if (tasksError) throw new Error(tasksError.message || 'Erro ao apagar as artes');
      }
      setArts([]);
      setConfirmClear(false);
      setConfirmName('');
      toast.success('Banco de dados do cliente limpo com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao limpar banco de dados');
      fetchArts();
    } finally {
      setClearing(false);
    }
  };

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);
  const approvedArts = arts.filter(a => a.kanban_column === 'aprovado');
  const inProgressArts = arts.filter(a => a.kanban_column !== 'aprovado');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <ClientLogo client={{ companyName: client.companyName, color: client.color, logoUrl: client.logoUrl }} size="sm" />
              <div>
                <span className="text-base">Banco de Dados — {client.companyName}</span>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  {arts.length} arte{arts.length !== 1 ? 's' : ''} registrada{arts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                ✅ {approvedArts.length} aprovada{approvedArts.length !== 1 ? 's' : ''}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                🔄 {inProgressArts.length} em andamento
              </Badge>
            </div>
            {!canClear ? null : !confirmClear ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                onClick={() => setConfirmClear(true)}
                disabled={arts.length === 0}
              >
                <Trash2 size={13} /> Limpar Banco de Dados
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-xs text-destructive font-medium flex items-center gap-1 text-right">
                  <AlertTriangle size={12} /> Apaga para sempre {arts.length} arte{arts.length !== 1 ? 's' : ''}
                  {inProgressArts.length > 0 ? `, incluindo ${inProgressArts.length} em andamento` : ''}, e o histórico.
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    value={confirmName}
                    onChange={e => setConfirmName(e.target.value)}
                    placeholder={`Digite "${client.companyName}" para confirmar`}
                    className="h-7 text-xs w-56"
                    autoFocus
                  />
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleClearDatabase} disabled={!nameMatches || clearing}>
                    {clearing ? 'Limpando...' : 'Sim, limpar tudo'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setConfirmClear(false); setConfirmName(''); }} disabled={clearing}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 -mx-6 px-6">
            {loading ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>
            ) : arts.length === 0 ? (
              <div className="text-center py-12">
                <Database size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma arte registrada para este cliente.</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {arts.map(art => {
                  const fileUrl = art.attachment_url || art.mockup_url;
                  return (
                    <div
                      key={art.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors group"
                    >
                      {/* Thumbnail */}
                      <div className="w-12 h-12 rounded-lg border border-border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                        {fileUrl && isImage(fileUrl) ? (
                          <button onClick={() => setPreviewImage(fileUrl)} className="w-full h-full relative group/thumb">
                            <img src={fileUrl} alt={art.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/30 transition-colors flex items-center justify-center">
                              <ZoomIn size={14} className="text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        ) : fileUrl ? (
                          <FileText size={18} className="text-muted-foreground/40" />
                        ) : (
                          <Image size={18} className="text-muted-foreground/20" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{art.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">
                            {FORMAT_LABELS[art.format_type] || art.format_type}
                          </Badge>
                          <Badge
                            variant={art.kanban_column === 'aprovado' ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {COLUMN_LABELS[art.kanban_column] || art.kanban_column}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(art.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {fileUrl && (
                          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <ExternalLink size={13} />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Image preview */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black/90 border-none">
          {previewImage && (
            <img src={previewImage} alt="Preview" className="w-full max-h-[80vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
