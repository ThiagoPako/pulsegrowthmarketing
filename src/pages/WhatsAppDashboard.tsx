import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageSquare, Send, Settings, History, Check, X, Phone, Zap, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  getWhatsAppConfig,
  updateWhatsAppConfig,
  sendWhatsAppMessage,
  getWhatsAppMessages,
  getMessageStats,
  type WhatsAppMessage,
} from '@/services/whatsappService';
import ClientLogo from '@/components/ClientLogo';

export default function WhatsAppDashboard() {
  const { clients, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  // ── Stats ──
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0 });
  
  // ── Config ──
  const [config, setConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // ── Messages ──
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // ── Manual send ──
  const [sendClientId, setSendClientId] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [cfg, msgs, st] = await Promise.all([
      getWhatsAppConfig(),
      getWhatsAppMessages(),
      getMessageStats(),
    ]);
    setConfig(cfg);
    setMessages(msgs);
    setStats(st);
    setConfigLoading(false);
    setMessagesLoading(false);
  };

  // When selecting a client for manual send, auto-fill phone
  const handleSelectClient = (clientId: string) => {
    setSendClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setSendPhone((client as any).whatsapp || client.phone || '');
    }
  };

  const handleSend = async () => {
    if (!sendPhone || !sendMessage) {
      toast.error('Preencha telefone e mensagem');
      return;
    }
    setSending(true);
    const result = await sendWhatsAppMessage({
      number: sendPhone,
      message: sendMessage,
      clientId: sendClientId || undefined,
      triggerType: 'manual',
    });
    setSending(false);
    if (result.success) {
      toast.success('Mensagem enviada com sucesso!');
      setSendMessage('');
      loadData();
    } else {
      toast.error(result.error || 'Erro ao enviar mensagem');
    }
  };

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
    auto_approval: 'Aprovação',
    auto_approved: 'Aprovado',
  };

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <MessageSquare className="text-success" size={24} /> Central de WhatsApp
          </h1>
          <p className="text-muted-foreground text-sm">Gerenciamento de mensagens e automações</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-display font-bold text-success">{stats.sent}</p>
            <p className="text-xs text-muted-foreground">Enviadas hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-display font-bold text-destructive">{stats.failed}</p>
            <p className="text-xs text-muted-foreground">Falhas hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-display font-bold text-primary">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total hoje</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="send">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="send" className="gap-1"><Send size={14} /> Enviar</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History size={14} /> Histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="config" className="gap-1"><Settings size={14} /> Configurações</TabsTrigger>}
        </TabsList>

        {/* ── TAB: Enviar ── */}
        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Send size={16} /> Envio Manual de Mensagem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Selecionar Cliente</Label>
                <Select value={sendClientId} onValueChange={handleSelectClient}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Telefone (WhatsApp)</Label>
                <Input value={sendPhone} onChange={e => setSendPhone(e.target.value)} placeholder="5562999999999" />
                <p className="text-[10px] text-muted-foreground">Formato: 55 + DDD + número (ex: 5562999999999)</p>
              </div>
              <div className="space-y-1">
                <Label>Mensagem</Label>
                <Textarea value={sendMessage} onChange={e => setSendMessage(e.target.value)} placeholder="Digite a mensagem..." rows={5} />
              </div>
              <Button onClick={handleSend} disabled={sending || !sendPhone || !sendMessage} className="w-full gap-2">
                <Send size={16} /> {sending ? 'Enviando...' : 'Enviar Mensagem'}
              </Button>
            </CardContent>
          </Card>
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
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${msg.status === 'sent' ? 'bg-success' : 'bg-destructive'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{msg.phoneNumber}</span>
                        <Badge variant={msg.status === 'sent' ? 'default' : 'destructive'} className="text-[10px]">
                          {msg.status === 'sent' ? 'Enviada' : 'Falha'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {triggerLabels[msg.triggerType] || msg.triggerType}
                        </Badge>
                        {msg.clientId && (
                          <span className="text-[10px] text-muted-foreground">{getClientName(msg.clientId)}</span>
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
            </div>
          )}
        </TabsContent>

        {/* ── TAB: Configurações ── */}
        {isAdmin && (
          <TabsContent value="config" className="space-y-4">
            {configLoading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : config ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base">API & Conexão</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Integração Ativa</Label>
                      <Switch checked={config.integrationActive} onCheckedChange={v => setConfig({ ...config, integrationActive: v })} />
                    </div>
                    <div className="space-y-1">
                      <Label>ID Usuário Padrão</Label>
                      <Input value={config.defaultUserId} onChange={e => setConfig({ ...config, defaultUserId: e.target.value })} placeholder="ID do usuário na API" />
                    </div>
                    <div className="space-y-1">
                      <Label>ID Fila Padrão</Label>
                      <Input value={config.defaultQueueId} onChange={e => setConfig({ ...config, defaultQueueId: e.target.value })} placeholder="ID da fila na API" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Assinar Mensagem</Label>
                      <Switch checked={config.sendSignature} onCheckedChange={v => setConfig({ ...config, sendSignature: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Encerrar Ticket</Label>
                      <Switch checked={config.closeTicket} onCheckedChange={v => setConfig({ ...config, closeTicket: v })} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Automações</CardTitle></CardHeader>
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
                        <Label>Lembrete 24h</Label>
                        <p className="text-[10px] text-muted-foreground">Enviar lembrete 24h antes da gravação</p>
                      </div>
                      <Switch checked={config.autoRecordingReminder} onCheckedChange={v => setConfig({ ...config, autoRecordingReminder: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Envio para Aprovação</Label>
                        <p className="text-[10px] text-muted-foreground">Notificar quando vídeo for enviado para aprovação</p>
                      </div>
                      <Switch checked={config.autoVideoApproval} onCheckedChange={v => setConfig({ ...config, autoVideoApproval: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Vídeo Aprovado</Label>
                        <p className="text-[10px] text-muted-foreground">Notificar quando vídeo for aprovado</p>
                      </div>
                      <Switch checked={config.autoVideoApproved} onCheckedChange={v => setConfig({ ...config, autoVideoApproved: v })} />
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
              <p className="text-center text-muted-foreground">Erro ao carregar configurações</p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
