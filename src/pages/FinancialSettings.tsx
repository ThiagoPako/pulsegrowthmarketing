import { useState, useEffect, useMemo, useCallback } from 'react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, Info, Eye, Pencil, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { generateDeliveryReport } from '@/lib/billingReport';

const TEMPLATE_VARS = [
  { var: '{nome_cliente}', desc: 'Nome da empresa' },
  { var: '{valor}', desc: 'Valor da mensalidade' },
  { var: '{dia_vencimento}', desc: 'Dia do vencimento' },
  { var: '{dados_pagamento}', desc: 'Dados PIX (usa o template de dados de pagamento)' },
  { var: '{relatorio_entregas}', desc: 'Relatório personalizado baseado no plano do cliente' },
];

const PAYMENT_DATA_VARS = [
  { var: '{nome_recebedor}', desc: 'Nome do recebedor' },
  { var: '{banco}', desc: 'Nome do banco' },
  { var: '{chave_pix}', desc: 'Chave PIX' },
  { var: '{documento}', desc: 'CPF ou CNPJ' },
];

const DELIVERY_REPORT_VARS = [
  { var: '{horas_gravacao}', desc: 'Total de horas gravadas' },
  { var: '{sessoes}', desc: 'Número de sessões de gravação' },
  { var: '{videos}', desc: 'Vídeos produzidos' },
  { var: '{reels}', desc: 'Reels publicados' },
  { var: '{stories}', desc: 'Stories publicados' },
  { var: '{artes}', desc: 'Artes criadas' },
  { var: '{criativos}', desc: 'Criativos desenvolvidos' },
  { var: '{extras}', desc: 'Conteúdos extras entregues' },
];

