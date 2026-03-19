import { useEffect, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, FileText, Palette, Camera, User } from 'lucide-react';
import type { Client } from '@/types';

interface OnboardingTask {
  id: string;
  stage: string;
  status: string;
  title: string;
  briefing_completed: boolean | null;
  contract_signed: boolean | null;
  wants_new_identity: boolean | null;
  use_real_photos: boolean | null;
}

interface OnboardingTrackerProps {
  client: Client;
}

const STAGES = [
  { key: 'contrato', label: 'Contrato', icon: FileText, color: 'text-blue-600' },
  { key: 'identidade_visual', label: 'Identidade Visual', icon: Palette, color: 'text-purple-600' },
  { key: 'fotografia', label: 'Fotografia', icon: Camera, color: 'text-pink-600' },
  { key: 'reformulacao_perfil', label: 'Reformulação de Perfil', icon: User, color: 'text-green-600' },
];

export default function OnboardingTracker({ client }: OnboardingTrackerProps) {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('onboarding_tasks')
      .select('id, stage, status, title, briefing_completed, contract_signed, wants_new_identity, use_real_photos')
      .eq('client_id', client.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setTasks(data as OnboardingTask[]);
        setLoading(false);
      });
  }, [client.id]);

  if (loading) return null;
  if (tasks.length === 0) return null;

  const completedCount = tasks.filter(t => t.status === 'concluido').length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Card className="border-border border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-900/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500 text-white border-0 text-[10px] font-bold px-2 py-0.5">
              🚀 ONBOARDING
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {completedCount}/{totalCount} etapas concluídas
            </span>
          </div>
          <span className="text-xs font-semibold text-amber-600">{progress}%</span>
        </div>

        <Progress value={progress} className="h-2" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STAGES.map(stage => {
            const task = tasks.find(t => t.stage === stage.key);
            if (!task) return null;
            const done = task.status === 'concluido';
            const inProgress = task.status === 'em_andamento';
            const StageIcon = stage.icon;

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                  done
                    ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800'
                    : inProgress
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800'
                    : 'bg-muted/30 border-border'
                }`}
              >
                {done ? (
                  <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                ) : (
                  <Circle size={14} className={`shrink-0 ${inProgress ? 'text-blue-600' : 'text-muted-foreground'}`} />
                )}
                <div className="min-w-0">
                  <p className={`text-[11px] font-medium truncate ${done ? 'text-green-700 dark:text-green-400' : inProgress ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground'}`}>
                    {stage.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
