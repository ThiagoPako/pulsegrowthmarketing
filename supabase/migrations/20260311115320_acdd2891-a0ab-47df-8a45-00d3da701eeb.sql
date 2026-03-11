
ALTER TABLE public.design_tasks 
  ADD CONSTRAINT design_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  ADD CONSTRAINT design_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);

ALTER TABLE public.design_task_history
  ADD CONSTRAINT design_task_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
