import { useEffect, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ListChecks } from 'lucide-react';

interface ChecklistItem {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
}

interface ProposalChecklistProps {
  clientId: string;
  editable?: boolean;
  compact?: boolean;
}

export default function ProposalChecklist({ clientId, editable = true, compact = false }: ProposalChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('proposal_checklist_items')
      .select('*')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setItems(data as ChecklistItem[]);
        setLoading(false);
      });
  }, [clientId]);

  const toggleItem = async (item: ChecklistItem) => {
    if (!editable) return;
    const newCompleted = !item.is_completed;
    const updatedItems = items.map(i =>
      i.id === item.id
        ? { ...i, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
        : i
    );
    setItems(updatedItems);

    await supabase
      .from('proposal_checklist_items')
      .update({
        is_completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);
  };

  if (loading || items.length === 0) return null;

  const completed = items.filter(i => i.is_completed).length;
  const total = items.length;
  const progress = Math.round((completed / total) * 100);
  const allDone = completed === total;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ListChecks size={14} className="text-primary" />
            <span className="text-xs font-medium text-foreground">{completed}/{total}</span>
          </div>
          <span className="text-[10px] font-semibold text-primary">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>
    );
  }

  return (
    <Card className={`border-border border-l-4 ${allDone ? 'border-l-green-500 bg-green-50/30 dark:bg-green-900/5' : 'border-l-primary bg-primary/5'}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={`border-0 text-[10px] font-bold px-2 py-0.5 ${allDone ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground'}`}>
              {allDone ? '✅ CONCLUÍDO' : '📋 ENTREGAS'}
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {completed}/{total} itens concluídos
            </span>
          </div>
          <span className={`text-xs font-semibold ${allDone ? 'text-green-600' : 'text-primary'}`}>{progress}%</span>
        </div>

        <Progress value={progress} className="h-2" />

        <div className="space-y-1.5">
          {items.map(item => (
            <div
              key={item.id}
              className={`flex items-start gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer ${
                item.is_completed
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800'
                  : 'bg-card border-border hover:border-primary/40'
              }`}
              onClick={() => toggleItem(item)}
            >
              <Checkbox
                checked={item.is_completed}
                onCheckedChange={() => toggleItem(item)}
                disabled={!editable}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${item.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
              {item.is_completed && <CheckCircle2 size={14} className="text-green-600 shrink-0 mt-0.5" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
