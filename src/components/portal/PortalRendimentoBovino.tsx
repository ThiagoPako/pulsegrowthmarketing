import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface CutRow {
  id: string;
  nome: string;
  peso: number;
  precoVendaKg: number;
}

const DEFAULT_CUTS: CutRow[] = [
  { id: '1', nome: 'ACEM', peso: 793.4, precoVendaKg: 31 },
  { id: '2', nome: 'ALCATRA', peso: 390.6, precoVendaKg: 39.98 },
  { id: '3', nome: 'ACEM TEMPERADO', peso: 60.2, precoVendaKg: 33.98 },
  { id: '4', nome: 'CAPA DE FILÉ', peso: 139.6, precoVendaKg: 29.89 },
  { id: '5', nome: 'CARNE MOÍDA 1ª', peso: 22.4, precoVendaKg: 36.98 },
  { id: '6', nome: 'CARNE MOÍDA 2ª', peso: 89, precoVendaKg: 29.89 },
  { id: '7', nome: 'CHÃ DE DENTRO', peso: 29.8, precoVendaKg: 38 },
  { id: '8', nome: 'CHÃ DE FORA', peso: 301.6, precoVendaKg: 34 },
  { id: '9', nome: 'CONTRA FILÉ', peso: 94.6, precoVendaKg: 45 },
  { id: '10', nome: 'COSTELA BOVINA C/OSSO', peso: 431, precoVendaKg: 24.9 },
  { id: '11', nome: 'COSTELA BOVINA S/OSSO', peso: 624.6, precoVendaKg: 29.89 },
  { id: '12', nome: 'FILÉ MIGNON', peso: 152.5, precoVendaKg: 58 },
  { id: '13', nome: 'LAGARTO', peso: 137.4, precoVendaKg: 34 },
  { id: '14', nome: 'LINGUIÇA MISTA CASA', peso: 178, precoVendaKg: 26 },
  { id: '15', nome: 'MAÇÃ DE PEITO', peso: 445.2, precoVendaKg: 32 },
  { id: '16', nome: 'MÚSCULO', peso: 254.8, precoVendaKg: 32 },
  { id: '17', nome: 'PATINHO', peso: 243.4, precoVendaKg: 36 },
  { id: '18', nome: 'PALETA', peso: 310.4, precoVendaKg: 38 },
  { id: '19', nome: 'PICANHA', peso: 161.2, precoVendaKg: 62 },
  { id: '20', nome: 'OSSO / PELANCA', peso: 1570.3, precoVendaKg: 0 },
];

interface Props {
  clientColor: string;
}

