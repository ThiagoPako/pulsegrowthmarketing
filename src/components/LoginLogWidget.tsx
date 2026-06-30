import { useEffect, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LogIn } from 'lucide-react';

interface LoginLog {
  id: string;
  user_name: string;
  user_role: string;
  logged_in_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  social_media: 'Social Media',
  editor: 'Editor',
  videomaker: 'Videomaker',
  designer: 'Designer',
  fotografo: 'Fotógrafo',
  endomarketing: 'Endomarketing',
  parceiro: 'Parceiro',
};

export default function LoginLogWidget() {
  const [logs, setLogs] = useState<LoginLog[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('login_logs')
        .select('id, user_name, user_role, logged_in_at')
        .order('logged_in_at', { ascending: false })
        .limit(20) as any;
      if (data) setLogs(data);
    };
    fetch();
    const iv = setInterval(fetch, 30_000);
    return () => clearInterval(iv);
  }, []);

  if (logs.length === 0) return null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <LogIn size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">Log de Acessos</h3>
      </div>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {logs.map(log => (
          <div key={log.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{log.user_name || 'Usuário'}</span>
              <span className="text-muted-foreground text-[10px] shrink-0">
                {ROLE_LABELS[log.user_role] || log.user_role}
              </span>
            </div>
            <span className="text-muted-foreground text-[10px] shrink-0 ml-2">
              {formatDistanceToNow(new Date(log.logged_in_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
