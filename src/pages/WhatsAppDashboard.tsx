import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  MessageSquare, Settings, History, Check, Key, Zap, Pencil, ClipboardCheck, Clock,
  CheckCheck, Ban, Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import WhatsAppConnections from '@/components/whatsapp/WhatsAppConnections';
import { ptBR } from 'date-fns/locale';
import {
  getWhatsAppConfig,
  updateWhatsAppConfig,
  getWhatsAppMessages,
  WHATSAPP_HISTORY_PAGE,
  getMessageStats,
  getWhatsAppConfirmations,
  getConfirmationStats,
  clearConfirmationHistory,
  type WhatsAppConfig,
  type WhatsAppMessage,
  type WhatsAppConfirmation,
} from '@/services/whatsappService';

/**
 * Central de WhatsApp: confirmações, histórico, modelos de mensagem e, para o admin, conexões e automações.
 * Fica dentro de Configurações → WhatsApp (`embedded` esconde o título da página).
 */
export default function WhatsAppDashboard({ embedded = false }: { embedded?: boolean }) {
  const { clients, recordings, users, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.roles?.includes('admin') === true;

  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0 });
  const [confirmationStats, setConfirmationStats] = useState({ pending: 0, confirmed: 0, cancelled: 0, backupInvites: 0 });
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [confirmations, setConfirmations] = useState<WhatsAppConfirmation[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const historyRequest = useRef(0);
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [cfg, st, confs, cStats] = await Promise.all([
      getWhatsAppConfig(),
      getMessageStats(),
      getWhatsAppConfirmations(),
      getConfirmationStats(),
    ]);
    setConfig(cfg);
    setStats(st);
    setConfirmations(confs);
    setConfirmationStats(cStats);
    setConfigLoading(false);
  };

  // histórico: uma página por vez, com cliente e status filtrados no servidor
  const loadMessages = useCallback(async (before?: string) => {
    const request = ++historyRequest.current;
    if (before) setLoadingMoreMessages(true);
    else setMessagesLoading(true);
    const page = await getWhatsAppMessages({
      clientId: filterClient !== 'all' ? filterClient : undefined,
      status: filterStatus !== 'all' ? filterStatus : undefined,
      before,
    });
    if (request !== historyRequest.current) return; // filtro mudou no meio: vale a busca mais nova
    setMessages(prev => {
      if (!before) return page;
      const seen = new Set(prev.map(m => m.id));
      return [...prev, ...page.filter(m => !seen.has(m.id))];
    });
    setMessagesHasMore(page.length >= WHATSAPP_HISTORY_PAGE);
    setMessagesLoading(false);
    setLoadingMoreMessages(false);
  }, [filterClient, filterStatus]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const handleConfigSave = async () => {
    if (!config) return;
    const ok = await updateWhatsAppConfig(config);
    if (ok) toast.success('Configurações salvas');
    else toast.error('Erro ao salvar');
  };

  const filteredMessages = useMemo(() => {
    let msgs = messages;
    if (filterClient !== 'all') msgs = msgs.filter(m => m.clientId === filterClient);
    if (filterStatus !== 'all') msgs = msgs.filter(m => m.status === filterStatus);
    return msgs;
  }, [messages, filterClient, filterStatus]);

  const getClientName = (id: string | null) => {
    if (!id) return '—';
    return clients.find(c => c.id === id)?.companyName || '—';
  };

  const triggerLabels: Record<string, string> = {
    manual: 'Manual',
    auto_recording: 'Agendamento',
    auto_reminder: 'Lembrete',
    auto_confirmation: 'Confirmação',
    auto_backup: 'Backup',
    auto_design_approved: 'Arte',
    cobranca: 'Cobrança',
    cobranca_lembrete: 'Cobrança (lembrete)',
    endo_daily_tasks: 'Tarefas do dia',
    crm_reminder: 'CRM',
    auto_holiday: 'Feriado',
    clube_cupom: 'Clube (cupom)',
    clube_campanha: 'Clube (campanha)',
    teste: 'Teste',
  };

  const confirmationStatusLabels: Record<string, { label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }> = {
    pending: { label: 'Aguardando', variant: 'outline' },
    confirmed: { label: 'Confirmado', variant: 'default' },
    cancelled: { label: 'Cancelado', variant: 'destructive' },
    expired: { label: 'Expirado', variant: 'secondary' },
  };

  // unavailable: o sistema ainda não manda este aviso (nenhuma rotina usa o modelo); a chave fica travada
  const templateFields: { key: keyof WhatsAppConfig; toggleKey?: keyof WhatsAppConfig; label: string; description: string; variables: string; unavailable?: boolean }[] = [
    {
      key: 'msgRecordingScheduled',
      toggleKey: 'autoRecordingScheduled',
      label: 'Novo Agendamento de Gravação',
      description: 'Enviada quando uma gravação é agendada',
      variables: '{nome_cliente}, {data_gravacao}, {hora_gravacao}, {videomaker}, {link_portal}',
    },
    {
      key: 'msgConfirmation',
      toggleKey: 'autoConfirmation',
      label: '📋 Confirmação de Gravação (24h)',
      description: 'Enviada 24h antes pedindo confirmação — direciona o cliente para confirmar no portal',
      variables: '{nome_cliente}, {data_gravacao}, {hora_gravacao}, {videomaker}, {link_portal}',
    },
    {
      key: 'msgConfirmationConfirmed',
      label: '✅ Resposta: Gravação Confirmada',
      description: 'Enviada quando o cliente confirma a gravação',
      variables: '{nome_cliente}, {data_gravacao}, {hora_gravacao}, {link_portal}',
    },
    {
      key: 'msgConfirmationCancelled',
      label: '❌ Resposta: Gravação Cancelada',
      description: 'Enviada quando o cliente cancela a gravação',
      variables: '{nome_cliente}, {link_portal}',
    },
    {
      key: 'msgBackupInvite',
      label: '🔄 Convite para Cliente Backup',
      description: 'Enviada para clientes backup quando uma vaga é liberada',
      variables: '{nome_cliente}, {data_gravacao}, {hora_gravacao}, {link_portal}',
    },
    {
      key: 'msgBackupConfirmed',
      label: '🎯 Backup Confirmado',
      description: 'Enviada quando um cliente backup aceita a vaga',
      variables: '{nome_cliente}, {link_portal}',
      unavailable: true,
    },
    {
      key: 'msgTaskEditing',
      toggleKey: 'autoTaskEditing',
      label: '✂️ Vídeo em Edição',
      description: 'Enviada quando o vídeo é gravado e entra na fila de edição — direciona para o portal',
      variables: '{nome_cliente}, {titulo}, {link_portal}',
    },
    {
      key: 'msgVideoApproval',
      toggleKey: 'autoVideoApproval',
      label: '📤 Envio para Aprovação do Cliente',
      description: 'Enviada quando o vídeo editado é enviado para aprovação no portal',
      variables: '{nome_cliente}, {link_video}, {titulo}, {link_portal}',
    },
    {
      key: 'msgTaskApproved',
      toggleKey: 'autoTaskApproved',
      label: '✅ Vídeo Aprovado',
      description: 'Enviada quando o vídeo é aprovado e vai para agendamento',
      variables: '{nome_cliente}, {titulo}, {link_portal}',
      unavailable: true,
    },
    {
      key: 'msgApprovalExpired',
      toggleKey: 'autoApprovalExpired',
      label: '⏰ Aprovação Expirada',
      description: 'Enviada quando o prazo de aprovação expira e o vídeo segue automaticamente',
      variables: '{nome_cliente}, {titulo}, {link_portal}',
      unavailable: true,
    },
  ];

  return (
    <div className="space-y-5 max-w-[1400px]">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <MessageSquare className="text-success" size={24} /> Central de WhatsApp
            </h1>
            <p className="text-muted-foreground text-sm">Gerenciamento de mensagens, confirmações e automações</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold text-success">{stats.sent}</p>
            <p className="text-[10px] text-muted-foreground">Enviadas hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold text-destructive">{stats.failed}</p>
            <p className="text-[10px] text-muted-foreground">Falhas hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold text-primary">{confirmationStats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Aguardando Resposta</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold text-success">{confirmationStats.confirmed}</p>
            <p className="text-[10px] text-muted-foreground">Confirmados</p>
          </CardContent>
        </Card>
        <Card className="bg-accent/50 border-accent">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold text-accent-foreground">{confirmationStats.backupInvites}</p>
            <p className="text-[10px] text-muted-foreground">Convites Backup</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={isAdmin ? 'config' : 'confirmations'}>
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <TabsTrigger value="confirmations" className="gap-1"><ClipboardCheck size={14} /> Confirmações</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History size={14} /> Histórico</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1"><Pencil size={14} /> Mensagens</TabsTrigger>
          {isAdmin && <TabsTrigger value="config" className="gap-1"><Settings size={14} /> Conexões</TabsTrigger>}
        </TabsList>

        {/* ── TAB: Confirmações ── */}
        <TabsContent value="confirmations" className="space-y-4">
          {confirmations.length > 0 && isAdmin && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!confirm('Apagar as confirmações já respondidas e as pendentes com mais de 7 dias? As pendentes recentes continuam (o cliente ainda pode responder).')) return;
                  const ok = await clearConfirmationHistory();
                  const [confs, cStats] = await Promise.all([getWhatsAppConfirmations(), getConfirmationStats()]);
                  setConfirmations(confs);
                  setConfirmationStats(cStats);
                  if (ok) toast.success('Histórico de confirmações apagado');
                  else toast.error('Erro ao apagar histórico');
                }}
              >
                <Trash2 size={14} /> Apagar histórico
              </Button>
            </div>
          )}
          {confirmations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma confirmação registrada ainda</p>
          ) : (
            <div className="space-y-2">
              {confirmations.map(conf => {
                const recording = recordings.find(r => r.id === conf.recordingId);
                const statusInfo = confirmationStatusLabels[conf.status] || { label: conf.status, variant: 'outline' as const };
                return (
                  <Card key={conf.id} className="overflow-hidden">
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                        conf.status === 'confirmed' ? 'bg-success' :
                        conf.status === 'cancelled' ? 'bg-destructive' :
                        conf.status === 'pending' ? 'bg-warning' : 'bg-muted-foreground'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium">{getClientName(conf.clientId)}</span>
                          <Badge variant={statusInfo.variant} className="text-[10px]">
                            {statusInfo.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {conf.type === 'confirmation' ? '📋 Confirmação' : '🔄 Backup'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {recording && (
                            <>
                              <span className="flex items-center gap-1">
                                <Clock size={10} /> {recording.date} às {recording.startTime}
                              </span>
                            </>
                          )}
                          <span>{conf.phoneNumber}</span>
                        </div>
                        {conf.responseMessage && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            Resposta: "{conf.responseMessage}"
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {conf.sentAt ? format(parseISO(conf.sentAt), "dd/MM HH:mm", { locale: ptBR }) : '—'}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── TAB: Histórico ── */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex gap-2">
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sent">Enviadas</SelectItem>
                <SelectItem value="fila">Na fila</SelectItem>
                <SelectItem value="failed">Falhas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {messagesLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filteredMessages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma mensagem encontrada</p>
          ) : (
            <div className="space-y-2">
              {filteredMessages.map(msg => (
                <Card key={msg.id} className="overflow-hidden">
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${msg.status === 'sent' ? 'bg-success' : msg.status === 'fila' ? 'bg-muted-foreground' : 'bg-destructive'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium">{msg.phoneNumber}</span>
                        <Badge variant={msg.status === 'sent' ? 'default' : msg.status === 'fila' ? 'outline' : 'destructive'} className="text-[10px]">
                          {msg.status === 'sent' ? 'Enviada' : msg.status === 'fila' ? 'Na fila' : 'Falha'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {triggerLabels[msg.triggerType] || msg.triggerType}
                        </Badge>
                        {msg.clientId && (
                          <span className="text-[10px] text-muted-foreground">{getClientName(msg.clientId)}</span>
                        )}
                        {msg.status === 'failed' && msg.apiResponse?.error && (
                          <span className="text-[10px] text-destructive">{String(msg.apiResponse.error)}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-2">{msg.message}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(parseISO(msg.sentAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </CardContent>
                </Card>
              ))}
              {messagesHasMore && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingMoreMessages}
                    onClick={() => loadMessages(messages[messages.length - 1]?.sentAt)}
                  >
                    {loadingMoreMessages ? 'Carregando...' : 'Carregar mais'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── TAB: Templates de Mensagens ── */}
        <TabsContent value="templates" className="space-y-4">
          {configLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : config ? (
            <div className="space-y-4">
              {templateFields.map(tmpl => (
                <Card key={tmpl.key} className={tmpl.unavailable || (tmpl.toggleKey && config[tmpl.toggleKey] === false) ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm">{tmpl.label}</CardTitle>
                          {tmpl.toggleKey && (
                            <Switch
                              checked={!tmpl.unavailable && (config[tmpl.toggleKey] as boolean)}
                              disabled={tmpl.unavailable}
                              onCheckedChange={v => setConfig({ ...config, [tmpl.toggleKey!]: v })}
                            />
                          )}
                          {tmpl.unavailable && <Badge variant="secondary" className="text-[10px]">Ainda não disponível</Badge>}
                        </div>
                        <CardDescription className="text-[11px]">
                          {tmpl.description}
                          {tmpl.unavailable && (
                            <span className="ml-1 font-medium text-muted-foreground">— o sistema ainda não envia este aviso</span>
                          )}
                          {tmpl.toggleKey && !tmpl.unavailable && (
                            <span className={`ml-1 font-medium ${config[tmpl.toggleKey] ? 'text-success' : 'text-muted-foreground'}`}>
                              — {config[tmpl.toggleKey] ? 'Ativo' : 'Desativado'}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <Button
                        variant={editingTemplate === tmpl.key ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEditingTemplate(editingTemplate === tmpl.key ? null : tmpl.key)}
                        className="gap-1"
                      >
                        <Pencil size={12} /> {editingTemplate === tmpl.key ? 'Fechar' : 'Editar'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {editingTemplate === tmpl.key ? (
                      <div className="space-y-2">
                        <Textarea
                          value={config[tmpl.key] as string}
                          onChange={e => setConfig({ ...config, [tmpl.key]: e.target.value })}
                          rows={6}
                          className="font-mono text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Variáveis disponíveis: <span className="font-mono text-primary">{tmpl.variables}</span>
                        </p>
                        <Button size="sm" onClick={async () => {
                          const ok = await updateWhatsAppConfig(config);
                          if (ok) { toast.success(`Mensagem "${tmpl.label}" salva`); setEditingTemplate(null); }
                          else toast.error('Erro ao salvar');
                        }} className="gap-1">
                          <Check size={14} /> Salvar
                        </Button>
                      </div>
                    ) : (
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-secondary/50 rounded-lg p-3">
                        {config[tmpl.key] as string}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              ))}
              <Button onClick={handleConfigSave} className="w-full gap-2">
                <Check size={16} /> Salvar Mensagens
              </Button>
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Erro ao carregar</p>
          )}
        </TabsContent>

        {/* ── TAB: Configurações ── */}
        {isAdmin && (
          <TabsContent value="config" className="space-y-4">
            <WhatsAppConnections />
            {configLoading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : config ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key size={16} /> Integração</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Integração Ativa</Label>
                        <p className="text-[10px] text-muted-foreground">Desligada, o sistema não envia nenhuma mensagem automática.</p>
                      </div>
                      <Switch checked={config.integrationActive} onCheckedChange={v => setConfig({ ...config, integrationActive: v })} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Respostas dos clientes (ex.: 1 para confirmar a gravação, 2 para cancelar) chegam direto pelas conexões acima.
                      A cobrança sai sozinha às 9h e a confirmação de gravação às 10h (horário de Brasília).
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap size={16} /> Automações</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Novo Agendamento</Label>
                        <p className="text-[10px] text-muted-foreground">Notificar quando uma gravação for agendada</p>
                      </div>
                      <Switch checked={config.autoRecordingScheduled} onCheckedChange={v => setConfig({ ...config, autoRecordingScheduled: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="flex items-center gap-1">Confirmação 24h <ClipboardCheck size={12} className="text-primary" /></Label>
                        <p className="text-[10px] text-muted-foreground">Enviar confirmação com opções 24h antes da gravação</p>
                      </div>
                      <Switch checked={config.autoConfirmation} onCheckedChange={v => setConfig({ ...config, autoConfirmation: v })} />
                    </div>
                  </CardContent>
                </Card>

                <div className="md:col-span-2">
                  <Button onClick={handleConfigSave} className="w-full gap-2">
                    <Check size={16} /> Salvar Configurações
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">Não consegui carregar as automações do WhatsApp. Recarregue a página.</p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
