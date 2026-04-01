import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface PiggyBankWidgetProps {
  balance: number;
  onAddReserve: (amount: number, description: string, date: string) => Promise<boolean>;
}

export default function PiggyBankWidget({ balance, onAddReserve }: PiggyBankWidgetProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Piggy levels based on balance
  const level = useMemo(() => {
    if (balance >= 50000) return 5; // fire eyes
    if (balance >= 30000) return 4; // dollar eyes glowing
    if (balance >= 15000) return 3; // big & happy
    if (balance >= 5000) return 2;  // medium
    if (balance > 0) return 1;      // small
    return 0;                        // empty/sad
  }, [balance]);

  const piggyScale = 0.7 + level * 0.12;
  const piggyWidth = 80 + level * 20;

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error('Informe um valor válido'); return; }
    setSaving(true);
    const ok = await onAddReserve(val, description || 'Reserva de emergência', date);
    setSaving(false);
    if (ok) {
      toast.success(`${fmt(val)} adicionado à reserva! 🐷`);
      setAmount('');
      setDescription('');
      setOpen(false);
    }
  };

  return (
    <>
      <motion.div
        className="relative cursor-pointer group"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        title="Reserva de Emergência"
      >
        <div className="flex flex-col items-center gap-1">
          {/* Piggy body */}
          <motion.div
            className="relative"
            animate={{ scale: piggyScale }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            style={{ width: piggyWidth, height: piggyWidth }}
          >
            {/* Glow effect for high balance */}
            {level >= 4 && (
              <motion.div
                className="absolute inset-0 rounded-full blur-xl"
                style={{ background: level >= 5 ? 'radial-gradient(circle, rgba(255,165,0,0.4), rgba(255,69,0,0.2), transparent)' : 'radial-gradient(circle, rgba(255,215,0,0.3), transparent)' }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}

            <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-lg">
              {/* Body */}
              <ellipse cx="60" cy="65" rx={32 + level * 3} ry={28 + level * 3} fill="hsl(340, 82%, 76%)" stroke="hsl(340, 60%, 55%)" strokeWidth="2" />
              
              {/* Belly highlight */}
              <ellipse cx="55" cy="70" rx={18 + level * 2} ry={15 + level * 2} fill="hsl(340, 90%, 85%)" opacity="0.5" />

              {/* Head */}
              <circle cx="90" cy="48" r={18 + level} fill="hsl(340, 82%, 76%)" stroke="hsl(340, 60%, 55%)" strokeWidth="2" />
              
              {/* Snout */}
              <ellipse cx="105" cy="52" rx="10" ry="8" fill="hsl(340, 70%, 70%)" stroke="hsl(340, 60%, 55%)" strokeWidth="1.5" />
              <circle cx="102" cy="50" r="2" fill="hsl(340, 50%, 45%)" />
              <circle cx="108" cy="50" r="2" fill="hsl(340, 50%, 45%)" />

              {/* Ears */}
              <ellipse cx="80" cy="33" rx="7" ry="10" fill="hsl(340, 82%, 76%)" stroke="hsl(340, 60%, 55%)" strokeWidth="1.5" transform="rotate(-15, 80, 33)" />
              <ellipse cx="96" cy="30" rx="7" ry="10" fill="hsl(340, 82%, 76%)" stroke="hsl(340, 60%, 55%)" strokeWidth="1.5" transform="rotate(15, 96, 30)" />
              <ellipse cx="80" cy="34" rx="4" ry="6" fill="hsl(340, 70%, 68%)" transform="rotate(-15, 80, 34)" />
              <ellipse cx="96" cy="31" rx="4" ry="6" fill="hsl(340, 70%, 68%)" transform="rotate(15, 96, 31)" />

              {/* Eyes */}
              {level >= 5 ? (
                <>
                  {/* Fire eyes */}
                  <g>
                    <motion.text
                      x="84" y="48" fontSize="12" textAnchor="middle" fontWeight="bold"
                      fill="hsl(25, 95%, 53%)"
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }}
                      transition={{ repeat: Infinity, duration: 0.5 }}
                    >🔥</motion.text>
                    <motion.text
                      x="96" y="48" fontSize="12" textAnchor="middle" fontWeight="bold"
                      fill="hsl(25, 95%, 53%)"
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }}
                      transition={{ repeat: Infinity, duration: 0.5, delay: 0.15 }}
                    >🔥</motion.text>
                  </g>
                </>
              ) : level >= 4 ? (
                <>
                  {/* Dollar sign eyes */}
                  <motion.text
                    x="84" y="50" fontSize="11" textAnchor="middle" fontWeight="900"
                    fill="hsl(142, 71%, 35%)"
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >$</motion.text>
                  <motion.text
                    x="96" y="50" fontSize="11" textAnchor="middle" fontWeight="900"
                    fill="hsl(142, 71%, 35%)"
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                  >$</motion.text>
                </>
              ) : (
                <>
                  {/* Normal eyes */}
                  <circle cx="84" cy="45" r="3" fill="hsl(340, 30%, 20%)" />
                  <circle cx="96" cy="45" r="3" fill="hsl(340, 30%, 20%)" />
                  <circle cx="85" cy="44" r="1" fill="white" />
                  <circle cx="97" cy="44" r="1" fill="white" />
                </>
              )}

              {/* Smile — bigger with more money */}
              {level >= 3 ? (
                <path d={`M 84 56 Q 90 ${62 + level} 96 56`} fill="none" stroke="hsl(340, 50%, 40%)" strokeWidth="1.5" strokeLinecap="round" />
              ) : level > 0 ? (
                <path d="M 86 55 Q 90 59 94 55" fill="none" stroke="hsl(340, 50%, 40%)" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M 86 58 Q 90 55 94 58" fill="none" stroke="hsl(340, 50%, 40%)" strokeWidth="1.5" strokeLinecap="round" />
              )}

              {/* Legs */}
              <rect x="38" y="88" width="10" height="14" rx="4" fill="hsl(340, 82%, 76%)" stroke="hsl(340, 60%, 55%)" strokeWidth="1.5" />
              <rect x="72" y="88" width="10" height="14" rx="4" fill="hsl(340, 82%, 76%)" stroke="hsl(340, 60%, 55%)" strokeWidth="1.5" />
              
              {/* Coin slot */}
              <rect x="52" y="38" width="16" height="3" rx="1.5" fill="hsl(340, 50%, 45%)" />

              {/* Tail */}
              <path d="M 28 58 Q 18 50 22 42 Q 26 36 20 32" fill="none" stroke="hsl(340, 60%, 55%)" strokeWidth="2" strokeLinecap="round" />
            </svg>

            {/* Sparkles for high level */}
            {level >= 3 && (
              <>
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="absolute text-yellow-400 pointer-events-none"
                    style={{ top: `${10 + i * 20}%`, left: `${15 + i * 25}%` }}
                    animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5], y: [0, -8, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.4 }}
                  >
                    ✨
                  </motion.div>
                ))}
              </>
            )}

            {/* Floating coins for level >= 2 */}
            {level >= 2 && (
              <motion.div
                className="absolute -top-2 right-1 text-lg pointer-events-none"
                animate={{ y: [0, -6, 0], opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                🪙
              </motion.div>
            )}
          </motion.div>

          {/* Balance label */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reserva</p>
            <p className={`text-sm font-bold ${balance > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              {fmt(balance)}
            </p>
          </motion.div>
        </div>

        {/* Hover tooltip */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Clique para adicionar reserva 🐷
        </div>
      </motion.div>

      {/* Dialog to add reserve */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              🐷 Reserva de Emergência
            </DialogTitle>
          </DialogHeader>
          
          <div className="text-center py-3">
            <p className="text-2xl font-bold text-emerald-600">{fmt(balance)}</p>
            <p className="text-xs text-muted-foreground">Saldo atual da reserva</p>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                placeholder="Reserva de emergência"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? 'Salvando...' : '💰 Adicionar Reserva'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
