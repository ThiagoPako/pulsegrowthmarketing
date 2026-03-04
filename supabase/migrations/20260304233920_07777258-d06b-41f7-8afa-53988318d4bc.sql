ALTER TABLE public.company_settings
  RENAME COLUMN start_time TO shift_a_start;

ALTER TABLE public.company_settings
  RENAME COLUMN end_time TO shift_a_end;

ALTER TABLE public.company_settings
  ADD COLUMN shift_b_start text NOT NULL DEFAULT '13:00',
  ADD COLUMN shift_b_end text NOT NULL DEFAULT '18:00';

UPDATE public.company_settings
  SET shift_a_end = '12:00',
      shift_b_start = '13:00',
      shift_b_end = '18:00';