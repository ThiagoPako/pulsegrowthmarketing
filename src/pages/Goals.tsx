import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Progress } from '@/components/ui/progress';
import { startOfWeek, format, parseISO, isWithinInterval, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Goals() {
  const { clients, tasks, recordings } = useApp();
  const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStr = format(currentWeek, 'yyyy-MM-dd');

  const clientGoals = useMemo(() => {
    return clients.map(client => {
      const weekTasks = tasks.filter(t => t.clientId === client.id && t.weekStart === weekStr);
      const done = weekTasks.filter(t => t.column === 'finalizado').length;
      const total = client.weeklyGoal || 10;
      const weekRecs = recordings.filter(r =>
        r.clientId === client.id && r.status === 'concluida' &&
        isWithinInterval(parseISO(r.date), { start: currentWeek, end: weekEnd })
      );
      return { client, total, done, tasksCount: weekTasks.length, recordings: weekRecs.length, progress: Math.min(100, Math.round((done / total) * 100)) };
    });
  }, [clients, tasks, recordings, weekStr, currentWeek, weekEnd]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Metas Semanais</h1>
        <p className="text-sm text-muted-foreground">Semana de {format(currentWeek, "d 'de' MMMM", { locale: ptBR })}</p>
      </div>

      {clientGoals.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">Nenhum cliente cadastrado</div>
      ) : (
        <div className="grid gap-3">
          {clientGoals.map(({ client, total, done, tasksCount, recordings, progress }) => (
            <div key={client.id} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold">{client.companyName}</p>
                  <p className="text-xs text-muted-foreground">Meta: {total} conteúdos/semana</p>
                </div>
                <span className={`text-2xl font-display font-bold ${progress >= 100 ? 'text-success' : progress >= 50 ? 'text-warning' : 'text-destructive'}`}>
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="h-2 mb-3" />
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Tarefas: {tasksCount}</span>
                <span>Finalizadas: {done}</span>
                <span>Gravações: {recordings}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
