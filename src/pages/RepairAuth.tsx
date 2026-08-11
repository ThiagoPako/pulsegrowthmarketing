import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, AlertCircle, RefreshCw, Terminal, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RepairAuth() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

  const runRepair = async () => {
    setStatus('running');
    setLogs([]);
    addLog("Iniciando reparo de autenticação na VPS...");
    
    try {
      addLog("Testando conexão com a API da VPS...");
      const health = await fetch('https://agenciapulse.tech/api/health').catch(() => ({ ok: false }));
      
      if (!health.ok) {
        addLog("ERRO: API da VPS não respondeu (502 Bad Gateway?).");
        addLog("Tente reiniciar o serviço na VPS via SSH antes de prosseguir.");
        setStatus('error');
        return;
      }
      
      addLog("API está online. Solicitando reparo atômico de permissões...");
      // Nota: Este endpoint precisa existir na VPS
      const repair = await fetch('https://agenciapulse.tech/api/admin/repair-atomic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => ({ ok: false, json: () => Promise.resolve({ error: 'Falha na rede' }) }));

      if (!repair.ok) {
         const errorData = await repair.json().catch(() => ({ error: 'Erro desconhecido' }));
         addLog(`Reparo atômico falhou: ${errorData.error || 'Erro no servidor'}`);
      } else {
         addLog("Permissões de banco sincronizadas com sucesso.");
      }

      addLog("Limpando cache de autenticação local...");
      localStorage.removeItem('pulse_jwt');
      
      addLog("Processo concluído. Recarregando aplicação em 3 segundos...");
      setStatus('success');
      setTimeout(() => window.location.href = '/', 3000);
      
    } catch (err: any) {
      addLog(`ERRO CRÍTICO: ${err.message}`);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 flex items-center justify-center font-mono">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tighter flex items-center justify-center gap-2">
            <ShieldCheck className="text-primary w-6 h-6" />
            AUTH RECOVERY TOOL v1.1
          </h1>

          <p className="text-slate-400 text-sm">Ferramenta de emergência para reparo de autenticação VPS</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-6 space-y-4">
            {status === 'idle' && (
              <div className="space-y-4 text-center py-8">
                <AlertCircle className="w-12 h-12 text-orange-500 mx-auto animate-pulse" />
                <div className="space-y-2">
                  <h2 className="font-bold">Problemas de Login detectados?</h2>
                  <p className="text-sm text-slate-400">Esta ferramenta irá sincronizar as tabelas de autenticação na VPS e limpar sessões corrompidas no navegador.</p>
                </div>
                <Button onClick={runRepair} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                  INICIAR REPARO AGORA
                </Button>
              </div>
            )}

            {status === 'running' && (
              <div className="space-y-4 py-8 text-center">
                <RefreshCw className="w-12 h-12 text-primary mx-auto animate-spin" />
                <p className="font-bold animate-pulse">EXECUTANDO ROTINAS DE REPARO...</p>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4 py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                <h2 className="font-bold text-green-500">REPARO CONCLUÍDO!</h2>
                <p className="text-sm text-slate-400">Redirecionando para a página de login...</p>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4 py-4">
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Falha no Reparo</AlertTitle>
                  <AlertDescription>
                    Não foi possível completar a operação automaticamente. Verifique o console da VPS.
                  </AlertDescription>
                </Alert>
                <Button onClick={() => setStatus('idle')} variant="outline" className="w-full border-slate-700 hover:bg-slate-800">
                  TENTAR NOVAMENTE
                </Button>
              </div>
            )}
          </div>

          <div className="bg-black/50 border-t border-slate-800 p-4 min-h-[200px] max-h-[300px] overflow-y-auto">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2">
              <Terminal className="w-3 h-3" />
              TERMINAL OUTPUT
            </div>
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="text-[10px] leading-tight flex gap-2">
                  <span className="text-slate-600 shrink-0">[{i+1}]</span>
                  <span className={log.includes('ERRO') ? 'text-red-400' : 'text-slate-300'}>{log}</span>
                </div>
              ))}
              {logs.length === 0 && <div className="text-[10px] text-slate-700 italic">Aguardando comando...</div>}
            </div>
          </div>
        </div>

        <div className="text-[10px] text-center text-slate-600 uppercase tracking-widest">
          Agência Pulse Growth Marketing • Cloud Infrastructure
        </div>
      </div>
    </div>
  );
}
