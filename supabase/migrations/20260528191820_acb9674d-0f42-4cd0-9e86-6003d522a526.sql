ALTER TABLE public.design_tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.design_tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Update existing records to have a sequential position based on created_at
WITH ordered_tasks AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY kanban_column ORDER BY created_at ASC) as row_num
  FROM public.design_tasks
)
UPDATE public.design_tasks dt
SET position = ot.row_num
FROM ordered_tasks ot
WHERE dt.id = ot.id;