-- Índices de performance para o painel/kanban da designer.
-- Seguros para rodar múltiplas vezes (IF NOT EXISTS).

-- Filtro principal do endpoint /api/design-tasks/fast:
--   (kanban_column <> 'postado' OR updated_at >= X) + ORDER BY position, created_at
CREATE INDEX IF NOT EXISTS idx_design_tasks_column_updated
  ON design_tasks (kanban_column, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_design_tasks_position_created
  ON design_tasks (position ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_design_tasks_created_at
  ON design_tasks (created_at DESC);

-- Escopo multi-cidade
CREATE INDEX IF NOT EXISTS idx_design_tasks_city
  ON design_tasks (city);

-- Joins do endpoint rápido
CREATE INDEX IF NOT EXISTS idx_design_tasks_client_id
  ON design_tasks (client_id);

CREATE INDEX IF NOT EXISTS idx_design_tasks_assigned_to
  ON design_tasks (assigned_to);

-- Histórico carregado no detalhe da tarefa
CREATE INDEX IF NOT EXISTS idx_design_task_history_task
  ON design_task_history (task_id, created_at DESC);

ANALYZE design_tasks;
