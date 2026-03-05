import { useState, useEffect } from 'react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function FinancialSettings() {
  const navigate = useNavigate();
  const { paymentConfig, updatePaymentConfig, categories, addCategory } = useFinancialData();
  const [form, setForm] = useState({ pix_key: '', receiver_name: '', bank: '', document: '' });
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    if (paymentConfig) {
      setForm({
        pix_key: paymentConfig.pix_key,
        receiver_name: paymentConfig.receiver_name,
        bank: paymentConfig.bank,
        document: paymentConfig.document,
      });
    }
  }, [paymentConfig]);

  const handleSave = async () => {
    await updatePaymentConfig(form);
    toast.success('Dados de pagamento atualizados');
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
        <h1 className="text-xl font-bold">Configuração de Pagamentos</h1>
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
          <Button onClick={handleSave}><Save size={14} className="mr-1" /> Salvar</Button>
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
    </div>
  );
}
