import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { highlightQuotes, highlightQuotesForPdf } from '@/lib/highlightQuotes';
import type { Recording, Script } from '@/types';
import { SCRIPT_VIDEO_TYPE_LABELS, SCRIPT_PRIORITY_LABELS } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Square, FileText, Check, Clock, Video, Users as UsersIcon,
  TrendingUp, BarChart3, Undo2, AlertTriangle, Star, Eye, ChevronLeft, Download, Link, ArrowRight,
  ThumbsDown, Pencil, MessageCircle, Send, UserCheck, Rocket, Hourglass
} from 'lucide-react';
import LiveRecordingCard from '@/components/videomaker/LiveRecordingCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import pulseHeader from '@/assets/pulse_header.png';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, endOfWeek, isWithinInterval, parseISO, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function VideomakerDashboard() {
  const {
    currentUser, recordings, clients, scripts, users, activeRecordings, settings,
    updateRecording, updateScript, startActiveRecording, stopActiveRecording,
  } = useApp();

  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [scriptsClientId, setScriptsClientId] = useState('');
  const [scriptsRecordingId, setScriptsRecordingId] = useState('');
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [viewingScript, setViewingScript] = useState<Script | null>(null);

  // Track planned scripts per active recording (recordingId -> script IDs)
  const [plannedScripts, setPlannedScripts] = useState<Record<string, string[]>>({});

  // Finish dialog state - multi-step wizard
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [finishRecordingId, setFinishRecordingId] = useState('');
  const [completedScriptIds, setCompletedScriptIds] = useState<Set<string>>(new Set());
  const [finishStep, setFinishStep] = useState<'scripts' | 'alterations' | 'drive'>('scripts');
  const [selectedEditorId, setSelectedEditorId] = useState<string>('__auto__');
  const [driveLinks, setDriveLinks] = useState<Record<string, string>>({});
  // Script status tracking
  const [rejectedScripts, setRejectedScripts] = useState<Set<string>>(new Set());
  const [alteredScripts, setAlteredScripts] = useState<Set<string>>(new Set());
  const [verbalScripts, setVerbalScripts] = useState<Set<string>>(new Set());
  const [alterationNotes, setAlterationNotes] = useState<Record<string, string>>({});
  
  // Celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationScore, setCelebrationScore] = useState(0);

  // ── Waiting for client state ──
  const [waitingRecordingId, setWaitingRecordingId] = useState<string | null>(null);
  const [waitingLogId, setWaitingLogId] = useState<string | null>(null);
  const [waitingStartedAt, setWaitingStartedAt] = useState<Date | null>(null);
  const [waitingElapsed, setWaitingElapsed] = useState(0);

  // Timer for waiting elapsed
  useEffect(() => {
    if (!waitingStartedAt) return;
    const interval = setInterval(() => {
      setWaitingElapsed(Math.floor((Date.now() - waitingStartedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [waitingStartedAt]);

  const handleStartWaiting = async (rec: Recording) => {
    const logId = crypto.randomUUID();
    const now = new Date();
    const { error } = await supabase.from('recording_wait_logs').insert({
      id: logId,
      recording_id: rec.id,
      videomaker_id: vmId,
      client_id: rec.clientId,
      started_at: now.toISOString(),
    } as any);
    if (error) {
      toast.error('Erro ao registrar espera');
      console.error(error);
      return;
    }
    setWaitingRecordingId(rec.id);
    setWaitingLogId(logId);
    setWaitingStartedAt(now);
    setWaitingElapsed(0);
    toast.info(`Aguardando cliente ${getClientName(rec.clientId)}...`, { icon: '⏳' });
  };

  const handleStopWaiting = async () => {
    if (!waitingLogId || !waitingStartedAt) return;
    const durationSec = Math.floor((Date.now() - waitingStartedAt.getTime()) / 1000);
    await supabase.from('recording_wait_logs').update({
      ended_at: new Date().toISOString(),
      wait_duration_seconds: durationSec,
    } as any).eq('id', waitingLogId);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    toast.success(`Espera encerrada: ${mins}m ${secs}s registrados`);
    setWaitingRecordingId(null);
    setWaitingLogId(null);
    setWaitingStartedAt(null);
    setWaitingElapsed(0);
  };

  const formatWaitTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const vmId = currentUser?.id || '';
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const normalizeDateKey = (value: string) => value?.slice(0, 10) || '';
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  // ── My recordings ──
  const myRecordings = useMemo(() =>
    recordings.filter(r => r.videomakerId === vmId),
    [recordings, vmId]
  );

  const todayRecs = useMemo(() =>
    myRecordings.filter(r => normalizeDateKey(r.date) === todayStr && r.status !== 'cancelada')
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [myRecordings, todayStr]
  );

  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return myRecordings.filter(r => normalizeDateKey(r.date) === dateStr && r.status !== 'cancelada')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getClientColor = (id: string) => clients.find(c => c.id === id)?.color || '220 10% 50%';

  const typeLabels: Record<string, string> = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.' };
  const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // ── Active recording (use local backup to survive polling race conditions) ──
  const [localActiveRecordingId, setLocalActiveRecordingId] = useState<string | null>(null);
  const myActiveRec = activeRecordings.find(a => a.videomarkerId === vmId);
  // A recording is considered active if either the server says so OR local state says so
  const activeRecordingId = myActiveRec?.recordingId || localActiveRecordingId;

  const handleStartRecording = (rec: Recording) => {
    setScriptsClientId(rec.clientId);
    setScriptsRecordingId(rec.id);
    // Auto-select all urgent scripts (mandatory)
    const urgentIds = scripts
      .filter(s => s.clientId === rec.clientId && !s.recorded && !s.isEndomarketing && s.priority === 'urgent')
      .map(s => s.id);
    setSelectedScriptIds(new Set(urgentIds));
    setViewingScript(null);
    setScriptsOpen(true);
  };

  const confirmStartRecording = async (rec: Recording) => {
    // Validate all urgent scripts are selected
    const urgentScripts = scripts.filter(
      s => s.clientId === rec.clientId && !s.recorded && !s.isEndomarketing && s.priority === 'urgent'
    );
    const allUrgentSelected = urgentScripts.every(s => selectedScriptIds.has(s.id));
    if (urgentScripts.length > 0 && !allUrgentSelected) {
      toast.error('Todos os roteiros urgentes devem ser selecionados para iniciar a gravação');
      return;
    }
    if (selectedScriptIds.size === 0) {
      toast.error('Selecione pelo menos 1 roteiro para iniciar a gravação');
      return;
    }
    // Store planned scripts and mark recording as locally active
    setPlannedScripts(prev => ({ ...prev, [rec.id]: Array.from(selectedScriptIds) }));
    setLocalActiveRecordingId(rec.id);
    startActiveRecording({
      recordingId: rec.id,
      videomarkerId: vmId,
      clientId: rec.clientId,
      startedAt: new Date().toISOString(),
      plannedScriptIds: Array.from(selectedScriptIds),
    });
    
    // Move content_tasks linked to selected scripts to "captacao"
    for (const scriptId of selectedScriptIds) {
      const { error } = await supabase.from('content_tasks').update({ kanban_column: 'captacao', recording_id: rec.id } as any)
        .eq('script_id', scriptId);
      if (error) console.error('Move to captacao error:', error);
    }
    
    toast.success(`Gravação iniciada com ${selectedScriptIds.size} roteiro(s) — ${getClientName(rec.clientId)}`);
    setScriptsOpen(false);
  };

  // ── Finish recording flow ──
  const handleFinishRecording = (rec: Recording) => {
    setFinishRecordingId(rec.id);
    setCompletedScriptIds(new Set());
    setRejectedScripts(new Set());
    setAlteredScripts(new Set());
    setVerbalScripts(new Set());
    setAlterationNotes({});
    setFinishStep('scripts');
    setDriveLinks({});
    setSelectedEditorId('__auto__');
    setFinishDialogOpen(true);
  };

  // Scripts available for finish dialog — only the ones planned at start
  const finishClientScripts = useMemo(() => {
    if (!finishRecordingId) return [];
    // First check in-memory planned scripts
    let planned = plannedScripts[finishRecordingId];
    // Fallback: check DB-persisted planned scripts from activeRecordings
    if (!planned || planned.length === 0) {
      const activeRec = activeRecordings.find(a => a.recordingId === finishRecordingId);
      if (activeRec?.plannedScriptIds && activeRec.plannedScriptIds.length > 0) {
        planned = activeRec.plannedScriptIds;
      }
    }
    if (!planned || planned.length === 0) {
      // Last fallback: show all pending scripts for this client
      const rec = recordings.find(r => r.id === finishRecordingId);
      if (!rec) return [];
      return scripts.filter(s => s.clientId === rec.clientId && !s.isEndomarketing && !s.recorded)
        .sort((a, b) => {
          const priorityOrder: Record<string, number> = { urgent: 0, priority: 1, normal: 2 };
          return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        });
    }
    // Show only scripts that were planned for this session
    return scripts.filter(s => planned!.includes(s.id))
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = { urgent: 0, priority: 1, normal: 2 };
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
      });
  }, [finishRecordingId, recordings, scripts, plannedScripts, activeRecordings]);

  const handleGoToAlterationsStep = () => {
    if (completedScriptIds.size === 0 && rejectedScripts.size === 0) {
      toast.error('Selecione pelo menos 1 roteiro');
      return;
    }
    // If only rejected scripts, skip to drive/finalize
    if (completedScriptIds.size === 0) {
      confirmFinish();
      return;
    }
    setFinishStep('alterations');
  };

  const handleGoToDriveStep = () => {
    // All scripts that need drive links: completed + altered + verbal
    const scriptsNeedingLinks = new Set([...completedScriptIds, ...alteredScripts, ...verbalScripts]);
    if (scriptsNeedingLinks.size === 0 && rejectedScripts.size > 0) {
      confirmFinish();
      return;
    }
    setFinishStep('drive');
  };

  // Editors list for optional assignment
  const editors = useMemo(() => 
    users.filter(u => u.role === 'editor' || u.role === 'admin'),
    [users]
  );

  const confirmFinish = async () => {
    // All scripts that need drive links: completed + altered + verbal
    const scriptsNeedingLinks = new Set([...completedScriptIds, ...alteredScripts, ...verbalScripts]);
    const missingLinks = Array.from(scriptsNeedingLinks).filter(id => !driveLinks[id]?.trim());
    if (missingLinks.length > 0 && scriptsNeedingLinks.size > 0) {
      toast.error('Adicione o link do Drive para todos os roteiros gravados');
      return;
    }

    const rec = recordings.find(r => r.id === finishRecordingId);
    if (!rec) return;

    const now = new Date().toISOString();
    let planned = plannedScripts[finishRecordingId] || [];
    if (planned.length === 0) {
      const activeRec = activeRecordings.find(a => a.recordingId === finishRecordingId);
      if (activeRec?.plannedScriptIds && activeRec.plannedScriptIds.length > 0) {
        planned = activeRec.plannedScriptIds;
      }
    }

    // All scripts that were actually recorded (completed + altered + verbal)
    const allRecordedIds = new Set([...completedScriptIds, ...alteredScripts, ...verbalScripts]);

    // Mark recorded scripts
    allRecordedIds.forEach(id => {
      const script = scripts.find(s => s.id === id);
      if (script && !script.recorded) {
        updateScript({ ...script, recorded: true, updatedAt: now });
      }
    });

    // Handle REJECTED scripts: delete script + content_task
    for (const scriptId of rejectedScripts) {
      // Delete content_task
      await supabase.from('content_tasks').delete().eq('script_id', scriptId);
      // Delete script
      await supabase.from('scripts').delete().eq('id', scriptId);
    }

    // Auto-return unrecorded/unrejected planned scripts back to pending
    const returnedIds = planned.filter(id => !allRecordedIds.has(id) && !rejectedScripts.has(id));
    const returnedCount = returnedIds.length;
    returnedIds.forEach(id => {
      const script = scripts.find(s => s.id === id);
      if (script && script.recorded) {
        updateScript({ ...script, recorded: false, updatedAt: now });
      }
    });

    const reelsCount = allRecordedIds.size;
    const allRecordedArray = Array.from(allRecordedIds);
    stopActiveRecording(finishRecordingId, {
      reels_produced: reelsCount,
      videos_recorded: Math.max(reelsCount, 1),
    }, allRecordedArray);
    updateRecording({ ...rec, status: 'concluida' });

    // Create/update content_tasks for recorded scripts
    const editingDeadline = new Date();
    editingDeadline.setHours(editingDeadline.getHours() + (settings.editingDeadlineHours || 48));

    for (const scriptId of allRecordedArray) {
      const script = scripts.find(s => s.id === scriptId);
      if (!script) continue;
      const { data: existing } = await supabase.from('content_tasks')
        .select('id').eq('script_id', scriptId).limit(1);
      
      const scriptDriveLink = driveLinks[scriptId]?.trim() || '';
      const isAltered = alteredScripts.has(scriptId);
      const isVerbal = verbalScripts.has(scriptId);
      const altType = isAltered ? 'altered' : isVerbal ? 'verbal' : null;
      const altNotes = alterationNotes[scriptId]?.trim() || null;

      let description = `Roteiro gravado pelo videomaker. Link dos materiais: ${scriptDriveLink}`;
      if (isAltered) {
        description = `⚠️ ROTEIRO ALTERADO — O roteiro original foi modificado durante a gravação. ${altNotes ? `\n\n📝 Notas do videomaker: ${altNotes}` : 'Não seguir o roteiro original para editar.'}\n\nLink dos materiais: ${scriptDriveLink}`;
      } else if (isVerbal) {
        description = `🗣️ ALTERAÇÃO VERBAL — A alteração do roteiro foi passada presencialmente/verbalmente ao editor. ${altNotes ? `\n\n📝 Notas adicionais: ${altNotes}` : ''}\n\nLink dos materiais: ${scriptDriveLink}`;
      }

      const assignedEditor = (selectedEditorId && selectedEditorId !== '__auto__') ? selectedEditorId : null;

      if (existing && existing.length > 0) {
        await supabase.from('content_tasks').update({
          kanban_column: 'edicao',
          drive_link: scriptDriveLink,
          recording_id: rec.id,
          editing_deadline: editingDeadline.toISOString(),
          description,
          script_alteration_type: altType,
          script_alteration_notes: altNotes,
          assigned_to: assignedEditor,
        } as any).eq('id', existing[0].id);
      } else {
        await supabase.from('content_tasks').insert({
          client_id: rec.clientId,
          title: script.title,
          content_type: script.contentFormat || 'reels',
          kanban_column: 'edicao',
          description,
          script_id: scriptId,
          recording_id: rec.id,
          assigned_to: assignedEditor,
          created_by: vmId,
          drive_link: scriptDriveLink,
          editing_deadline: editingDeadline.toISOString(),
          script_alteration_type: altType,
          script_alteration_notes: altNotes,
        } as any);
      }
    }

    // Move unfinished scripts' content_tasks back to "ideias" (not rejected ones)
    for (const scriptId of returnedIds) {
      await supabase.from('content_tasks').update({ kanban_column: 'ideias', recording_id: null } as any)
        .eq('script_id', scriptId).in('kanban_column', ['captacao']);
    }

    // Check remaining scripts for this client and notify if low
    const remainingScripts = scripts.filter(
      s => s.clientId === rec.clientId && !s.recorded && !s.isEndomarketing && !allRecordedIds.has(s.id) && !rejectedScripts.has(s.id)
    );
    if (remainingScripts.length <= 2) {
      const clientName = clients.find(c => c.id === rec.clientId)?.companyName || 'Cliente';
      await supabase.rpc('notify_role', {
        _role: 'social_media',
        _title: '📝 Estoque baixo de roteiros',
        _message: `${clientName} possui apenas ${remainingScripts.length} roteiro(s) pendente(s). Crie novos roteiros para as próximas gravações.`,
        _type: 'script_low',
        _link: '/roteiros',
      });
      await supabase.rpc('notify_role', {
        _role: 'admin',
        _title: '📝 Estoque baixo de roteiros',
        _message: `${clientName} possui apenas ${remainingScripts.length} roteiro(s) pendente(s). Crie novos roteiros para as próximas gravações.`,
        _type: 'script_low',
        _link: '/roteiros',
      });
    }

    let msg = `Gravação concluída! ${reelsCount} roteiro(s) enviado(s) para edição`;
    if (rejectedScripts.size > 0) msg += ` · ${rejectedScripts.size} rejeitado(s) e apagado(s)`;
    if (returnedCount > 0) msg += ` · ${returnedCount} retornado(s) ao banco`;

    // Show celebration popup with score
    const score = reelsCount * 10;
    setCelebrationScore(score);
    setShowCelebration(true);
    setTimeout(() => setShowCelebration(false), 3500);

    toast.success(msg);

    // Clean up
    setPlannedScripts(prev => { const next = { ...prev }; delete next[finishRecordingId]; return next; });
    setLocalActiveRecordingId(null);
    setFinishDialogOpen(false);
    setCompletedScriptIds(new Set());
    setRejectedScripts(new Set());
    setAlteredScripts(new Set());
    setVerbalScripts(new Set());
    setAlterationNotes({});
    setDriveLinks({});
    setSelectedEditorId('__auto__');
    setFinishStep('scripts');
  };

  // ── Scripts ──
  const openScripts = (clientId: string) => {
    setScriptsClientId(clientId);
    setScriptsRecordingId('');
    setSelectedScriptIds(new Set());
    setViewingScript(null);
    setScriptsOpen(true);
  };

  const clientScripts = useMemo(() => {
    if (!scriptsClientId) return [];
    const pending = scripts.filter(s => s.clientId === scriptsClientId && !s.recorded);
    const priorityOrder: Record<string, number> = { urgent: 0, priority: 1, normal: 2 };
    return pending.sort((a, b) => {
      const pA = priorityOrder[a.priority || 'normal'];
      const pB = priorityOrder[b.priority || 'normal'];
      if (pA !== pB) return pA - pB;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [scripts, scriptsClientId]);

  const handleMarkScriptsRecorded = () => {
    const now = new Date().toISOString();
    selectedScriptIds.forEach(id => {
      const script = scripts.find(s => s.id === id);
      if (script) updateScript({ ...script, recorded: true, updatedAt: now });
    });
    toast.success(`${selectedScriptIds.size} roteiro(s) marcado(s) como gravado(s)`);
    setScriptsOpen(false);
  };

  const handleReturnScript = (script: Script) => {
    updateScript({ ...script, recorded: false, updatedAt: new Date().toISOString() });
    toast.success('Roteiro retornado');
  };

  const handleDownloadSelectedPdf = useCallback(async () => {
    const selectedScripts = scripts.filter(s => selectedScriptIds.has(s.id));
    if (selectedScripts.length === 0) return;

    const client = clients.find(c => c.id === scriptsClientId);
    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');

    // Build all scripts into a single continuous document with one header
    const scriptsHtml = selectedScripts.map((script, i) => `
      <div style="padding: 24px 40px 16px; ${i > 0 ? 'border-top: 2px solid #e5e5e5; margin-top: 16px;' : ''}">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          ${script.priority === 'urgent' ? '<span style="color:#dc2626; font-weight:bold;">🚨 URGENTE</span>' : ''}
          ${script.priority === 'priority' ? '<span style="color:#d97706; font-weight:bold;">⭐ PRIORITÁRIO</span>' : ''}
        </div>
        <h2 style="font-size:20px; margin:0 0 4px;">${script.title}</h2>
        <p style="font-size:12px; color:#666; margin:0 0 14px;">
          ${SCRIPT_VIDEO_TYPE_LABELS[script.videoType]} · Roteiro ${i + 1} de ${selectedScripts.length}
        </p>
        <div style="font-size:13px; line-height:1.7;">
          ${highlightQuotesForPdf(script.content)}
        </div>
      </div>
    `).join('');

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;padding:0;';
    container.innerHTML = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a;">
        <div style="margin-bottom:0;">
          <img src="${pulseHeader}" style="width:100%; display:block;" crossorigin="anonymous" />
        </div>
        <div style="padding: 8px 40px 0;">
          <p style="font-size:14px; font-weight:600; color:#333; margin:0;">
            ${client?.companyName || 'Cliente'} — ${selectedScripts.length} roteiro${selectedScripts.length !== 1 ? 's' : ''}
          </p>
          <p style="font-size:11px; color:#999; margin:2px 0 0;">
            ${new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
        ${scriptsHtml}
        <div style="padding: 16px 40px 24px; border-top:1px solid #e5e5e5; text-align:center; margin-top:16px;">
          <p style="font-size:11px; color:#999; margin:0;">Roteiros gerados por Pulse Growth Marketing</p>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      // Paginate: slice the single tall image across multiple pages
      let yOffset = 0;
      let page = 0;
      while (yOffset < imgHeight) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yOffset, pdfWidth, imgHeight);
        yOffset += pdfPageHeight;
        page++;
      }

      pdf.save(`roteiros-${client?.companyName?.replace(/\s+/g, '-').toLowerCase() || 'cliente'}.pdf`);
      toast.success(`PDF com ${selectedScripts.length} roteiro(s) baixado`);
    } finally {
      document.body.removeChild(container);
    }
  }, [selectedScriptIds, scripts, scriptsClientId, clients]);


  const stats = useMemo(() => {
    const monthStart2 = startOfMonth(today);
    const monthEnd2 = endOfMonth(today);
    const monthRecs = myRecordings.filter(r => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start: monthStart2, end: monthEnd2 });
    });
    const weekRecs = myRecordings.filter(r => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    });

    const doneMonth = monthRecs.filter(r => r.status === 'concluida');
    const doneWeek = weekRecs.filter(r => r.status === 'concluida');
    const uniqueClients = new Set(doneMonth.map(r => r.clientId)).size;
    const totalRecordings = doneMonth.length;
    const reelsProduced = doneMonth.reduce((acc, rec) => {
      const client = clients.find(c => c.id === rec.clientId);
      return acc + (client?.weeklyReels || 0);
    }, 0);
    const avgReelsPerRec = totalRecordings > 0 ? (reelsProduced / totalRecordings).toFixed(1) : '0';

    return {
      todayDone: todayRecs.filter(r => r.status === 'concluida').length,
      todayTotal: todayRecs.length,
      weekDone: doneWeek.length,
      weekTotal: weekRecs.filter(r => r.status !== 'cancelada').length,
      monthRecordings: totalRecordings,
      uniqueClients,
      reelsProduced,
      avgReelsPerRec,
    };
  }, [myRecordings, todayRecs, clients, today, weekStart, weekEnd]);

  return (
    <div className="space-y-4 sm:space-y-5 max-w-[1400px] px-1 sm:px-0">
      {/* Header with animated rocket */}
      <div className="flex items-center gap-3">
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <Rocket size={28} className="text-primary -rotate-45" />
          <motion.div
            animate={{ opacity: [0.6, 1, 0.4], scale: [0.8, 1.2, 0.6] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-3 rounded-full bg-gradient-to-t from-warning via-primary to-transparent blur-[2px] rotate-45"
          />
        </motion.div>
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold">Olá, {currentUser?.name} 👋</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">{format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
      </div>

      {/* ── Live Recording Card ── */}
      {activeRecordingId && (() => {
        const activeRec = recordings.find(r => r.id === activeRecordingId);
        const activeRecMeta = activeRecordings.find(a => a.recordingId === activeRecordingId);
        if (!activeRec) return null;
        const planned = plannedScripts[activeRecordingId] || activeRecMeta?.plannedScriptIds || [];
        const client = clients.find(c => c.id === activeRec.clientId);
        const isStar = client?.fullShiftRecording || false;
        // Star clients use full shift (e.g. 08:30-12:00 = 210min), regular = recordingDuration (90min)
        const durationMin = isStar
          ? (client?.preferredShift === 'tarde'
            ? (timeToMin(settings.shiftBEnd) - timeToMin(settings.shiftBStart))
            : (timeToMin(settings.shiftAEnd) - timeToMin(settings.shiftAStart)))
          : settings.recordingDuration;
        return (
          <LiveRecordingCard
            clientName={getClientName(activeRec.clientId)}
            clientColor={getClientColor(activeRec.clientId)}
            startedAt={activeRecMeta?.startedAt || new Date().toISOString()}
            recordingDurationMinutes={durationMin}
            scriptsCount={planned.length}
            isStarClient={isStar}
            recordingId={activeRec.id}
            videomakerId={vmId}
            clientId={activeRec.clientId}
            onFinish={() => handleFinishRecording(activeRec)}
            onViewScripts={() => openScripts(activeRec.clientId)}
          />
        );
      })()}

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Gravações Hoje', value: `${stats.todayDone}/${stats.todayTotal}`, icon: Video, color: 'bg-success/15 text-success' },
          { label: 'Clientes Atendidos', value: stats.uniqueClients, icon: UsersIcon, color: 'bg-info/15 text-info' },
          { label: 'Gravações (mês)', value: stats.monthRecordings, icon: TrendingUp, color: 'bg-primary/15 text-primary' },
          { label: 'Média Reels/Grav.', value: stats.avgReelsPerRec, icon: BarChart3, color: 'bg-warning/15 text-warning' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="stat-card">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <p className="text-xl font-display font-bold">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── ROW: Today's Recordings + Active ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Gravações de Hoje</h3>
            <span className="text-xs text-muted-foreground">{todayRecs.length} gravações</span>
          </div>

          {todayRecs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma gravação hoje</div>
          ) : (
            <div className="space-y-2">
              {todayRecs.map((rec, i) => {
                const color = getClientColor(rec.clientId);
                const isActive = activeRecordingId === rec.id;
                const isDone = rec.status === 'concluida';

                return (
                  <motion.div key={rec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' :
                      waitingRecordingId === rec.id ? 'border-warning bg-warning/5 ring-1 ring-warning/30' :
                      isDone ? 'border-success/30 bg-success/5' : 'border-border bg-secondary/50'
                    }`}>
                    <div className="w-1.5 h-12 rounded-full shrink-0" style={{ backgroundColor: `hsl(${color})` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{getClientName(rec.clientId)}</span>
                        <Badge variant="outline" className="text-[10px]">{typeLabels[rec.type]}</Badge>
                        {isActive && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] animate-pulse">
                            ● Em andamento
                          </Badge>
                        )}
                        {waitingRecordingId === rec.id && (
                          <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                            <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">
                              <Hourglass size={10} className="mr-0.5 animate-spin" style={{ animationDuration: '3s' }} />
                              Aguardando · {formatWaitTime(waitingElapsed)}
                            </Badge>
                          </motion.div>
                        )}
                        {isDone && (
                          <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
                            <Check size={10} className="mr-0.5" /> Concluída
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Clock size={10} className="inline mr-1" />{rec.startTime}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {rec.status === 'agendada' && !isActive && waitingRecordingId !== rec.id && !waitingRecordingId && (
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button size="sm" variant="outline" onClick={() => handleStartWaiting(rec)}
                            className="gap-1 border-warning/50 text-warning hover:bg-warning/10 hover:text-warning">
                            <Hourglass size={14} /> Aguardar
                          </Button>
                        </motion.div>
                      )}
                      {waitingRecordingId === rec.id && (
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button size="sm" variant="outline" onClick={async () => { await handleStopWaiting(); }}
                            className="gap-1 border-destructive/50 text-destructive hover:bg-destructive/10">
                            <Square size={14} /> Parar Espera
                          </Button>
                        </motion.div>
                      )}
                      {rec.status === 'agendada' && !isActive && (
                        <Button size="sm" onClick={async () => { if (waitingRecordingId === rec.id) await handleStopWaiting(); handleStartRecording(rec); }} className="gap-1">
                          <Play size={14} /> Iniciar
                        </Button>
                      )}
                      {isActive && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openScripts(rec.clientId)} className="gap-1">
                            <FileText size={14} /> Roteiros
                          </Button>
                          <Button size="sm" onClick={() => handleFinishRecording(rec)} className="gap-1 bg-success hover:bg-success/90 text-success-foreground">
                            <Square size={14} /> Finalizar
                          </Button>
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Performance card */}
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Meu Desempenho</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Semana</span>
                <span className="font-bold">{stats.weekDone}/{stats.weekTotal}</span>
              </div>
              <Progress value={stats.weekTotal > 0 ? (stats.weekDone / stats.weekTotal) * 100 : 0} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.uniqueClients}</p>
                <p className="text-[10px] text-muted-foreground">Clientes atendidos</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.monthRecordings}</p>
                <p className="text-[10px] text-muted-foreground">Gravações (mês)</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.reelsProduced}</p>
                <p className="text-[10px] text-muted-foreground">Reels produzidos</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.avgReelsPerRec}</p>
                <p className="text-[10px] text-muted-foreground">Média reels/grav.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Kanban Semanal ── */}
      <div className="glass-card p-5">
        <h3 className="font-display font-semibold text-sm mb-4">Minha Semana</h3>
        <div className="grid grid-cols-5 gap-2 min-h-[300px]">
          {weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, today);
            const dayRecs = getRecsForDay(day);

            return (
              <div key={dateStr} className={`glass-card p-3 ${isToday ? 'ring-1 ring-primary' : ''}`}>
                <div className="text-center mb-3">
                  <p className={`text-xs font-semibold uppercase ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {format(day, 'EEE', { locale: ptBR })}
                  </p>
                  <p className={`text-lg font-display font-bold ${isToday ? 'text-primary' : ''}`}>
                    {format(day, 'd')}
                  </p>
                </div>
                <div className="space-y-2">
                  {dayRecs.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">Livre</p>
                  )}
                  {dayRecs.map(rec => {
                    const color = getClientColor(rec.clientId);
                    const isActive = activeRecordingId === rec.id;
                    const isDone = rec.status === 'concluida';
                    return (
                      <div key={rec.id}
                        onClick={() => {
                          if (isDone) return;
                          if (isActive) {
                            handleFinishRecording(rec);
                          } else if (rec.status === 'agendada') {
                            handleStartRecording(rec);
                          }
                        }}
                        className={`rounded-lg border p-2 text-xs space-y-1 cursor-pointer transition-all hover:shadow-md ${
                          isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' :
                          isDone ? 'border-success/30 bg-success/5 cursor-default' : 'border-border bg-card hover:border-primary/40'
                        }`}
                        style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${color})` }}
                      >
                        <p className="font-medium truncate">{getClientName(rec.clientId)}</p>
                        <p className="text-muted-foreground">{rec.startTime}</p>
                        {isDone && (
                          <Badge className="bg-success/20 text-success border-success/30 text-[9px]">Gravado</Badge>
                        )}
                        {isActive && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] animate-pulse">● Ao vivo</Badge>
                        )}
                        {!isActive && !isDone && rec.status === 'agendada' && (
                          <div className="flex items-center gap-1 text-primary text-[9px]">
                            <Play size={9} /> Clique para iniciar
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Finish Recording Dialog (Multi-step: 3 steps) ── */}
      <Dialog open={finishDialogOpen} onOpenChange={v => { if (!v) { setFinishDialogOpen(false); setFinishStep('scripts'); setDriveLinks({}); setSelectedEditorId('__auto__'); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <motion.div animate={{ rotate: [0, -15, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <Rocket size={20} className="text-primary -rotate-45" />
              </motion.div>
              Finalizar Gravação — {(() => {
                const rec = recordings.find(r => r.id === finishRecordingId);
                return rec ? getClientName(rec.clientId) : '';
              })()}
            </DialogTitle>
          </DialogHeader>

          {/* Animated Step Timeline */}
          <div className="flex items-center gap-0 mb-4">
            {[
              { key: 'scripts', label: 'Roteiros', num: 1 },
              { key: 'alterations', label: 'Mudanças', num: 2 },
              { key: 'drive', label: 'Envio', num: 3 },
            ].map((step, i) => {
              const steps = ['scripts', 'alterations', 'drive'];
              const currentIdx = steps.indexOf(finishStep);
              const stepIdx = steps.indexOf(step.key);
              const isActive = finishStep === step.key;
              const isDone = stepIdx < currentIdx;
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <motion.div
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all w-full justify-center ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : isDone
                        ? 'bg-success/20 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                    animate={isActive ? { scale: [1, 1.03, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <motion.span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isActive ? 'bg-primary-foreground/20' : isDone ? 'bg-success/30' : 'bg-muted-foreground/20'
                      }`}
                      animate={isDone ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      {isDone ? <Check size={10} /> : step.num}
                    </motion.span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </motion.div>
                  {i < 2 && (
                    <motion.div
                      className={`h-0.5 w-4 mx-1 rounded-full shrink-0 ${isDone ? 'bg-success' : 'bg-muted'}`}
                      animate={isDone ? { scaleX: [0, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── STEP 1: Select which scripts were recorded ── */}
          <AnimatePresence mode="wait">
          {finishStep === 'scripts' && (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <p className="text-sm text-muted-foreground mb-3">
                Selecione quais roteiros foram efetivamente gravados. Os não selecionados voltam para a <strong>Zona de Ideias</strong>.
              </p>

              {finishClientScripts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum roteiro planejado para esta sessão</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {finishClientScripts.map((script, i) => {
                    const isSelected = completedScriptIds.has(script.id);
                    const isRejected = rejectedScripts.has(script.id);
                    return (
                      <motion.div
                        key={script.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          isSelected ? 'border-success/50 bg-success/5 shadow-sm shadow-success/10' :
                          isRejected ? 'border-destructive/40 bg-destructive/5' :
                          'border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={checked => {
                              if (checked) {
                                setCompletedScriptIds(prev => new Set(prev).add(script.id));
                                setRejectedScripts(prev => { const n = new Set(prev); n.delete(script.id); return n; });
                              } else {
                                setCompletedScriptIds(prev => { const n = new Set(prev); n.delete(script.id); return n; });
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {script.priority === 'urgent' && <AlertTriangle size={13} className="text-destructive shrink-0" />}
                              {script.priority === 'priority' && <Star size={13} className="text-warning shrink-0" />}
                              <p className="font-medium text-sm truncate">{script.title}</p>
                              <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{SCRIPT_VIDEO_TYPE_LABELS[script.videoType]}</Badge>
                            </div>
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              if (isRejected) {
                                setRejectedScripts(prev => { const n = new Set(prev); n.delete(script.id); return n; });
                              } else {
                                setRejectedScripts(prev => new Set(prev).add(script.id));
                                setCompletedScriptIds(prev => { const n = new Set(prev); n.delete(script.id); return n; });
                              }
                            }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all shrink-0 ${
                              isRejected ? 'bg-destructive/20 text-destructive border-destructive/40' : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                            }`}
                          >
                            <ThumbsDown size={10} /> {isRejected ? 'Rejeitado' : 'Não gostou'}
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setFinishDialogOpen(false)} className="flex-1">Cancelar</Button>
                <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button onClick={handleGoToAlterationsStep} className="w-full gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                    <ArrowRight size={16} />
                    Próximo ({completedScriptIds.size} gravado{completedScriptIds.size !== 1 ? 's' : ''})
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: Mark alterations ── */}
          {finishStep === 'alterations' && (
            <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <p className="text-sm text-muted-foreground mb-3">
                Para cada roteiro gravado, indique se houve mudança no roteiro original.
              </p>

              <div className="space-y-3">
                {Array.from(completedScriptIds).map((id, i) => {
                  const script = scripts.find(s => s.id === id);
                  if (!script) return null;
                  const isAltered = alteredScripts.has(id);
                  const isVerbal = verbalScripts.has(id);
                  const isNormal = !isAltered && !isVerbal;

                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isAltered ? 'border-warning/50 bg-warning/5' :
                        isVerbal ? 'border-info/50 bg-info/5' :
                        'border-success/40 bg-success/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-3">
                        <p className="font-medium text-sm">{script.title}</p>
                        <Badge variant="outline" className="text-[10px] ml-auto">{SCRIPT_VIDEO_TYPE_LABELS[script.videoType]}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { active: isNormal, label: 'Sem mudanças', icon: Check, color: 'success', onClick: () => { setAlteredScripts(prev => { const n = new Set(prev); n.delete(id); return n; }); setVerbalScripts(prev => { const n = new Set(prev); n.delete(id); return n; }); }},
                          { active: isAltered, label: 'Alterado', icon: Pencil, color: 'warning', onClick: () => { setAlteredScripts(prev => new Set(prev).add(id)); setVerbalScripts(prev => { const n = new Set(prev); n.delete(id); return n; }); }},
                          { active: isVerbal, label: 'Verbal', icon: MessageCircle, color: 'info', onClick: () => { setVerbalScripts(prev => new Set(prev).add(id)); setAlteredScripts(prev => { const n = new Set(prev); n.delete(id); return n; }); }},
                        ].map(btn => (
                          <motion.button
                            key={btn.label}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={btn.onClick}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition-all ${
                              btn.active ? `bg-${btn.color}/20 text-${btn.color} border-${btn.color}/50 shadow-sm` : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                            }`}
                          >
                            <btn.icon size={12} /> {btn.label}
                          </motion.button>
                        ))}
                      </div>

                      <AnimatePresence>
                        {(isAltered || isVerbal) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3"
                          >
                            <label className={`text-[11px] font-medium mb-1 block ${isAltered ? 'text-warning' : 'text-info'}`}>
                              📝 {isAltered ? 'O que mudou?' : 'Notas adicionais (opcional)'}
                            </label>
                            <Textarea
                              value={alterationNotes[id] || ''}
                              onChange={e => setAlterationNotes(prev => ({ ...prev, [id]: e.target.value }))}
                              placeholder={isAltered ? 'Descreva como o roteiro foi alterado...' : 'Observações para o editor...'}
                              className="min-h-[60px] text-xs"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex gap-2 mt-4">
                <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" onClick={() => setFinishStep('scripts')} className="w-full gap-1.5">
                    <ChevronLeft size={16} /> Voltar
                  </Button>
                </motion.div>
                <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button onClick={handleGoToDriveStep} className="w-full gap-1.5 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                    <ArrowRight size={16} /> Próximo
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: Drive links + send ── */}
          {finishStep === 'drive' && (
            <motion.div key="step3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <Alert className="border-warning/40 bg-warning/5 mb-3">
                <AlertTriangle size={16} className="text-warning" />
                <AlertDescription className="text-xs text-warning">
                  <strong>Importante:</strong> As falas devem estar separadas dos takes no Google Drive. Organize as pastas para facilitar a edição.
                </AlertDescription>
              </Alert>

              <p className="text-sm text-muted-foreground mb-3">
                Adicione o link do Google Drive com os materiais de cada roteiro. O editor terá <strong>{settings.editingDeadlineHours || 48}h</strong> para editar.
              </p>

              <div className="space-y-3">
                {Array.from(new Set([...completedScriptIds, ...alteredScripts, ...verbalScripts])).map((id, i) => {
                  const s = scripts.find(s => s.id === id);
                  if (!s) return null;
                  const isAlt = alteredScripts.has(id);
                  const isVerb = verbalScripts.has(id);
                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`p-4 rounded-xl border-2 ${
                        isAlt ? 'bg-warning/5 border-warning/30' :
                        isVerb ? 'bg-info/5 border-info/30' : 'bg-muted/30 border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          📁 {s.title}
                        </p>
                        {isAlt && <Badge className="text-[9px] bg-warning/20 text-warning border-warning/40">✏️ Alterado</Badge>}
                        {isVerb && <Badge className="text-[9px] bg-info/20 text-info border-info/40">🗣️ Verbal</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link size={16} className="text-muted-foreground shrink-0" />
                        <Input
                          value={driveLinks[id] || ''}
                          onChange={e => setDriveLinks(prev => ({ ...prev, [id]: e.target.value }))}
                          placeholder="https://drive.google.com/drive/folders/..."
                          className="h-9"
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Optional editor selection */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-4 rounded-xl border-2 border-border bg-muted/20 mt-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck size={16} className="text-muted-foreground" />
                  <p className="text-sm font-medium">Escolher Editor <span className="text-muted-foreground font-normal">(opcional)</span></p>
                </div>
                <Select value={selectedEditorId} onValueChange={setSelectedEditorId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Atribuição automática" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">Atribuição automática</SelectItem>
                    {editors.map(editor => (
                      <SelectItem key={editor.id} value={editor.id}>
                        {editor.name} {editor.role === 'admin' ? '(Admin)' : '(Editor)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>

              <div className="flex gap-2 mt-4">
                <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" onClick={() => setFinishStep('alterations')} className="w-full gap-1.5">
                    <ChevronLeft size={16} /> Voltar
                  </Button>
                </motion.div>
                <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button 
                    onClick={confirmFinish} 
                    disabled={Array.from(new Set([...completedScriptIds, ...alteredScripts, ...verbalScripts])).some(id => !driveLinks[id]?.trim())}
                    className="w-full gap-2 bg-gradient-to-r from-orange-600 via-red-500 to-orange-500 hover:from-orange-500 hover:via-red-400 hover:to-orange-400 text-white shadow-lg shadow-red-500/30 font-bold py-5 text-base rounded-xl relative overflow-hidden group"
                  >
                    <motion.div 
                      animate={{ y: [0, -4, 0], rotate: [0, -15, 0] }} 
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                      className="relative"
                    >
                      <Rocket size={20} className="-rotate-45 relative z-10" />
                      {/* Fire particles */}
                      <motion.div
                        animate={{ opacity: [0.8, 1, 0.6], scale: [1, 1.3, 0.8], y: [0, 6, 2] }}
                        transition={{ duration: 0.4, repeat: Infinity }}
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-4 rounded-full bg-gradient-to-t from-yellow-400 via-orange-400 to-transparent blur-[2px] rotate-45"
                      />
                      <motion.div
                        animate={{ opacity: [0.6, 1, 0.4], scale: [0.8, 1.1, 0.6], y: [0, 8, 4] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: 0.15 }}
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2 h-3 rounded-full bg-gradient-to-t from-yellow-300 to-transparent blur-[1px] rotate-45"
                      />
                    </motion.div>
                    Enviar para Edicao
                    {/* Button glow effect */}
                    <motion.div 
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 pointer-events-none"
                    />
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* ── Celebration Overlay ── */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
          >
            {/* Background dim */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black"
            />
            
            {/* Particle effects */}
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: 0, y: 0, opacity: 1, scale: 1 
                }}
                animate={{ 
                  x: (Math.random() - 0.5) * 500,
                  y: (Math.random() - 0.5) * 500 - 100,
                  opacity: 0,
                  scale: 0,
                  rotate: Math.random() * 720
                }}
                transition={{ duration: 2 + Math.random(), delay: Math.random() * 0.3 }}
                className="absolute text-2xl"
                style={{ zIndex: 10000 }}
              >
                {['🔥', '⭐', '✨', '🚀', '💫'][i % 5]}
              </motion.div>
            ))}

            {/* Main celebration card */}
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, y: -100, opacity: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200 }}
              className="relative z-[10001] flex flex-col items-center gap-4 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-orange-500/30 rounded-3xl px-12 py-10 shadow-2xl shadow-orange-500/20"
            >
              {/* Rocket flying up */}
              <motion.div
                animate={{ y: [10, -20, 10] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative"
              >
                <span className="text-6xl">🚀</span>
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.3], scale: [1, 1.4, 0.8] }}
                  transition={{ duration: 0.4, repeat: Infinity }}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-3xl"
                >
                  🔥
                </motion.div>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-white/60 text-sm font-medium uppercase tracking-widest"
              >
                Gravacao Finalizada!
              </motion.p>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', damping: 8 }}
                className="flex items-baseline gap-2"
              >
                <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-yellow-300 to-orange-400">
                  +{celebrationScore}
                </span>
                <span className="text-xl font-bold text-orange-300">pts</span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="flex items-center gap-2 text-white/40 text-xs"
              >
                <TrendingUp size={14} />
                <span>Conteudo enviado para edicao</span>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scripts Dialog ── */}
      <Dialog open={scriptsOpen} onOpenChange={(open) => { setScriptsOpen(open); if (!open) setViewingScript(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingScript ? (
                <>
                  <button onClick={() => setViewingScript(null)} className="p-1 rounded hover:bg-muted"><ChevronLeft size={18} /></button>
                  {viewingScript.title}
                </>
              ) : (
                <>
                  <FileText size={18} />
                  Roteiros — {clients.find(c => c.id === scriptsClientId)?.companyName}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewingScript ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-[10px]">{SCRIPT_VIDEO_TYPE_LABELS[viewingScript.videoType]}</Badge>
                {viewingScript.priority === 'urgent' && (
                  <Badge className="text-[10px] bg-destructive/20 text-destructive border-destructive/30"><AlertTriangle size={10} className="mr-0.5" /> Urgente</Badge>
                )}
                {viewingScript.priority === 'priority' && (
                  <Badge className="text-[10px] bg-warning/20 text-warning border-warning/30"><Star size={10} className="mr-0.5" /> Prioritário</Badge>
                )}
              </div>
              <div className="prose prose-sm max-w-none p-4 rounded-xl bg-muted/30 border border-border min-h-[200px]"
                dangerouslySetInnerHTML={{ __html: highlightQuotes(viewingScript.content) || '<em>Sem conteúdo</em>' }} />
            </div>
          ) : (
            <>
              {scriptsRecordingId && (
                <p className="text-sm text-muted-foreground">
                  Revise os roteiros disponíveis, selecione os que vai gravar e inicie a gravação.
                </p>
              )}

              {clientScripts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum roteiro pendente</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clientScripts.map(script => {
                    const isUrgent = script.priority === 'urgent';
                    const isLocked = isUrgent && !!scriptsRecordingId;
                    return (
                    <div key={script.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      script.priority === 'urgent' ? 'border-destructive/40 bg-destructive/5' :
                      script.priority === 'priority' ? 'border-warning/40 bg-warning/5' : 'border-border hover:bg-muted/30'
                    }`}>
                      <Checkbox
                        checked={selectedScriptIds.has(script.id)}
                        disabled={isLocked}
                        onCheckedChange={checked => {
                          if (isLocked) return;
                          const next = new Set(selectedScriptIds);
                          checked ? next.add(script.id) : next.delete(script.id);
                          setSelectedScriptIds(next);
                        }}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {script.priority === 'urgent' && <AlertTriangle size={13} className="text-destructive shrink-0" />}
                          {script.priority === 'priority' && <Star size={13} className="text-warning shrink-0" />}
                          <p className="font-medium text-sm">{script.title}</p>
                          {isLocked && (
                            <Badge className="text-[9px] bg-destructive/20 text-destructive border-destructive/30">Obrigatório</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">{SCRIPT_VIDEO_TYPE_LABELS[script.videoType]}</Badge>
                          {script.priority === 'urgent' && !isLocked && <Badge className="text-[9px] bg-destructive/20 text-destructive border-destructive/30">Urgente</Badge>}
                          {script.priority === 'priority' && <Badge className="text-[9px] bg-warning/20 text-warning border-warning/30">Prioritário</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-1.5"
                          dangerouslySetInnerHTML={{ __html: highlightQuotes(script.content) || '<em>Sem conteúdo</em>' }} />
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Ler roteiro"
                        onClick={() => setViewingScript(script)}>
                        <Eye size={14} />
                      </Button>
                    </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 mt-2">
                {selectedScriptIds.size > 0 && (
                  <>
                    <Button onClick={handleDownloadSelectedPdf} variant="outline" className="gap-1.5">
                      <Download size={16} /> PDF ({selectedScriptIds.size})
                    </Button>
                    <Button onClick={handleMarkScriptsRecorded} variant="outline" className="flex-1">
                      <Check size={16} className="mr-2" />
                      Marcar {selectedScriptIds.size} como gravado(s)
                    </Button>
                  </>
                )}
                {scriptsRecordingId && (() => {
                  const rec = recordings.find(r => r.id === scriptsRecordingId);
                  if (!rec || rec.status !== 'agendada') return null;
                  return (
                    <Button onClick={() => confirmStartRecording(rec)} className="flex-1 gap-1.5">
                      <Play size={16} /> Iniciar Gravação
                    </Button>
                  );
                })()}
              </div>

              {/* Already recorded */}
              {(() => {
                const recorded = scripts.filter(s => s.clientId === scriptsClientId && s.recorded);
                if (recorded.length === 0) return null;
                return (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm font-medium mb-2">Roteiros já gravados</p>
                    <div className="space-y-2">
                      {recorded.map(script => (
                        <div key={script.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{script.title}</p>
                            <Badge className="text-[10px] bg-success/20 text-success border-success/30">{SCRIPT_VIDEO_TYPE_LABELS[script.videoType]}</Badge>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleReturnScript(script)}>
                            <Undo2 size={14} className="mr-1" /> Retornar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
