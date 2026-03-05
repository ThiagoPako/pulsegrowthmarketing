import { useState, useEffect } from 'react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const TEMPLATE_VARS = [
  { var: '{nome_cliente}', desc: 'Nome da empresa' },
  { var: '{valor}', desc: 'Valor da mensalidade' },
  { var: '{dia_vencimento}', desc: 'Dia do vencimento' },
  { var: '{dados_pagamento}', desc: 'Dados PIX configurados' },
  { var: '{relatorio_entregas}', desc: 'Relatório personalizado baseado no plano do cliente (horas, vídeos, reels, stories, artes)' },
];

export default function FinancialSettings() {
  const navigate = useNavigate();
  const { paymentConfig, updatePaymentConfig, categories, addCategory } = useFinancialData();
  const [form, setForm] = useState({
    pix_key: '', receiver_name: '', bank: '', document: '',
    msg_billing_due: '', msg_billing_overdue: '', include_delivery_report: true,
  });
  const [newCat, setNewCat] = useState('');

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
      });
    }
  }, [paymentConfig]);

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

          <div>
            <Label>Mensagem de Cobrança (Vencimento)</Label>
            <Textarea
              value={form.msg_billing_due}
              onChange={e => setForm({ ...form, msg_billing_due: e.target.value })}
              rows={8}
              className="mt-1 font-mono text-xs"
              placeholder="Mensagem enviada no dia do vencimento..."
            />
          </div>

          <div>
            <Label>Mensagem de Lembrete (Em Atraso)</Label>
            <Textarea
              value={form.msg_billing_overdue}
              onChange={e => setForm({ ...form, msg_billing_overdue: e.target.value })}
              rows={8}
              className="mt-1 font-mono text-xs"
              placeholder="Mensagem enviada para receitas em atraso..."
            />
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
