import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { getUpcomingSeasonalDates, NICHE_OPTIONS } from '@/lib/seasonalDates';
import { highlightQuotes, highlightQuotesForPdf, cleanHtml } from '@/lib/highlightQuotes';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { SCRIPT_VIDEO_TYPE_LABELS, SCRIPT_PRIORITY_LABELS, SCRIPT_CONTENT_FORMAT_LABELS } from '@/types';
import type { Script, ScriptVideoType, ScriptPriority, ScriptContentFormat } from '@/types';
import { useEndoClientes } from '@/hooks/useEndomarketing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, FileText, Download, Check, Eye, Search, Filter, AlertTriangle, Star, Eraser, Sparkles
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import pulseHeader from '@/assets/pulse_header.png';
import ClientLogo from '@/components/ClientLogo';

const VIDEO_TYPES: ScriptVideoType[] = ['vendas', 'institucional', 'reconhecimento', 'educacional', 'bastidores', 'depoimento', 'lancamento'];
const CONTENT_FORMATS: ScriptContentFormat[] = ['reels', 'story', 'criativo'];

function RichEditor({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none',
      },
      transformPastedHTML(html) {
        // Strip all inline styles and unnecessary spans from pasted content
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
        doc.querySelectorAll('span').forEach(span => {
          // Unwrap empty spans (no meaningful attributes left)
          if (!span.attributes.length) {
            span.replaceWith(...Array.from(span.childNodes));
          }
        });
        return doc.body.innerHTML;
      },
    },
  });

  // Sync external content changes into the editor (e.g. AI generation)
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `p-1.5 rounded text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'}`;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex flex-wrap gap-1 p-2 border-b border-border bg-muted/30">
        <button type="button" className={btnClass(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </button>
        <button type="button" className={btnClass(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </button>
        <button type="button" className={btnClass(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button type="button" className={btnClass(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </button>
        <button type="button" className={btnClass(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button type="button" className={btnClass(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button type="button" className={btnClass(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          ≡
        </button>
        <button type="button" className={btnClass(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          ≡̈
        </button>
        <button type="button" className={btnClass(editor.isActive({ textAlign: 'right' }))} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          ≡̃
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button type="button" className={btnClass(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • Lista
        </button>
        <button type="button" className={btnClass(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. Lista
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button type="button" className={btnClass(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          ❝ Citação
        </button>
        <button type="button" className={btnClass(false)} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          — Linha
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export default function Scripts() {
  const { clients, scripts, addScript, updateScript, deleteScript } = useApp();
  const { user } = useAuth();
  const { clientes: endoClientes } = useEndoClientes();
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editing, setEditing] = useState<Script | null>(null);
  const [viewing, setViewing] = useState<Script | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterEndo, setFilterEndo] = useState<'all' | 'video' | 'endo'>('all');
  const [showRecorded, setShowRecorded] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    clientId: '',
    title: '',
    videoType: 'vendas' as ScriptVideoType,
    contentFormat: 'reels' as ScriptContentFormat,
    content: '',
    caption: '',
    priority: 'normal' as ScriptPriority,
    isEndomarketing: false,
    endoClientId: '' as string,
    scheduledDate: '' as string,
    directToEditing: false,
  });

  const printRef = useRef<HTMLDivElement>(null);

  const filteredScripts = useMemo(() => {
    let result = showRecorded ? scripts : scripts.filter(s => !s.recorded);
    if (filterEndo === 'endo') result = result.filter(s => s.isEndomarketing);
    else if (filterEndo === 'video') result = result.filter(s => !s.isEndomarketing);
    if (filterClient !== 'all') result = result.filter(s => s.clientId === filterClient);
    if (filterType !== 'all') result = result.filter(s => s.videoType === filterType);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(term) ||
        clients.find(c => c.id === s.clientId)?.companyName.toLowerCase().includes(term)
      );
    }
    return result.sort((a, b) => {
      const priorityOrder = { urgent: 0, priority: 1, normal: 2 };
      const pA = priorityOrder[a.priority || 'normal'];
      const pB = priorityOrder[b.priority || 'normal'];
      if (pA !== pB) return pA - pB;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [scripts, filterClient, filterType, filterEndo, searchTerm, clients, showRecorded]);

  const handleOpen = (script?: Script) => {
    if (script) {
      setEditing(script);
      // Load caption from DB
      supabase.from('scripts').select('caption').eq('id', script.id).single().then(({ data }) => {
        setForm({
          clientId: script.clientId, title: script.title, videoType: script.videoType,
          contentFormat: script.contentFormat || 'reels',
          content: script.content, caption: (data as any)?.caption || '',
          priority: script.priority || 'normal',
          isEndomarketing: script.isEndomarketing || false,
          endoClientId: script.endoClientId || '',
          scheduledDate: script.scheduledDate || '',
          directToEditing: script.directToEditing || false,
        });
      });
    } else {
      setEditing(null);
      setForm({ clientId: '', title: '', videoType: 'vendas', contentFormat: 'reels', content: '', caption: '', priority: 'normal', isEndomarketing: false, endoClientId: '', scheduledDate: '', directToEditing: false });
    }
    setOpen(true);
  };

  const generateCaptionFromContent = async (content: string, clientId: string): Promise<string> => {
    try {
      const client = clients.find(c => c.id === clientId);
      if (!client) return '';
      
      const { data: aiIntegration } = await supabase
        .from('api_integrations')
        .select('config')
        .in('provider', ['ai_gemini', 'ai_openai', 'ai_claude'])
        .eq('status', 'ativo')
        .limit(1)
        .single();
      const aiModel = (aiIntegration as any)?.config?.ai_model || undefined;
      const aiProvider = (aiIntegration as any)?.config?.ai_provider || undefined;

      const { data, error } = await supabase.functions.invoke('generate-caption', {
        body: {
          scriptContent: content.replace(/<[^>]*>/g, '').slice(0, 2000),
          clientName: client.companyName,
          niche: client.niche || '',
          aiModel,
          aiProvider,
        },
      });
      if (error) throw error;
      return data?.caption || '';
    } catch (err) {
      console.error('Auto caption generation error:', err);
      return '';
    }
  };

  const handleSave = async () => {
    if (!form.clientId || !form.title) {
      toast.error('Preencha o cliente e o título'); return;
    }
    if (form.isEndomarketing && !form.endoClientId) {
      toast.error('Selecione o cliente de endomarketing'); return;
    }

    // Auto-generate caption if content exists but caption is empty
    let captionToSave = form.caption;
    if (form.content && form.content.trim() && !form.caption.trim()) {
      toast.info('Gerando legenda automaticamente...');
      const autoCaption = await generateCaptionFromContent(form.content, form.clientId);
      if (autoCaption) {
        captionToSave = autoCaption;
        setForm(prev => ({ ...prev, caption: autoCaption }));
      }
    }

    const now = new Date().toISOString();
    const scriptData = {
      ...form,
      caption: captionToSave,
      endoClientId: form.endoClientId || undefined,
      scheduledDate: form.scheduledDate || undefined,
      directToEditing: form.directToEditing,
    };
    if (editing) {
      updateScript({ ...editing, ...scriptData, updatedAt: now });
      await supabase.from('scripts').update({ caption: captionToSave } as any).eq('id', editing.id);
      toast.success('Roteiro atualizado');
    } else {
      const scriptId = crypto.randomUUID();
      const scriptObj = { ...scriptData, id: scriptId, recorded: false, createdAt: now, updatedAt: now, createdBy: user?.id || undefined };
      
      await addScript(scriptObj);
      if (captionToSave) {
        await supabase.from('scripts').update({ caption: captionToSave } as any).eq('id', scriptId);
      }
      
      // Determine kanban column and assignment based on directToEditing
      let kanbanColumn = 'ideias';
      let assignedTo: string | null = null;

      if (form.directToEditing) {
        // Check if there are tasks in editing queue
        const { data: editingTasks } = await supabase
          .from('content_tasks')
          .select('id')
          .eq('kanban_column', 'edicao');
        
        if (!editingTasks || editingTasks.length === 0) {
          // No tasks in editing → assign to least-busy editor and put in edicao
          kanbanColumn = 'edicao';
          const { data: editors } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'editor');
          
          if (editors && editors.length > 0) {
            // Find editor with fewest content_tasks assigned
            let minTasks = Infinity;
            let leastBusyEditor: string | null = null;
            for (const editor of editors) {
              const { data: editorTasks } = await supabase
                .from('content_tasks')
                .select('id')
                .eq('assigned_to', (editor as any).id)
                .in('kanban_column', ['edicao', 'revisao']);
              const count = editorTasks?.length || 0;
              if (count < minTasks) {
                minTasks = count;
                leastBusyEditor = (editor as any).id;
              }
            }
            assignedTo = leastBusyEditor;
          }
        } else {
          // There are tasks in editing → put in waiting (aguardando_edicao)
          kanbanColumn = 'aguardando_edicao';
        }
      }

      const { error } = await supabase.from('content_tasks').insert({
        client_id: form.clientId,
        title: form.title,
        content_type: form.contentFormat || 'reels',
        kanban_column: kanbanColumn,
        script_id: scriptId,
        description: form.directToEditing ? 'Material pronto do cliente — direto para edição' : null,
        created_by: user?.id || null,
        assigned_to: assignedTo,
      } as any);
      if (error) console.error('Auto content_task creation error:', error);
      
      toast.success('Roteiro criado');
    }
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    // Delete linked content_task first
    await supabase.from('content_tasks').delete().eq('script_id', id);
    deleteScript(id);
    toast.success('Roteiro removido');
  };

  const toggleRecorded = (script: Script) => {
    updateScript({ ...script, recorded: !script.recorded, updatedAt: new Date().toISOString() });
    toast.success(script.recorded ? 'Marcado como pendente' : 'Marcado como gravado');
  };

  const handleDownloadPdf = useCallback(async (script: Script) => {
    const client = clients.find(c => c.id === script.clientId);
    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');

    // Create a temporary div for rendering
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;padding:0;';
    container.innerHTML = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a;">
        <div style="margin-bottom:0;">
          <img src="${pulseHeader}" style="width:100%; display:block;" />
        </div>
        <div style="padding: 30px 40px;">
          <h1 style="font-size:22px; margin:0 0 6px;">${script.title}</h1>
          <p style="font-size:13px; color:#666; margin:0 0 20px;">
            ${client?.companyName || 'Cliente'} · ${SCRIPT_VIDEO_TYPE_LABELS[script.videoType]} · ${new Date(script.updatedAt).toLocaleDateString('pt-BR')}
          </p>
          <div style="font-size:14px; line-height:1.7;">
            ${highlightQuotesForPdf(script.content)}
          </div>
          <div style="margin-top:40px; padding-top:16px; border-top:1px solid #e5e5e5; text-align:center;">
            <p style="font-size:11px; color:#999;">Roteiro gerado por Pulse · ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`roteiro-${script.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
      toast.success('PDF baixado');
    } finally {
      document.body.removeChild(container);
    }
  }, [clients]);

  const handleCleanAll = () => {
    let count = 0;
    scripts.forEach(script => {
      const cleaned = cleanHtml(script.content);
      if (cleaned !== script.content) {
        updateScript({ ...script, content: cleaned, updatedAt: new Date().toISOString() });
        count++;
      }
    });
    toast.success(count > 0 ? `${count} roteiro(s) limpo(s)` : 'Nenhum roteiro precisava de limpeza');
  };

  const handleGenerateScript = async () => {
    if (!form.clientId) { toast.error('Selecione um cliente primeiro'); return; }
    const client = clients.find(c => c.id === form.clientId);
    if (!client) return;
    
    // Collect existing scripts as examples for the AI to learn style/format
    const exampleScripts = scripts
      .filter(s => s.content && s.content.length > 50 && !s.recorded !== undefined)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)
      .map(s => ({
        title: s.title,
        videoType: s.videoType,
        contentFormat: s.contentFormat || 'reels',
        clientName: clients.find(c => c.id === s.clientId)?.companyName || '',
        content: s.content.replace(/<[^>]*>/g, '').substring(0, 800),
      }));

    // Prioritize same video type examples
    const sameTypeExamples = exampleScripts.filter(e => e.videoType === form.videoType);
    const otherExamples = exampleScripts.filter(e => e.videoType !== form.videoType);
    const orderedExamples = [...sameTypeExamples, ...otherExamples].slice(0, 3);

    setGenerating(true);
    try {
      // Fetch configured AI provider and model
      const { data: aiIntegration } = await supabase
        .from('api_integrations')
        .select('config')
        .in('provider', ['ai_gemini', 'ai_openai', 'ai_claude'])
        .eq('status', 'ativo')
        .limit(1)
        .single();
      const aiModel = (aiIntegration as any)?.config?.ai_model || undefined;
      const aiProvider = (aiIntegration as any)?.config?.ai_provider || undefined;

      const { data, error } = await supabase.functions.invoke('generate-script', {
        body: {
          editorial: client.editorial || '',
          videoType: form.videoType,
          contentFormat: form.contentFormat,
          clientName: client.companyName,
          niche: client.niche || '',
          exampleScripts: orderedExamples,
          aiModel,
          aiProvider,
        },
      });
      if (error) throw error;
      if (data?.content) {
        // Convert markdown-like content to basic HTML
        const htmlContent = data.content
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br/>')
          .replace(/^/, '<p>')
          .replace(/$/, '</p>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        setForm(prev => ({ ...prev, content: htmlContent, caption: data.caption || prev.caption }));
        if (!form.title) {
          const autoTitle = `${SCRIPT_VIDEO_TYPE_LABELS[form.videoType]} - ${client.companyName}`;
          setForm(prev => ({ ...prev, title: autoTitle }));
        }
        toast.success('Roteiro gerado com sucesso!');
      }
    } catch (err) {
      console.error('Generate script error:', err);
      toast.error('Erro ao gerar roteiro. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClientColor = (id: string) => clients.find(c => c.id === id)?.color || '220 10% 50%';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold">Roteiros</h1>
        <div className="flex items-center gap-2">
          {scripts.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleCleanAll}>
              <Eraser size={14} className="mr-1.5" /> Limpar Formatação
            </Button>
          )}
          <Button onClick={() => handleOpen()}><Plus size={16} className="mr-2" /> Novo Roteiro</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar roteiros..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([['all', 'Todos'], ['video', '🎬 Vídeo'], ['endo', '✨ Endomarketing']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilterEndo(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterEndo === key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            {VIDEO_TYPES.map(t => <SelectItem key={t} value={t}>{SCRIPT_VIDEO_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <Switch checked={showRecorded} onCheckedChange={setShowRecorded} id="show-recorded" />
          <Label htmlFor="show-recorded" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
            Mostrar gravados
          </Label>
        </div>
      </div>

      {/* Scripts list */}
      {filteredScripts.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <FileText size={40} className="mx-auto mb-3 opacity-50" />
          <p>Nenhum roteiro encontrado</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredScripts.map(script => (
            <div key={script.id} className={`glass-card p-4 flex flex-col gap-3 transition-opacity ${script.recorded ? 'opacity-50 grayscale-[30%]' : ''}`}
              style={{ borderLeftWidth: 4, borderLeftColor: `hsl(${getClientColor(script.clientId)})` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {(() => { const cl = clients.find(c => c.id === script.clientId); return cl ? <ClientLogo client={cl} size="sm" className="w-5 h-5 text-[8px] rounded" /> : null; })()}
                    {(script.priority === 'urgent') && <AlertTriangle size={13} className="text-destructive shrink-0" />}
                    {(script.priority === 'priority') && <Star size={13} className="text-warning shrink-0" />}
                    <p className="font-medium text-sm truncate">{script.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate ml-6">
                    {getClientName(script.clientId)} · {SCRIPT_VIDEO_TYPE_LABELS[script.videoType]} · <span className="font-medium">{SCRIPT_CONTENT_FORMAT_LABELS[script.contentFormat || 'reels']}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={script.recorded ? 'default' : 'outline'} className={`text-[10px] ${script.recorded ? 'bg-success text-success-foreground' : ''}`}>
                    {script.recorded ? 'Gravado' : 'Pendente'}
                  </Badge>
                  {script.isEndomarketing && (
                    <Badge className="text-[9px] border-0" style={{ backgroundColor: 'hsl(292 84% 61% / 0.2)', color: 'hsl(292 84% 61%)' }}>
                      <Sparkles size={8} className="mr-0.5" /> Endo
                    </Badge>
                  )}
                  {script.priority === 'urgent' && (
                    <Badge className="text-[9px] bg-destructive/20 text-destructive border-destructive/30">Urgente</Badge>
                  )}
                  {script.priority === 'priority' && (
                    <Badge className="text-[9px] bg-warning/20 text-warning border-warning/30">Prioritário</Badge>
                  )}
                  {script.scheduledDate && (
                    <span className="text-[9px] text-muted-foreground">{new Date(script.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground line-clamp-3"
                dangerouslySetInnerHTML={{ __html: highlightQuotes(script.content) || '<em>Sem conteúdo</em>' }} />

              <div className="flex items-center gap-1 mt-auto pt-2 border-t border-border">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Visualizar"
                  onClick={() => { setViewing(script); setViewOpen(true); }}>
                  <Eye size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => handleOpen(script)}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Baixar PDF" onClick={() => handleDownloadPdf(script)}>
                  <Download size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title={script.recorded ? 'Desmarcar gravado' : 'Marcar como gravado'}
                  onClick={() => toggleRecorded(script)}>
                  <Check size={14} className={script.recorded ? 'text-success' : ''} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" title="Excluir" onClick={() => handleDelete(script.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Atualizado em {new Date(script.updatedAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Roteiro' : 'Novo Roteiro'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Cliente *</Label>
                <Select value={form.clientId} onValueChange={v => setForm({ ...form, clientId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: `hsl(${c.color})` }} />
                          {c.companyName}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de Vídeo</Label>
                <Select value={form.videoType} onValueChange={v => setForm({ ...form, videoType: v as ScriptVideoType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_TYPES.map(t => <SelectItem key={t} value={t}>{SCRIPT_VIDEO_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Formato do Conteúdo</Label>
                <Select value={form.contentFormat} onValueChange={v => setForm({ ...form, contentFormat: v as ScriptContentFormat })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_FORMATS.map(f => <SelectItem key={f} value={f}>{SCRIPT_CONTENT_FORMAT_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Client editorial context + Generate button */}
            {form.clientId && (() => {
              const selectedClient = clients.find(c => c.id === form.clientId);
              if (!selectedClient) return null;
              return (
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <FileText size={14} /> Contexto do Cliente
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleGenerateScript}
                      disabled={generating}
                      className="gap-1.5 bg-gradient-to-r from-primary to-primary/80"
                    >
                      <Sparkles size={14} className={generating ? 'animate-spin' : ''} />
                      {generating ? 'Gerando...' : 'Gerar Roteiro com IA'}
                    </Button>
                  </div>
                  {selectedClient.editorial ? (
                    <div className="text-xs text-muted-foreground bg-background/60 rounded-lg p-3 max-h-24 overflow-y-auto border border-border/50">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Linha Editorial</p>
                      {selectedClient.editorial}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      ⚠️ Este cliente não possui linha editorial cadastrada. O roteiro será gerado com base no nicho e tipo de vídeo. 
                      Para melhores resultados, cadastre a linha editorial no perfil do cliente.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Seasonal dates alert */}
            {(() => {
              const selectedClient = clients.find(c => c.id === form.clientId);
              if (!selectedClient?.niche) return null;
              const nicheLabel = NICHE_OPTIONS.find(n => n.value === selectedClient.niche)?.label || selectedClient.niche;
              const upcoming = getUpcomingSeasonalDates(selectedClient.niche, 90);
              if (upcoming.length === 0) return null;
              return (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                  <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> Datas sazonais próximas — {nicheLabel}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {upcoming.slice(0, 10).map((d, i) => (
                      <Badge key={i} variant="outline" className={`text-[11px] ${d.daysUntil <= 10 ? 'border-red-500 text-red-600 bg-red-500/10' : d.daysUntil <= 20 ? 'border-amber-500 text-amber-600 bg-amber-500/10' : 'border-green-500 text-green-600 bg-green-500/10'}`}>
                        {d.label} — {d.daysUntil}d
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as ScriptPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="priority">⭐ Prioritário</SelectItem>
                  <SelectItem value="urgent">🚨 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Endomarketing toggle */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <Switch checked={form.isEndomarketing} onCheckedChange={v => setForm({ ...form, isEndomarketing: v, endoClientId: v ? form.endoClientId : '' })} />
              <Label className="font-medium flex items-center gap-1.5">
                <Sparkles size={14} style={{ color: 'hsl(292 84% 61%)' }} /> Roteiro de Endomarketing
              </Label>
            </div>

            {form.isEndomarketing && (
              <div className="p-4 rounded-xl border border-border space-y-3" style={{ backgroundColor: 'hsl(292 84% 61% / 0.05)', borderColor: 'hsl(292 84% 61% / 0.2)' }}>
                <div className="space-y-1">
                  <Label>Cliente de Endomarketing *</Label>
                  <Select value={form.endoClientId} onValueChange={v => setForm({ ...form, endoClientId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {endoClientes.filter(c => c.active).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Data programada (opcional)</Label>
                  <Input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} />
                  <p className="text-[11px] text-muted-foreground">Se definida, o roteiro aparecerá na agenda do dia selecionado</p>
                </div>
              </div>
            )}

            {/* Direct to editing toggle */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-accent/30">
              <Switch checked={form.directToEditing} onCheckedChange={v => setForm({ ...form, directToEditing: v })} />
              <div>
                <Label className="font-medium flex items-center gap-1.5">
                  🎬 Direto para Edição
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Para materiais prontos do cliente. Fica em espera e sobe automaticamente para o editor com menos tarefas quando a fila esvaziar.
                </p>
              </div>
            </div>

              <Label>Título do Roteiro *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Roteiro de Vendas - Black Friday" />
            </div>

            <div className="space-y-1">
              <Label>Conteúdo do Roteiro</Label>
              <RichEditor key={editing?.id || 'new'} content={form.content} onChange={html => setForm(prev => ({ ...prev, content: html }))} />
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                📝 Legenda para Instagram
                {form.caption && <Badge variant="outline" className="text-[9px]">{form.caption.length}/200</Badge>}
              </Label>
              <Textarea 
                value={form.caption} 
                onChange={e => setForm(prev => ({ ...prev, caption: e.target.value.slice(0, 200) }))} 
                placeholder="Legenda curta com CTA para a postagem..." 
                rows={2}
                maxLength={200}
              />
              <p className="text-[10px] text-muted-foreground">Gerada automaticamente pela IA junto com o roteiro. Você pode editar manualmente.</p>
            </div>

            <Button onClick={handleSave} className="w-full">{editing ? 'Salvar Alterações' : 'Criar Roteiro'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: `hsl(${getClientColor(viewing.clientId)})` }} />
                  {viewing.title}
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{getClientName(viewing.clientId)}</span>
                <span>·</span>
                <Badge variant="outline" className="text-[10px]">{SCRIPT_VIDEO_TYPE_LABELS[viewing.videoType]}</Badge>
                <span>·</span>
                <Badge variant="outline" className="text-[10px]">{SCRIPT_CONTENT_FORMAT_LABELS[viewing.contentFormat || 'reels']}</Badge>
                <span>·</span>
                <Badge variant={viewing.recorded ? 'default' : 'outline'} className={`text-[10px] ${viewing.recorded ? 'bg-success text-success-foreground' : ''}`}>
                  {viewing.recorded ? 'Gravado' : 'Pendente'}
                </Badge>
              </div>
              <div className="prose prose-sm max-w-none mt-4 p-4 rounded-xl bg-muted/30 border border-border"
                dangerouslySetInnerHTML={{ __html: highlightQuotes(viewing.content) || '<em>Sem conteúdo</em>' }} />
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => handleDownloadPdf(viewing)}>
                  <Download size={16} className="mr-2" /> Baixar PDF
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => toggleRecorded(viewing)}>
                  <Check size={16} className="mr-2" /> {viewing.recorded ? 'Desmarcar Gravado' : 'Marcar como Gravado'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
