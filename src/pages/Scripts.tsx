import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { NICHE_OPTIONS } from '@/lib/seasonalDates';
import { highlightQuotes, highlightQuotesForPdf, cleanHtml } from '@/lib/highlightQuotes';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import type { Recording } from '@/types';
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
  Plus, Pencil, Trash2, FileText, Download, Check, Eye, Search, Filter, AlertTriangle, Star, Eraser, Sparkles, Bell, BellOff, CheckSquare, Square, X, Video, Maximize, AlignJustify, Type
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import pulseHeader from '@/assets/pulse_header.png';
import ClientLogo from '@/components/ClientLogo';

const VIDEO_TYPES: ScriptVideoType[] = ['vendas', 'institucional', 'reconhecimento', 'educacional', 'bastidores', 'depoimento', 'lancamento', 'evento'];
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
  const { clients, scripts, recordings, addScript, updateScript, deleteScript, refetchData } = useApp();
  const { user, profile } = useAuth();
  const isEditorRole = profile?.role === 'editor';
  const { clientes: endoClientes } = useEndoClientes();
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewFontSize, setViewFontSize] = useState(0);
  const [editing, setEditing] = useState<Script | null>(null);
  const [viewing, setViewing] = useState<Script | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterEndo, setFilterEndo] = useState<'all' | 'video' | 'endo'>('all');
  const [showRecorded, setShowRecorded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scriptAlerts, setScriptAlerts] = useState(() => {
    const stored = localStorage.getItem('pulse_script_alerts');
    return stored !== null ? stored === 'true' : true;
  });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingBatch, setDownloadingBatch] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPages, setPreviewPages] = useState<HTMLDivElement[]>([]);
  const [pdfConfig, setPdfConfig] = useState(() => {
    const stored = localStorage.getItem('pulse_pdf_config');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing pdf config', e);
      }
    }
    return {
      padding: 28,
      lineHeight: 1.75,
      fontSize: 14,
      minPadding: 15,
      minLineHeight: 1.3,
      minFontSize: 10,
    };
  });

  // Save config changes
  useEffect(() => {
    localStorage.setItem('pulse_pdf_config', JSON.stringify(pdfConfig));
  }, [pdfConfig]);
  const [overflowWarnings, setOverflowWarnings] = useState<number[]>([]);
  const [isAutoCorrecting, setIsAutoCorrecting] = useState(false);

  const toggleScriptAlerts = (v: boolean) => {
    setScriptAlerts(v);
    localStorage.setItem('pulse_script_alerts', String(v));
    toast.success(v ? 'Alertas de roteiros ativados' : 'Alertas de roteiros desativados');
  };

  const clientsLowScripts = useMemo(() => {
    if (!scriptAlerts) return [];
    // Only show alerts for active clients
    const activeClients = clients.filter(c => (c as any).status !== 'cancelado');
    return activeClients
      .map(c => {
        const count = scripts.filter(s => s.clientId === c.id && !s.recorded).length;
        return { client: c, count };
      })
      .filter(x => x.count < 3)
      .sort((a, b) => a.count - b.count);
  }, [clients, scripts, scriptAlerts]);

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
    isAvulso: false,
    recordingId: '' as string,
    prospectName: '' as string,
    materialLink: '' as string,
    campaignSlotId: '' as string,
    campaignName: '' as string,
  });

  // Avulso recordings (type=avulso, with prospect_name)
  const avulsoRecordings = useMemo(() => {
    return recordings.filter(r => r.type === 'avulso' && r.prospectName);
  }, [recordings]);

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
          isAvulso: !!script.recordingId || !script.clientId,
          recordingId: script.recordingId || '',
          prospectName: script.recordingId ? (recordings.find(r => r.id === script.recordingId)?.prospectName || '') : '',
          materialLink: '',
        });
      });
    } else {
      setEditing(null);
      setForm({ clientId: '', title: '', videoType: 'vendas', contentFormat: 'reels', content: '', caption: '', priority: 'normal', isEndomarketing: false, endoClientId: '', scheduledDate: '', directToEditing: isEditorRole ? true : false, isAvulso: false, recordingId: '', prospectName: '', materialLink: '' });
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
    if (form.isAvulso) {
      if (!form.recordingId || !form.title) {
        toast.error('Selecione a gravação avulsa e preencha o título'); return;
      }
    } else {
      if (!form.clientId || !form.title) {
        toast.error('Preencha o cliente e o título'); return;
      }
    }
    if (form.isEndomarketing && !form.endoClientId) {
      toast.error('Selecione o cliente de endomarketing'); return;
    }

    // Auto-generate caption if content exists but caption is empty (skip for stories)
    let captionToSave = form.contentFormat === 'story' ? '' : form.caption;
    if (form.contentFormat !== 'story' && form.content && form.content.trim() && !form.caption.trim() && form.clientId) {
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
      clientId: form.isAvulso ? '' : form.clientId,
      caption: captionToSave,
      endoClientId: form.endoClientId || undefined,
      scheduledDate: form.scheduledDate || undefined,
      directToEditing: form.directToEditing,
      recordingId: form.isAvulso ? form.recordingId : undefined,
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
        // Always go to edicao column
        kanbanColumn = 'edicao';
        
        // Find least-busy editor
        const { data: editors } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'editor');
        
        if (editors && editors.length > 0) {
          let minTasks = Infinity;
          let leastBusyEditor: string | null = null;
          
          for (const editor of editors) {
            // Count active tasks for this editor
            const { data: editorTasks } = await supabase
              .from('content_tasks')
              .select('id')
              .eq('assigned_to', (editor as any).id)
              .in('kanban_column', ['edicao', 'revisao', 'alteracao']);
            
            const count = editorTasks?.length || 0;
            if (count < minTasks) {
              minTasks = count;
              leastBusyEditor = (editor as any).id;
            }
          }
          assignedTo = leastBusyEditor;
        }
      }

      // Create content_task if it has a client or is an avulso recording
      if (form.clientId || (form.isAvulso && form.recordingId)) {
        const contentTaskId = crypto.randomUUID();
        const { error } = await supabase.from('content_tasks').insert({
          id: contentTaskId,
          client_id: form.clientId || null,
          title: form.title,
          content_type: form.contentFormat || 'reels',
          kanban_column: kanbanColumn,
          script_id: scriptId,
          recording_id: form.recordingId || null,
          description: form.directToEditing ? 'Material pronto do cliente — direto para edição' : null,
          created_by: user?.id || null,
          assigned_to: assignedTo,
          drive_link: (form.directToEditing && form.materialLink) ? form.materialLink : null,
        } as any);

        if (error) {
          console.error('Auto content_task creation error:', error);
          toast.error('Erro ao criar tarefa de conteúdo');
        } else {
          // Verification: check if the card was actually created and is in the correct column
          const { data: verifiedTask, error: verifyError } = await supabase
            .from('content_tasks')
            .select('id, kanban_column, assigned_to')
            .eq('id', contentTaskId)
            .single();

          if (verifyError || !verifiedTask) {
            console.error('Task verification failed:', verifyError);
            toast.error('Erro ao verificar criação da tarefa');
          } else if (form.directToEditing && (verifiedTask.kanban_column !== 'edicao' || (assignedTo && verifiedTask.assigned_to !== assignedTo))) {
            console.warn('Task created but mismatch in column/assignment:', verifiedTask);
            toast.warning('Tarefa criada mas com divergência na coluna ou editor');
          }

          // Trigger full sync for directToEditing so it behaves like a recorded task entering edicao
          if (form.directToEditing && kanbanColumn === 'edicao') {
            const client = clients.find(c => c.id === form.clientId);
            const ctx = buildSyncContext(
              {
                id: contentTaskId,
                client_id: form.clientId || null,
                title: form.title,
                content_type: form.contentFormat || 'reels',
                description: 'Material pronto do cliente — direto para edição',
                script_id: scriptId,
                recording_id: form.recordingId || null,
                assigned_to: assignedTo,
                edited_video_link: null,
              },
              { userId: user?.id, clientName: client?.companyName, clientWhatsapp: client?.whatsapp }
            );
            await syncContentTaskColumnChange('edicao', ctx);
            // Trigger global refetch to update Kanban and other components immediately
            refetchData();
          }
        }
      }
      
      toast.success(form.directToEditing ? 'Enviado para fila de edição!' : 'Roteiro criado');
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

  const waitForPdfAssets = useCallback(async (element: HTMLElement) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              })
      )
    );

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, []);

  const exportPdfPages = useCallback(async (pages: HTMLDivElement[], fileName: string) => {
    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');
    const pdfWidthMm = 210;
    const pdfHeightMm = 297;

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      await waitForPdfAssets(page);

      const prevOverflow = page.style.overflow;
      page.style.overflow = 'visible';

      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: page.offsetWidth,
        height: page.offsetHeight,
        windowWidth: page.offsetWidth,
        windowHeight: page.offsetHeight,
        onclone: (clonedDoc) => {
          // Force light mode on the cloned document used for rendering
          clonedDoc.documentElement.classList.remove('dark');
          clonedDoc.documentElement.style.colorScheme = 'light';
          clonedDoc.documentElement.style.backgroundColor = '#ffffff';
          if (clonedDoc.body) {
            clonedDoc.body.style.backgroundColor = '#ffffff';
            clonedDoc.body.style.color = '#1a1a1a';
          }
          // Force all text within the PDF source to be dark
          const allElements = clonedDoc.querySelectorAll('[data-pdf-role], [data-pdf-role] *');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const computed = clonedDoc.defaultView?.getComputedStyle(htmlEl);
            if (computed) {
              // Override any light-on-dark text colors
              const currentColor = computed.color;
              // If color is white-ish or very light, force dark
              if (currentColor && /rgb\((2[0-4]\d|25[0-5]),\s*(2[0-4]\d|25[0-5]),\s*(2[0-4]\d|25[0-5])\)/.test(currentColor)) {
                htmlEl.style.color = '#1a1a1a';
              }
            }
            // Force background transparent unless explicitly white
            if (!htmlEl.style.backgroundColor || htmlEl.style.backgroundColor === '') {
              const bg = computed?.backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                // If dark background, make transparent
                if (/rgb\(([0-9]|[1-9]\d|1\d{2}),\s*([0-9]|[1-9]\d|1\d{2}),\s*([0-9]|[1-9]\d|1\d{2})\)/.test(bg)) {
                  htmlEl.style.backgroundColor = 'transparent';
                }
              }
            }
          });
        },
      });

      page.style.overflow = prevOverflow;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) pdf.addPage('a4', 'p');
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
    }

    pdf.save(fileName);
  }, [waitForPdfAssets]);

  const buildPdfPages = useCallback(async (selectedScripts: Script[], configOverride?: typeof pdfConfig) => {
    const activeConfig = configOverride || pdfConfig;
    const pdfWidthPx = 794;
    const pdfHeightPx = Math.floor((pdfWidthPx * 297) / 210); // A4 exact height
    const pagePadding = activeConfig.padding;
    const sourceRoot = document.createElement('div');
    sourceRoot.className = 'light';
    sourceRoot.style.cssText = `position:fixed;left:-20000px;top:0;width:${pdfWidthPx}px;background:white;pointer-events:none;z-index:-1;color:#1a1a1a;`;

    let html = `<div class="light" style="font-family:'Segoe UI', Arial, sans-serif; color:#1a1a1a; background:white;">`;
    html += `<div data-pdf-role="logo" style="margin:0 0 10px;"><img src="${pulseHeader}" style="width:100%;display:block;" /></div>`;

    for (let i = 0; i < selectedScripts.length; i++) {
      const script = selectedScripts[i];
      const client = clients.find(c => c.id === script.clientId);
      html += `
        <section data-pdf-role="script">
          <div data-pdf-role="script-header" style="padding:${i === 0 ? '20' : '24'}px ${pagePadding}px 8px;">
            ${i > 0 ? '<div style="border-top:1px solid #ddd; margin:0 0 20px;"></div>' : ''}
            <h1 style="font-size:22px; font-weight:700; color:#000; margin:0 0 4px; line-height:1.2;">${script.title}</h1>
            <p style="font-size:12px; color:#666; margin:0 0 12px; font-weight:500; text-transform:uppercase; letter-spacing:0.02em;">
              ${client?.companyName || 'Cliente'} · ${SCRIPT_VIDEO_TYPE_LABELS[script.videoType]} · ${new Date(script.updatedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div data-pdf-role="script-body" style="font-size:${activeConfig.fontSize}px; line-height:${activeConfig.lineHeight}; text-align:left; word-break:break-word; overflow-wrap:break-word; max-width:100%; box-sizing:border-box; overflow:hidden; color:#222;">
            ${highlightQuotesForPdf(script.content)}
          </div>
        </section>
      `;
    }

    html += `
      <div data-pdf-role="footer" style="padding:6px ${pagePadding}px 12px; text-align:center;">
        <p style="font-size:10px; color:#999; border-top:1px solid #e5e5e5; padding-top:8px; margin:0;">
          ${selectedScripts.length > 1
            ? `${selectedScripts.length} roteiro(s) · Pulse · ${new Date().toLocaleDateString('pt-BR')}`
            : `Roteiro gerado por Pulse · ${new Date().toLocaleDateString('pt-BR')}`}
        </p>
      </div>
    `;

    html += `</div>`;
    sourceRoot.innerHTML = html;
    document.body.appendChild(sourceRoot);

    const renderRoot = document.createElement('div');
    renderRoot.className = 'light';
    renderRoot.style.cssText = `position:fixed;left:-10000px;top:0;width:${pdfWidthPx}px;background:transparent;pointer-events:none;z-index:-1;color:#1a1a1a;`;
    document.body.appendChild(renderRoot);

    try {
      await waitForPdfAssets(sourceRoot);

      const pages: HTMLDivElement[] = [];
      const createPage = () => {
        const page = document.createElement('div');
        page.className = 'light';
        page.style.cssText = `width:${pdfWidthPx}px;height:${pdfHeightPx}px;background:white;box-sizing:border-box;overflow:hidden;position:relative;color:#1a1a1a;`;
        renderRoot.appendChild(page);
        pages.push(page);
        return page;
      };

      let currentPage = createPage();

      const getUsedHeight = (page: HTMLElement): number => {
        const children = Array.from(page.children) as HTMLElement[];
        if (!children.length) return 0;
        const last = children[children.length - 1];
        return last.offsetTop + last.offsetHeight;
      };

      const safeMaxHeight = pdfHeightPx - 24; // safe bottom margin to avoid clipping

      const appendBlock = (block: HTMLElement, forceBreakInside = false) => {
        const clone = block.cloneNode(true) as HTMLElement;
        clone.style.textAlign = 'justify';
        clone.style.wordBreak = 'keep-all';
        clone.style.overflowWrap = 'break-word';
        clone.style.hyphens = 'none';
        currentPage.appendChild(clone);

        const usedHeight = getUsedHeight(currentPage);

        if (usedHeight > safeMaxHeight) {
          if (currentPage.childElementCount > 1) {
            // Move block to new page
            currentPage.removeChild(clone);
            currentPage = createPage();
            currentPage.appendChild(clone);
            // Check again - if single block still overflows, it's too tall (accept it)
          }
          // If it's the only child and still overflows, we accept it
          // (block is taller than a full page - rare but possible)
        }
      };

      const isEmptyNode = (node: Node): boolean => {
        if (node.nodeType === Node.TEXT_NODE) return !node.textContent?.trim();
        const el = node as HTMLElement;
        const text = el.textContent?.trim() || '';
        const hasImg = el.querySelector('img');
        return !text && !hasImg;
      };

      const logo = sourceRoot.querySelector('[data-pdf-role="logo"]') as HTMLElement | null;
      if (logo) appendBlock(logo);

      const sections = Array.from(sourceRoot.querySelectorAll('[data-pdf-role="script"]')) as HTMLElement[];
      for (const section of sections) {
        const header = section.querySelector('[data-pdf-role="script-header"]') as HTMLElement | null;
        if (header) appendBlock(header);

        const body = section.querySelector('[data-pdf-role="script-body"]') as HTMLElement | null;
        if (body) {
          const bodyNodes = Array.from(body.childNodes).filter(
            (node) => !isEmptyNode(node)
          );

          if (!bodyNodes.length) {
            appendBlock(body);
          } else {
            // Group nodes to minimize blocks and ensure good spacing
            let accum: Node[] = [];
            const flushAccum = () => {
              if (!accum.length) return;
              const block = document.createElement('div');
              block.className = 'light';
              block.style.cssText = `padding:0 ${pagePadding}px; font-size:${activeConfig.fontSize}px; line-height:${activeConfig.lineHeight}; box-sizing:border-box; max-width:100%; overflow:hidden; text-align:left; word-break:break-word; color:#1a1a1a;`;
              for (const n of accum) {
                if (n.nodeType === Node.TEXT_NODE) {
                  const p = document.createElement('p');
                  p.style.cssText = `margin:0 0 ${activeConfig.fontSize/2}px; text-align:left;`;
                  p.textContent = n.textContent ?? '';
                  block.appendChild(p);
                } else {
                  const cl = (n as HTMLElement).cloneNode(true) as HTMLElement;
                  cl.style.textAlign = 'left';
                  // Maintain consistent spacing
                  if (cl.tagName === 'P') cl.style.margin = `0 0 ${activeConfig.fontSize/2}px`;
                  block.appendChild(cl);
                }
              }
              appendBlock(block);
              accum = [];
            };

            for (const node of bodyNodes) {
              const el = node as HTMLElement;
              const isQuote = el.nodeType === Node.ELEMENT_NODE && (el.tagName === 'MARK' || el.tagName === 'DIV' && el.style?.backgroundColor);
              
              if (isQuote) {
                flushAccum();
                const block = document.createElement('div');
                block.className = 'light';
                block.style.cssText = `padding:0 ${pagePadding}px; font-size:${activeConfig.fontSize}px; line-height:${activeConfig.lineHeight}; box-sizing:border-box; max-width:100%; overflow:hidden; text-align:left; break-inside:avoid; page-break-inside:avoid; color:#1a1a1a;`;
                const cl = el.cloneNode(true) as HTMLElement;
                block.appendChild(cl);
                appendBlock(block);
              } else {
                accum.push(node);
                // Um nó por bloco para minimizar overflow e evitar cortes de palavras na quebra de página
                flushAccum();
              }
            }
            flushAccum();
          }
        }
      }

      const footer = sourceRoot.querySelector('[data-pdf-role="footer"]') as HTMLElement | null;
      if (footer) appendBlock(footer);

      await waitForPdfAssets(renderRoot);

      return {
        pages,
        cleanup: () => {
          document.body.removeChild(sourceRoot);
          document.body.removeChild(renderRoot);
        },
      };
    } catch (error) {
      document.body.removeChild(sourceRoot);
      document.body.removeChild(renderRoot);
      throw error;
    }
  }, [clients, waitForPdfAssets, pdfConfig]);

  const handlePreviewPdf = useCallback(async (script: Script) => {
    setPreviewPages([]); 
    setOverflowWarnings([]);
    
    const pdfHeightPx = Math.floor((794 * 297) / 210);
    const safeMaxHeight = pdfHeightPx - 24;
    
    const checkOverflow = (pgs: HTMLDivElement[]) => {
      return pgs.some(page => {
        const children = Array.from(page.children) as HTMLElement[];
        if (children.length > 0) {
          const last = children[children.length - 1];
          return (last.offsetTop + last.offsetHeight) > safeMaxHeight;
        }
        return false;
      });
    };

    let currentConfig = { ...pdfConfig };
    let finalPages: HTMLDivElement[] = [];
    let hasOverflow = true;
    let attempts = 0;
    const maxAttempts = 15;

    // Build initial
    const initialResult = await buildPdfPages([script], currentConfig);
    finalPages = initialResult.pages;
    hasOverflow = checkOverflow(finalPages);
    initialResult.cleanup();

    // Iterative auto-correction if triggered by the user or needing immediate fit
    // We only auto-correct here if we want it to be "always on" or if we use a flag
    // The user asked for "Implementar uma correção automática iterativa"
    
    const runAutoCorrection = async (config: typeof pdfConfig) => {
      let tempConfig = { ...config };
      let currentAttempts = 0;
      
      while (currentAttempts < maxAttempts) {
        const { pages, cleanup } = await buildPdfPages([script], tempConfig);
        const stillOverflows = checkOverflow(pages);
        
        if (!stillOverflows) {
          cleanup();
          return { config: tempConfig, pages };
        }
        
        cleanup();
        
        // Priority 1: Reduce line height until minLineHeight
        if (tempConfig.lineHeight > (tempConfig.minLineHeight || 1.3)) {
          tempConfig.lineHeight = Math.max(tempConfig.minLineHeight || 1.3, parseFloat((tempConfig.lineHeight - 0.05).toFixed(2)));
        } 
        // Priority 2: Reduce font size until minFontSize
        else if (tempConfig.fontSize > (tempConfig.minFontSize || 10)) {
          tempConfig.fontSize = Math.max(tempConfig.minFontSize || 10, tempConfig.fontSize - 1);
        }
        // Priority 3: Reduce padding slightly until minPadding
        else if (tempConfig.padding > (tempConfig.minPadding || 15)) {
          tempConfig.padding = Math.max(tempConfig.minPadding || 15, tempConfig.padding - 2);
        } else {
          break; // Reached limits
        }
        
        currentAttempts++;
      }
      
      // Return best attempt if still overflows
      const final = await buildPdfPages([script], tempConfig);
      return { config: tempConfig, pages: final.pages, cleanup: final.cleanup };
    };

    // If we are already in an auto-correcting state (triggered by button)
    if (isAutoCorrecting) {
      const result = await runAutoCorrection(currentConfig);
      setPdfConfig(result.config);
      finalPages = result.pages;
      if (result.cleanup) result.cleanup();
      setIsAutoCorrecting(false);
    } else {
      // Just use the current pages from the initial build
      const { pages, cleanup } = await buildPdfPages([script], pdfConfig);
      finalPages = pages;
      cleanup();
    }

    const warnings: number[] = [];
    finalPages.forEach((page, idx) => {
      const children = Array.from(page.children) as HTMLElement[];
      if (children.length > 0) {
        const last = children[children.length - 1];
        const usedHeight = last.offsetTop + last.offsetHeight;
        if (usedHeight > safeMaxHeight) {
          warnings.push(idx);
        }
      }
    });

    setOverflowWarnings(warnings);
    const clonedPages = finalPages.map(p => p.cloneNode(true) as HTMLDivElement);
    setPreviewPages(clonedPages);
    setPreviewOpen(true);
  }, [buildPdfPages, pdfConfig, isAutoCorrecting]);

  // Re-generate preview when config changes
  useEffect(() => {
    if (previewOpen && viewing) {
      handlePreviewPdf(viewing);
    }
  }, [pdfConfig, previewOpen]);

  const handleDownloadPdf = useCallback(async (script: Script) => {
    const { pages, cleanup } = await buildPdfPages([script]);

    try {
      await exportPdfPages(pages, `roteiro-${script.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
      toast.success('PDF baixado');
    } finally {
      cleanup();
    }
  }, [buildPdfPages, exportPdfPages]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredScripts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredScripts.map(s => s.id)));
    }
  };

  const handleDownloadSelectedPdf = useCallback(async () => {
    const selected = filteredScripts.filter(s => selectedIds.has(s.id));
    if (selected.length === 0) { toast.error('Selecione ao menos um roteiro'); return; }

    setDownloadingBatch(true);
    try {
      const { pages, cleanup } = await buildPdfPages(selected);

      try {
        await exportPdfPages(pages, `roteiros-selecionados-${selected.length}.pdf`);
      } finally {
        cleanup();
      }

      toast.success(`PDF com ${selected.length} roteiro(s) baixado!`);
      setSelectMode(false);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Batch PDF error:', err);
      toast.error('Erro ao gerar PDF');
    } finally {
      setDownloadingBatch(false);
    }
  }, [buildPdfPages, exportPdfPages, filteredScripts, selectedIds]);

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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/ai-script-generator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          clientId: form.clientId,
          topic: form.title || undefined,
          videoType: form.videoType,
          contentFormat: form.contentFormat,
          additionalContext: form.content?.replace(/<[^>]*>/g, '').substring(0, 300) || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data?.script) {
        // Content is already HTML from the edge function
        let htmlContent = data.script;
        // If it looks like markdown, convert
        if (!htmlContent.includes('<p>') && !htmlContent.includes('<strong>')) {
          htmlContent = htmlContent
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br/>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
        }
        setForm(prev => ({ ...prev, content: htmlContent }));
        if (!form.title) {
          const autoTitle = `${SCRIPT_VIDEO_TYPE_LABELS[form.videoType]} - ${client.companyName}`;
          setForm(prev => ({ ...prev, title: autoTitle }));
        }
        const ctx = data.learningContext;
        const learnMsg = ctx?.hasLearningData
          ? ` (aprendeu com ${ctx.usedAsReference} roteiros anteriores)`
          : ' (sem roteiros anteriores para referência)';
        toast.success(`Roteiro gerado com sucesso!${learnMsg}`);
      }
    } catch (err: any) {
      console.error('Generate script error:', err);
      toast.error(err.message || 'Erro ao gerar roteiro. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const getClientName = (id: string, script?: Script) => {
    if (script?.recordingId) {
      const rec = recordings.find(r => r.id === script.recordingId);
      return rec?.prospectName ? `📹 ${rec.prospectName}` : '📹 Avulso';
    }
    if (!id) return '📹 Avulso';
    return clients.find(c => c.id === id)?.companyName || '—';
  };
  const getClientColor = (id: string, script?: Script) => {
    if (script?.recordingId) return '200 80% 55%';
    return clients.find(c => c.id === id)?.color || '220 10% 50%';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold">Roteiros</h1>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <Button variant="outline" size="sm" onClick={selectAll} className="gap-1.5">
                <CheckSquare size={14} />
                {selectedIds.size === filteredScripts.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </Button>
              <Button size="sm" onClick={handleDownloadSelectedPdf} disabled={selectedIds.size === 0 || downloadingBatch}
                className="gap-1.5 bg-gradient-to-r from-primary to-primary/80">
                <Download size={14} className={downloadingBatch ? 'animate-spin' : ''} />
                {downloadingBatch ? 'Gerando...' : `Baixar ${selectedIds.size} selecionado(s)`}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>
                <X size={16} />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setSelectMode(true)} className="gap-1.5">
                <CheckSquare size={14} /> Selecionar
              </Button>
              {scripts.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleCleanAll}>
                  <Eraser size={14} className="mr-1.5" /> Limpar Formatação
                </Button>
              )}
              <Button onClick={() => handleOpen()}><Plus size={16} className="mr-2" /> Novo Roteiro</Button>
              <Button variant="outline" className="gap-1.5 border-sky-500/40 text-sky-600 hover:bg-sky-500/10" onClick={() => {
                setEditing(null);
                setForm({ clientId: '', title: '', videoType: 'vendas', contentFormat: 'reels', content: '', caption: '', priority: 'normal', isEndomarketing: false, endoClientId: '', scheduledDate: '', directToEditing: false, isAvulso: true, recordingId: '', prospectName: '', materialLink: '' });
                setOpen(true);
              }}>
                <Video size={16} /> Roteiro Avulso
              </Button>
            </>
          )}
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
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-2">
            <Switch checked={scriptAlerts} onCheckedChange={toggleScriptAlerts} id="script-alerts" />
            <Label htmlFor="script-alerts" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap flex items-center gap-1">
              {scriptAlerts ? <Bell size={12} /> : <BellOff size={12} />} Alertas
            </Label>
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <Switch checked={showRecorded} onCheckedChange={setShowRecorded} id="show-recorded" />
            <Label htmlFor="show-recorded" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Mostrar gravados
            </Label>
          </div>
        </div>
      </div>

      {/* Low scripts alert */}
      {scriptAlerts && clientsLowScripts.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle size={16} /> Clientes com poucos roteiros disponíveis
          </p>
          <div className="flex flex-wrap gap-2">
            {clientsLowScripts.map(({ client, count }) => (
              <Badge key={client.id} variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5">
                <ClientLogo client={client} size="sm" className="mr-1.5 w-4 h-4" />
                {client.companyName}: {count} roteiro{count !== 1 ? 's' : ''}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Scripts list */}
      {filteredScripts.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <FileText size={40} className="mx-auto mb-3 opacity-50" />
          <p>Nenhum roteiro encontrado</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredScripts.map(script => (
            <div key={script.id} 
              className={`glass-card p-4 flex flex-col gap-3 transition-all cursor-pointer ${script.recorded ? 'opacity-50 grayscale-[30%]' : ''} ${selectMode && selectedIds.has(script.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
              style={{ borderLeftWidth: 4, borderLeftColor: `hsl(${getClientColor(script.clientId, script)})` }}
              onClick={selectMode ? () => toggleSelect(script.id) : undefined}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 flex items-start gap-2">
                  {selectMode && (
                    <Checkbox checked={selectedIds.has(script.id)} onCheckedChange={() => toggleSelect(script.id)} className="mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {(() => { const cl = clients.find(c => c.id === script.clientId); return cl ? <ClientLogo client={cl} size="sm" className="w-5 h-5 text-[8px] rounded" /> : script.recordingId ? <Video size={14} className="text-sky-500" /> : null; })()}
                    {(script.priority === 'urgent') && <AlertTriangle size={13} className="text-destructive shrink-0" />}
                    {(script.priority === 'priority') && <Star size={13} className="text-warning shrink-0" />}
                    <p className="font-medium text-sm truncate">{script.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate ml-6">
                    {getClientName(script.clientId, script)} · {SCRIPT_VIDEO_TYPE_LABELS[script.videoType]} · <span className="font-medium">{SCRIPT_CONTENT_FORMAT_LABELS[script.contentFormat || 'reels']}</span>
                  </p>
                  </div>
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
                  {script.directToEditing && (
                    <Badge className="text-[9px] bg-blue-500/20 text-blue-600 border-blue-500/30">
                      🎬 Direto p/ Edição
                    </Badge>
                  )}
                  {(script.recordingId || !script.clientId) && (
                    <Badge className="text-[9px] bg-sky-500/20 text-sky-600 border-sky-500/30">
                      📹 Avulso
                    </Badge>
                  )}
                  {script.priority === 'urgent' && (
                    <Badge className="text-[9px] bg-destructive/20 text-destructive border-destructive/30">Urgente</Badge>
                  )}
                  {script.priority === 'priority' && (
                    <Badge className="text-[9px] bg-warning/20 text-warning border-warning/30">Prioritário</Badge>
                  )}
                  {script.clientEdited && (
                    <Badge className="text-[9px] bg-violet-500/20 text-violet-600 border-violet-500/30">
                      <Pencil size={8} className="mr-0.5" /> Editado pelo cliente
                    </Badge>
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
          <DialogHeader><DialogTitle>{editing ? 'Editar Roteiro' : form.isAvulso ? '📹 Novo Roteiro Avulso' : 'Novo Roteiro'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {form.isAvulso ? (
              /* Avulso mode: select recording instead of client */
              <div className="p-4 rounded-xl border-2 border-sky-500/30 bg-sky-500/5 space-y-3">
                <p className="text-sm font-semibold text-sky-600 flex items-center gap-2">
                  <Video size={16} /> Gravação Avulsa Vinculada
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Gravação Avulsa *</Label>
                    <Select value={form.recordingId} onValueChange={v => {
                      const rec = avulsoRecordings.find(r => r.id === v);
                      setForm({ ...form, recordingId: v, prospectName: rec?.prospectName || '' });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione a gravação" /></SelectTrigger>
                      <SelectContent>
                        {avulsoRecordings.length === 0 ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">Nenhuma gravação avulsa encontrada</div>
                        ) : (
                          avulsoRecordings.map(r => (
                            <SelectItem key={r.id} value={r.id}>
                              <span className="flex items-center gap-2">
                                <Video size={12} className="text-sky-500" />
                                📹 {r.prospectName} — {new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR')} às {r.startTime}
                              </span>
                            </SelectItem>
                          ))
                        )}
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
                </div>
                {form.prospectName && (
                  <p className="text-xs text-muted-foreground">
                    Prospect: <strong>{form.prospectName}</strong>
                  </p>
                )}
              </div>
            ) : (
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
            )}

            {/* Direct to editing toggle - positioned right after client selection for visibility */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-accent/30">
              <Switch checked={form.directToEditing} onCheckedChange={v => setForm({ ...form, directToEditing: v, materialLink: v ? form.materialLink : '' })} disabled={isEditorRole} />
              <div>
                <Label className="font-medium flex items-center gap-1.5">
                  🎬 Direto para Edição
                  {isEditorRole && <Badge className="text-[9px] bg-blue-500/20 text-blue-600 border-blue-500/30 ml-1">Obrigatório</Badge>}
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isEditorRole ? 'Editores criam roteiros que vão direto para a fila de edição.' : 'Para materiais prontos do cliente. Fica em espera e sobe automaticamente para o editor com menos tarefas quando a fila esvaziar.'}
                </p>
              </div>
            </div>

            {/* Material link field - shown when directToEditing is active */}
            {form.directToEditing && (
              <div className="space-y-1 p-3 rounded-xl border-2 border-blue-300/50 bg-blue-50/30 dark:bg-blue-950/10 dark:border-blue-700/30">
                <Label className="font-medium flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                  🔗 Link do Material para o Editor
                </Label>
                <Input
                  value={form.materialLink}
                  onChange={e => setForm({ ...form, materialLink: e.target.value })}
                  placeholder="Cole o link do Drive, WeTransfer, ou pasta com os materiais..."
                  className="border-blue-200/60 focus:border-blue-400"
                />
                <p className="text-[10px] text-muted-foreground">
                  O editor terá acesso a este link para baixar os materiais brutos.
                </p>
              </div>
            )}

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

            {/* Seasonal dates are now managed via AI in the Dashboard */}

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


            <div className="space-y-1">
              <Label>Título do Roteiro *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Roteiro de Vendas - Black Friday" />
            </div>

            <div className="space-y-1">
              <Label>Conteúdo do Roteiro</Label>
              <RichEditor key={editing?.id || 'new'} content={form.content} onChange={html => setForm(prev => ({ ...prev, content: html }))} />
            </div>

            {form.contentFormat !== 'story' && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  📝 Legenda para Instagram
                  {form.caption && <Badge variant="outline" className="text-[9px]">{form.caption.length} caracteres</Badge>}
                </Label>
                <Textarea 
                  value={form.caption} 
                  onChange={e => setForm(prev => ({ ...prev, caption: e.target.value }))} 
                  placeholder="Legenda com CTA para a postagem..." 
                  rows={4}
                />
                <p className="text-[10px] text-muted-foreground">Gerada automaticamente pela IA junto com o roteiro. Você pode editar manualmente.</p>
              </div>
            )}

            {form.directToEditing && !editing ? (
              <Button 
                onClick={handleSave} 
                className="w-full gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg"
                disabled={!form.clientId || !form.title}
              >
                <Video size={16} /> Enviar para Fila de Edição
              </Button>
            ) : (
              <Button onClick={handleSave} className="w-full">{editing ? 'Salvar Alterações' : 'Criar Roteiro'}</Button>
            )}
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
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: `hsl(${getClientColor(viewing.clientId, viewing)})` }} />
                  {viewing.title}
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{getClientName(viewing.clientId, viewing)}</span>
                <span>·</span>
                <Badge variant="outline" className="text-[10px]">{SCRIPT_VIDEO_TYPE_LABELS[viewing.videoType]}</Badge>
                <span>·</span>
                <Badge variant="outline" className="text-[10px]">{SCRIPT_CONTENT_FORMAT_LABELS[viewing.contentFormat || 'reels']}</Badge>
                <span>·</span>
                <Badge variant={viewing.recorded ? 'default' : 'outline'} className={`text-[10px] ${viewing.recorded ? 'bg-success text-success-foreground' : ''}`}>
                  {viewing.recorded ? 'Gravado' : 'Pendente'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Fonte:</span>
                {[
                  { label: 'P', val: 0 },
                  { label: 'M', val: 1 },
                  { label: 'G', val: 2 },
                  { label: 'GG', val: 3 },
                ].map(opt => (
                  <Button
                    key={opt.val}
                    variant={viewFontSize === opt.val ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 w-8 text-xs px-0"
                    onClick={() => setViewFontSize(opt.val)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <div className={`${['prose-sm', 'prose-base', 'prose-lg', 'prose-xl'][viewFontSize]} prose max-w-none mt-2 p-4 rounded-xl bg-muted/30 border border-border`}
                dangerouslySetInnerHTML={{ __html: highlightQuotes(viewing.content) || '<em>Sem conteúdo</em>' }} />
              {viewing.caption && (
                <div className="mt-3 space-y-1">
                  <Label className="text-xs text-muted-foreground">📝 Legenda</Label>
                  <div className={`${['text-sm', 'text-base', 'text-lg', 'text-xl'][viewFontSize]} p-3 rounded-lg bg-muted/20 border border-border whitespace-pre-wrap`}>
                    {viewing.caption}
                  </div>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => handlePreviewPdf(viewing)}>
                  <Eye size={16} className="mr-2" /> Prévia A4
                </Button>
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

      {/* PDF Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[900px] max-h-[90vh] p-0 overflow-hidden bg-zinc-200/50 dark:bg-zinc-900/50 flex flex-col backdrop-blur-sm">
          <DialogHeader className="p-4 bg-white dark:bg-zinc-950 border-b shrink-0">
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <Eye size={18} className="text-primary" />
                  Pré-visualização do Roteiro (A4)
                </DialogTitle>
                <Button onClick={() => viewing && handleDownloadPdf(viewing)} size="sm" className="gap-2">
                  <Download size={16} /> Baixar PDF
                </Button>
              </div>
              
              <div className="flex flex-wrap items-center gap-6 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-border">
                {overflowWarnings.length > 0 && (
                  <div className="w-full mb-1 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="animate-pulse" />
                      <div>
                        <strong>Aviso de Corte:</strong> Detectamos transbordamento nas páginas: {overflowWarnings.map(i => i + 1).join(', ')}.
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-[10px] bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800"
                      onClick={() => {
                        setIsAutoCorrecting(true);
                        toast.info("Ajustando layout iterativamente para caber no A4...");
                      }}
                    >
                      Corrigir Automaticamente
                    </Button>
                  </div>
                )}
                <div className="space-y-1.5 flex-1 min-w-[120px]">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5"><Maximize size={10} /> Margens</span>
                    <span className="text-[9px] font-normal opacity-70">mín: {pdfConfig.minPadding || 15}px</span>
                  </Label>
                  <Slider 
                    value={[pdfConfig.padding]} 
                    min={pdfConfig.minPadding || 10} 
                    max={60} 
                    step={2} 
                    onValueChange={([v]) => setPdfConfig(prev => ({ ...prev, padding: v }))} 
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">Limite auto:</span>
                    <Input 
                      type="number" 
                      className="h-5 w-12 text-[10px] p-1" 
                      value={pdfConfig.minPadding || 15}
                      onChange={e => setPdfConfig(prev => ({ ...prev, minPadding: parseInt(e.target.value) || 10 }))}
                    />
                  </div>
                </div>
                
                <div className="space-y-1.5 flex-1 min-w-[120px]">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5"><AlignJustify size={10} /> Espaço</span>
                    <span className="text-[9px] font-normal opacity-70">mín: {pdfConfig.minLineHeight || 1.3}</span>
                  </Label>
                  <Slider 
                    value={[pdfConfig.lineHeight]} 
                    min={pdfConfig.minLineHeight || 1.2} 
                    max={2.5} 
                    step={0.1} 
                    onValueChange={([v]) => setPdfConfig(prev => ({ ...prev, lineHeight: v }))} 
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">Limite auto:</span>
                    <Input 
                      type="number" 
                      step="0.1"
                      className="h-5 w-12 text-[10px] p-1" 
                      value={pdfConfig.minLineHeight || 1.3}
                      onChange={e => setPdfConfig(prev => ({ ...prev, minLineHeight: parseFloat(e.target.value) || 1.0 }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5 flex-1 min-w-[120px]">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5"><Type size={10} /> Fonte</span>
                    <span className="text-[9px] font-normal opacity-70">mín: {pdfConfig.minFontSize || 10}px</span>
                  </Label>
                  <Slider 
                    value={[pdfConfig.fontSize]} 
                    min={pdfConfig.minFontSize || 10} 
                    max={24} 
                    step={1} 
                    onValueChange={([v]) => setPdfConfig(prev => ({ ...prev, fontSize: v }))} 
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">Limite auto:</span>
                    <Input 
                      type="number" 
                      className="h-5 w-12 text-[10px] p-1" 
                      value={pdfConfig.minFontSize || 10}
                      onChange={e => setPdfConfig(prev => ({ ...prev, minFontSize: parseInt(e.target.value) || 8 }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scrollbar-thin">
            {previewPages.map((page, idx) => (
              <div key={idx} className="relative group mx-auto">
                {overflowWarnings.includes(idx) && (
                  <div className="absolute -top-6 left-0 right-0 text-center text-amber-600 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-1">
                    <AlertTriangle size={12} /> Risco de corte no final desta página
                  </div>
                )}
                <div 
                  className={`bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] relative overflow-hidden transition-all ${overflowWarnings.includes(idx) ? 'ring-4 ring-amber-400/50' : ''}`}
                  style={{ 
                    width: '210mm', 
                    minHeight: '297mm',
                    color: '#1a1a1a'
                  }}
                  dangerouslySetInnerHTML={{ __html: page.innerHTML }}
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