export default function FinancialSettings() {
  const navigate = useNavigate();
  const { paymentConfig, updatePaymentConfig, categories, addCategory, contracts } = useFinancialData();
  const { clients } = useApp();
  const [form, setForm] = useState({
    pix_key: '', receiver_name: '', bank: '', document: '',
    msg_billing_due: '', msg_billing_overdue: '', include_delivery_report: true,
    msg_payment_data: '',
    msg_delivery_report: '',
  });
  const [newCat, setNewCat] = useState('');
  const [previewClientId, setPreviewClientId] = useState<string>('');
  const [previewTab, setPreviewTab] = useState<'due' | 'overdue'>('due');
  const [deliveryReportText, setDeliveryReportText] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    if (paymentConfig) {
      setForm({
        pix_key: paymentConfig.pix_key,
        receiver_name: paymentConfig.receiver_name,
        bank: paymentConfig.bank,
        document: paymentConfig.document,
        msg_billing_due: paymentConfig.msg_billing_due || '',
        msg_billing_overdue: paymentConfig.msg_billing_overdue || '',
        include_delivery_report: paymentConfig.include_delivery_report ?? true,
        msg_payment_data: paymentConfig.msg_payment_data || '',
        msg_delivery_report: paymentConfig.msg_delivery_report || '',
      });
    }
  }, [paymentConfig]);

  // Auto-select first client with contract
  const clientsWithContract = useMemo(() => {
    const contractClientIds = new Set(contracts.filter(c => c.status === 'ativo').map(c => c.client_id));
    return clients.filter(c => contractClientIds.has(c.id));
  }, [clients, contracts]);

  useEffect(() => {
    if (!previewClientId && clientsWithContract.length > 0) {
      setPreviewClientId(clientsWithContract[0].id);
    }
  }, [clientsWithContract, previewClientId]);

  // Fetch delivery report for selected client
  const fetchReport = useCallback(async (clientId: string) => {
    if (!clientId || !form.include_delivery_report) {
      setDeliveryReportText('');
      return;
    }
    setLoadingReport(true);
    try {
      const contract = contracts.find(c => c.client_id === clientId && c.status === 'ativo');
      const client = clients.find(c => c.id === clientId);
      const planId = contract?.plan_id || (client as any)?.plan_id || null;
      const report = await generateDeliveryReport(clientId, planId, undefined, form.msg_delivery_report || undefined);
      setDeliveryReportText(report.text);
    } catch {
      setDeliveryReportText('');
    } finally {
      setLoadingReport(false);
    }
  }, [contracts, clients, form.include_delivery_report, form.msg_delivery_report]);

  useEffect(() => {
    if (previewClientId) {
      fetchReport(previewClientId);
    }
  }, [previewClientId, fetchReport]);

  // Build preview message
  const previewMessage = useMemo(() => {
    const client = clients.find(c => c.id === previewClientId);
    const contract = contracts.find(c => c.client_id === previewClientId && c.status === 'ativo');
    if (!client || !contract) return '';

    const value = Number(contract.contract_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let paymentInfo = '';
    if (form.pix_key || form.receiver_name) {
      paymentInfo = form.msg_payment_data
        .replace(/\{nome_recebedor\}/g, form.receiver_name || '')
        .replace(/\{banco\}/g, form.bank || '')
        .replace(/\{chave_pix\}/g, form.pix_key || '')
        .replace(/\{documento\}/g, form.document || '');
    }

    const template = previewTab === 'overdue'
      ? (form.msg_billing_overdue || 'Olá, {nome_cliente}! Lembrete de pendência: {valor}. {dados_pagamento}')
      : (form.msg_billing_due || 'Olá, {nome_cliente}! Mensalidade {valor} vence dia {dia_vencimento}. {dados_pagamento}');

    let message = template
      .replace(/\{nome_cliente\}/g, client.companyName)
      .replace(/\{valor\}/g, value)
      .replace(/\{dia_vencimento\}/g, String(contract.due_day))
      .replace(/\{dados_pagamento\}/g, paymentInfo)
      .replace(/\{relatorio_entregas\}/g, deliveryReportText);

    // If template doesn't have the variable but report exists, append it
    if (deliveryReportText && !template.includes('{relatorio_entregas}')) {
      message += deliveryReportText;
    }

    return message;
  }, [previewClientId, previewTab, form, clients, contracts, deliveryReportText]);

  const handleSave = async () => {
    await updatePaymentConfig(form);
    toast.success('Configurações atualizadas');
  };

  const handleAddCat = async () => {
    if (newCat.trim()) {
      await addCategory(newCat.trim());
      setNewCat('');
      toast.success('Categoria criada');
    }
  };

  // Format preview text: bold (*text*) and line breaks
  const formatPreview = (text: string) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/(\*[^*]+\*)/g);
      return (
        <span key={i}>
          {i > 0 && <br />}
          {parts.map((part, j) => {
            if (part.startsWith('*') && part.endsWith('*')) {
              return <strong key={j}>{part.slice(1, -1)}</strong>;
            }
            return <span key={j}>{part}</span>;
          })}
        </span>
      );
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <h1 className="text-xl font-bold">Configuração Financeira</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Dados para Cobrança (PIX)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Chave PIX</Label><Input value={form.pix_key} onChange={e => setForm({ ...form, pix_key: e.target.value })} placeholder="CPF, CNPJ, e-mail ou telefone" /></div>
            <div><Label>Nome do Recebedor</Label><Input value={form.receiver_name} onChange={e => setForm({ ...form, receiver_name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Banco</Label><Input value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} /></div>
            <div><Label>CPF ou CNPJ</Label><Input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Template de Dados de Pagamento</CardTitle>
          <CardDescription className="text-xs">Personalize como os dados PIX aparecem na mensagem (variável {'{dados_pagamento}'})</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5 p-3 rounded-md bg-muted/50">
            <div className="w-full flex items-center gap-1 mb-1 text-xs text-muted-foreground"><Info size={12} /> Variáveis disponíveis:</div>
            {PAYMENT_DATA_VARS.map(v => (
              <Badge key={v.var} variant="secondary" className="text-xs font-mono cursor-help" title={v.desc}>{v.var}</Badge>
            ))}
          </div>
          <Textarea
            value={form.msg_payment_data}
            onChange={e => setForm({ ...form, msg_payment_data: e.target.value })}
            rows={5}
            className="font-mono text-xs"
            placeholder="Template dos dados de pagamento..."
          />
          <Button variant="outline" size="sm" onClick={handleSave} className="w-full"><Save size={14} className="mr-1" /> Salvar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Template de Relatório de Entregas</CardTitle>
          <CardDescription className="text-xs">Personalize o resumo de entregas incluído na cobrança (variável {'{relatorio_entregas}'}). Linhas com métricas zeradas são removidas automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5 p-3 rounded-md bg-muted/50">
            <div className="w-full flex items-center gap-1 mb-1 text-xs text-muted-foreground"><Info size={12} /> Variáveis disponíveis:</div>
            {DELIVERY_REPORT_VARS.map(v => (
              <Badge key={v.var} variant="secondary" className="text-xs font-mono cursor-help" title={v.desc}>{v.var}</Badge>
            ))}
          </div>
          <Textarea
            value={form.msg_delivery_report}
            onChange={e => setForm({ ...form, msg_delivery_report: e.target.value })}
            rows={8}
            className="font-mono text-xs"
            placeholder="Template do relatório de entregas..."
          />
          <Button variant="outline" size="sm" onClick={handleSave} className="w-full"><Save size={14} className="mr-1" /> Salvar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Templates de Cobrança</CardTitle>
          <CardDescription className="text-xs">Personalize as mensagens enviadas via WhatsApp</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5 p-3 rounded-md bg-muted/50">
            <div className="w-full flex items-center gap-1 mb-1 text-xs text-muted-foreground"><Info size={12} /> Variáveis disponíveis:</div>
            {TEMPLATE_VARS.map(v => (
              <Badge key={v.var} variant="secondary" className="text-xs font-mono cursor-help" title={v.desc}>{v.var}</Badge>
            ))}
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border">
            <div>
              <Label className="text-sm font-medium">Incluir relatório de entregas</Label>
              <p className="text-xs text-muted-foreground">Adiciona resumo de gravações, reels, stories etc. na cobrança</p>
            </div>
            <Switch
              checked={form.include_delivery_report}
              onCheckedChange={(checked) => setForm({ ...form, include_delivery_report: checked })}
            />
          </div>

          <Tabs defaultValue="due" onValueChange={v => setPreviewTab(v as 'due' | 'overdue')}>
            <TabsList className="w-full">
              <TabsTrigger value="due" className="flex-1 gap-1.5"><Pencil size={12} /> Vencimento</TabsTrigger>
              <TabsTrigger value="overdue" className="flex-1 gap-1.5"><Pencil size={12} /> Em Atraso</TabsTrigger>
            </TabsList>

            <TabsContent value="due" className="space-y-3 mt-3">
              <Label>Mensagem de Cobrança (Vencimento)</Label>
              <Textarea
                value={form.msg_billing_due}
                onChange={e => setForm({ ...form, msg_billing_due: e.target.value })}
                rows={8}
                className="font-mono text-xs"
                placeholder="Mensagem enviada no dia do vencimento..."
              />
            </TabsContent>

            <TabsContent value="overdue" className="space-y-3 mt-3">
              <Label>Mensagem de Lembrete (Em Atraso)</Label>
              <Textarea
                value={form.msg_billing_overdue}
                onChange={e => setForm({ ...form, msg_billing_overdue: e.target.value })}
                rows={8}
                className="font-mono text-xs"
                placeholder="Mensagem enviada para receitas em atraso..."
              />
            </TabsContent>
          </Tabs>

          <Button variant="outline" size="sm" onClick={handleSave} className="w-full"><Save size={14} className="mr-1" /> Salvar Templates</Button>

          {/* Live Preview */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-muted-foreground" />
                <Label className="text-sm font-medium">Preview da Mensagem</Label>
              </div>
              {clientsWithContract.length > 0 && (
                <Select value={previewClientId} onValueChange={setPreviewClientId}>
                  <SelectTrigger className="w-[220px] h-8 text-xs">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientsWithContract.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {previewMessage ? (
              <div className="relative mx-auto max-w-sm">
                {/* Phone frame */}
                <div className="rounded-[2rem] border-[3px] border-foreground/20 bg-background shadow-lg overflow-hidden">
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-5 py-1.5 bg-muted/50">
                    <span className="text-[10px] text-muted-foreground font-medium">WhatsApp</span>
                    <Smartphone size={10} className="text-muted-foreground" />
                  </div>
                  {/* Chat header */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-primary">P</span>
                    </div>
                    <span className="text-xs font-semibold">Pulse Growth Marketing</span>
                  </div>
                  {/* Chat body */}
                  <div className="p-3 min-h-[280px] max-h-[400px] overflow-y-auto bg-[hsl(var(--muted)/0.15)]">
                    <div className="bg-background rounded-lg rounded-tl-none px-3 py-2 shadow-sm border text-xs leading-relaxed">
                      {loadingReport ? (
                        <span className="text-muted-foreground italic">Carregando dados...</span>
                      ) : (
                        formatPreview(previewMessage)
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1 text-right">
                      {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                {clientsWithContract.length === 0
                  ? 'Nenhum cliente com contrato ativo para preview'
                  : 'Selecione um cliente para ver o preview'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Categorias de Despesas</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map(c => (
              <span key={c.id} className="px-3 py-1 rounded-full bg-secondary text-sm">{c.name}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nova categoria" className="max-w-xs" />
            <Button variant="outline" onClick={handleAddCat}>Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full"><Save size={14} className="mr-1" /> Salvar Configurações</Button>
    </div>
  );
}
