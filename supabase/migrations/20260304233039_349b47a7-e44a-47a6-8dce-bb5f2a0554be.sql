CREATE POLICY "Admin/endo can delete endo schedules"
ON public.endomarketing_agendamentos
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'endomarketing'::app_role));