export default function PortalRendimentoBovino({ clientColor }: Props) {
  const [precoKgCarcaca, setPrecoKgCarcaca] = useState(18.9);
  const [pesoTotalCarcaca, setPesoTotalCarcaca] = useState(6500);
  const [cuts, setCuts] = useState<CutRow[]>(DEFAULT_CUTS);

  const valorCarcaca = precoKgCarcaca * pesoTotalCarcaca;
  const pesoTotal = useMemo(() => cuts.reduce((s, c) => s + c.peso, 0), [cuts]);

  const computed = useMemo(() => {
    return cuts.map(c => {
      const pct = pesoTotal > 0 ? c.peso / pesoTotal : 0;
      const precoCusto = pct * valorCarcaca;
      const valorVenda = c.precoVendaKg * c.peso;
      const margem = valorVenda !== 0 ? (valorVenda - precoCusto) / valorVenda : 0;
      return { ...c, pct, precoCusto, valorVenda, margem };
    });
  }, [cuts, pesoTotal, valorCarcaca]);

  const totalCusto = useMemo(() => computed.reduce((s, c) => s + c.precoCusto, 0), [computed]);
  const totalVenda = useMemo(() => computed.reduce((s, c) => s + c.valorVenda, 0), [computed]);
  const margemGeral = totalVenda !== 0 ? (totalVenda - totalCusto) / totalVenda : 0;
  const margemSobreCusto = totalCusto !== 0 ? (totalVenda - totalCusto) / totalCusto : 0;

  const updateCut = useCallback((id: string, field: keyof CutRow, value: string | number) => {
    setCuts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }, []);

  const addCut = useCallback(() => {
    setCuts(prev => [...prev, { id: Date.now().toString(), nome: '', peso: 0, precoVendaKg: 0 }]);
  }, []);

  const removeCut = useCallback((id: string) => {
    setCuts(prev => prev.filter(c => c.id !== id));
  }, []);

  const reset = useCallback(() => {
    setCuts(DEFAULT_CUTS);
    setPrecoKgCarcaca(18.9);
    setPesoTotalCarcaca(6500);
    toast.success('Valores resetados');
  }, []);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtPct = (v: number) => (v * 100).toFixed(2) + '%';

  const margemColor = (m: number) => {
    if (m >= 0.5) return 'text-emerald-400';
    if (m >= 0.3) return 'text-yellow-400';
    if (m >= 0) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">🥩 Rendimento Bovino</h2>
          <p className="text-xs text-white/50 mt-1">Calculadora de rendimento e precificação de carcaça</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset} className="border-white/20 text-white/70 hover:text-white">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Resetar
        </Button>
      </div>

      {/* Inputs da carcaça */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white/5 rounded-xl p-4 border border-white/10">
        <div>
          <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">Preço KG Carcaça (R$)</label>
          <Input
            type="number"
            step="0.01"
            value={precoKgCarcaca}
            onChange={e => setPrecoKgCarcaca(parseFloat(e.target.value) || 0)}
            className="bg-white/10 border-white/20 text-white text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">Peso Total Carcaça (KG)</label>
          <Input
            type="number"
            step="0.1"
            value={pesoTotalCarcaca}
            onChange={e => setPesoTotalCarcaca(parseFloat(e.target.value) || 0)}
            className="bg-white/10 border-white/20 text-white text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">Valor da Carcaça</label>
          <div className="h-9 flex items-center px-3 rounded-md bg-white/5 border border-white/10 text-white font-semibold text-sm">
            {fmt(valorCarcaca)}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-white/60 text-[11px] uppercase tracking-wider">
              <th className="text-left px-3 py-2.5">Produto</th>
              <th className="text-right px-3 py-2.5 w-24">Peso (KG)</th>
              <th className="text-right px-3 py-2.5 w-20">%</th>
              <th className="text-right px-3 py-2.5 w-28">Preço Custo</th>
              <th className="text-right px-3 py-2.5 w-28">$ Venda KG</th>
              <th className="text-right px-3 py-2.5 w-28">Valor Venda</th>
              <th className="text-right px-3 py-2.5 w-20">Margem</th>
              <th className="w-10 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {computed.map((row, i) => (
              <tr key={row.id} className={`border-t border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.06] transition-colors`}>
                <td className="px-3 py-2">
                  <Input
                    value={row.nome}
                    onChange={e => updateCut(row.id, 'nome', e.target.value)}
                    className="bg-transparent border-0 text-white text-sm h-7 px-0 focus-visible:ring-0 w-full min-w-[140px]"
                    placeholder="Nome do corte"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={row.peso || ''}
                    onChange={e => updateCut(row.id, 'peso', parseFloat(e.target.value) || 0)}
                    className="bg-transparent border-0 text-amber-300 text-sm h-7 px-0 text-right focus-visible:ring-0 w-full"
                  />
                </td>
                <td className="text-right px-3 py-2 text-white/50 text-xs">{fmtPct(row.pct)}</td>
                <td className="text-right px-3 py-2 text-white/70 text-xs">{fmt(row.precoCusto)}</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={row.precoVendaKg || ''}
                    onChange={e => updateCut(row.id, 'precoVendaKg', parseFloat(e.target.value) || 0)}
                    className="bg-transparent border-0 text-amber-300 text-sm h-7 px-0 text-right focus-visible:ring-0 w-full"
                  />
                </td>
                <td className="text-right px-3 py-2 text-white/70 text-xs">{fmt(row.valorVenda)}</td>
                <td className={`text-right px-3 py-2 text-xs font-medium ${margemColor(row.margem)}`}>
                  {row.valorVenda === 0 ? '—' : fmtPct(row.margem)}
                </td>
                <td className="px-2 py-2">
                  <button onClick={() => removeCut(row.id)} className="text-white/20 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/20 bg-white/5 font-semibold text-white">
              <td className="px-3 py-3">TOTAL DO RENDIMENTO</td>
              <td className="text-right px-3 py-3">{pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="text-right px-3 py-3 text-white/50">100%</td>
              <td className="text-right px-3 py-3">{fmt(totalCusto)}</td>
              <td className="px-3 py-3"></td>
              <td className="text-right px-3 py-3">{fmt(totalVenda)}</td>
              <td className="px-3 py-3"></td>
              <td className="px-2 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add row */}
      <Button variant="outline" size="sm" onClick={addCut} className="border-white/20 text-white/70 hover:text-white w-full sm:w-auto">
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Corte
      </Button>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Margem Geral</p>
          <p className={`text-lg font-bold ${margemColor(margemGeral)}`}>{fmtPct(margemGeral)}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Margem s/ Custo</p>
          <p className={`text-lg font-bold ${margemColor(margemSobreCusto)}`}>{fmtPct(margemSobreCusto)}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Custo</p>
          <p className="text-lg font-bold text-white">{fmt(totalCusto)}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Venda</p>
          <p className="text-lg font-bold text-emerald-400">{fmt(totalVenda)}</p>
        </div>
      </div>

      <p className="text-[10px] text-white/30 text-center">⚠️ Preencha apenas os campos em <span className="text-amber-300">amarelo</span> (Produto, Peso e $ Venda KG). Os demais são calculados automaticamente.</p>
    </div>
  );
}
