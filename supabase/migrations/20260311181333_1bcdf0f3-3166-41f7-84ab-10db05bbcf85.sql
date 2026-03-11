
-- Add designer role RLS policy for design_tasks
CREATE POLICY "Designer role manage design tasks"
ON public.design_tasks
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'designer'::app_role))
WITH CHECK (has_role(auth.uid(), 'designer'::app_role));

-- Add designer role RLS policy for design_task_history
CREATE POLICY "Designer view design history"
ON public.design_task_history
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'designer'::app_role));

CREATE POLICY "Designer insert design history"
ON public.design_task_history
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'designer'::app_role));
