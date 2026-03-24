-- ============================================
-- Pulse Growth Marketing - Database Schema
-- Generated for VPS PostgreSQL Migration
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum
CREATE TYPE app_role AS ENUM ('admin','videomaker','social_media','editor','endomarketing','parceiro','fotografo','designer');

-- Table: active_recordings
CREATE TABLE IF NOT EXISTS active_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL,
  videomaker_id UUID NOT NULL,
  client_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  planned_script_ids TEXT[] NOT NULL DEFAULT '{}'::text[]
);

-- Table: api_integration_logs
CREATE TABLE IF NOT EXISTS api_integration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  integration_id UUID,
  action TEXT NOT NULL DEFAULT ''::text,
  status TEXT NOT NULL DEFAULT 'success'::text,
  details JSONB,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: api_integrations
CREATE TABLE IF NOT EXISTS api_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT ''::text,
  provider TEXT NOT NULL DEFAULT ''::text,
  api_type TEXT NOT NULL DEFAULT 'rest'::text,
  endpoint_url TEXT DEFAULT ''::text,
  status TEXT NOT NULL DEFAULT 'inativo'::text,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: automation_flows
CREATE TABLE IF NOT EXISTS automation_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT ''::text,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  trigger_type TEXT NOT NULL DEFAULT 'manual'::text,
  trigger_config JSONB DEFAULT '{}'::jsonb,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: automation_logs
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'::text,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  triggered_by UUID
);

-- Table: billing_messages
CREATE TABLE IF NOT EXISTS billing_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  revenue_id UUID,
  client_id UUID NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'cobranca'::text,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'enviada'::text
);

-- Table: cash_reserve_movements
CREATE TABLE IF NOT EXISTS cash_reserve_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'entrada'::text,
  description TEXT NOT NULL DEFAULT ''::text,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: client_endomarketing_contracts
CREATE TABLE IF NOT EXISTS client_endomarketing_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  package_id UUID NOT NULL,
  partner_id UUID,
  partner_cost NUMERIC NOT NULL DEFAULT 0,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'ativo'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: client_portal_comments
CREATE TABLE IF NOT EXISTS client_portal_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL,
  author_name TEXT NOT NULL DEFAULT ''::text,
  author_type TEXT NOT NULL DEFAULT 'client'::text,
  author_id UUID,
  message TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: client_portal_contents
CREATE TABLE IF NOT EXISTS client_portal_contents (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT ''::text,
  content_type TEXT NOT NULL DEFAULT 'reel'::text,
  season_month INTEGER NOT NULL,
  season_year INTEGER NOT NULL,
  file_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente'::text,
  uploaded_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: client_portal_notifications
CREATE TABLE IF NOT EXISTS client_portal_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT ''::text,
  message TEXT NOT NULL DEFAULT ''::text,
  type TEXT NOT NULL DEFAULT 'info'::text,
  link_content_id UUID,
  link_script_id UUID,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  responsible_person TEXT NOT NULL DEFAULT ''::text,
  phone TEXT NOT NULL DEFAULT ''::text,
  color TEXT NOT NULL DEFAULT '217 91% 60%'::text,
  fixed_day TEXT NOT NULL DEFAULT 'segunda'::text,
  fixed_time TEXT NOT NULL DEFAULT '09:00'::text,
  videomaker_id UUID,
  backup_time TEXT NOT NULL DEFAULT '14:00'::text,
  backup_day TEXT NOT NULL DEFAULT 'terca'::text,
  extra_day TEXT NOT NULL DEFAULT 'quarta'::text,
  extra_content_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  accepts_extra BOOLEAN NOT NULL DEFAULT false,
  extra_client_appears BOOLEAN NOT NULL DEFAULT false,
  weekly_reels INTEGER NOT NULL DEFAULT 0,
  weekly_creatives INTEGER NOT NULL DEFAULT 0,
  weekly_goal INTEGER NOT NULL DEFAULT 10,
  has_endomarketing BOOLEAN NOT NULL DEFAULT false,
  weekly_stories INTEGER NOT NULL DEFAULT 0,
  presence_days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logo_url TEXT,
  whatsapp TEXT NOT NULL DEFAULT ''::text,
  plan_id UUID,
  contract_start_date DATE,
  auto_renewal BOOLEAN NOT NULL DEFAULT false,
  monthly_recordings INTEGER NOT NULL DEFAULT 4,
  email TEXT NOT NULL DEFAULT ''::text,
  city TEXT NOT NULL DEFAULT ''::text,
  niche TEXT DEFAULT ''::text,
  client_login TEXT DEFAULT ''::text,
  drive_link TEXT DEFAULT ''::text,
  drive_fotos TEXT DEFAULT ''::text,
  drive_identidade_visual TEXT DEFAULT ''::text,
  onboarding_completed BOOLEAN DEFAULT false,
  selected_weeks INTEGER[] NOT NULL DEFAULT '{1,2,3,4}'::integer[],
  client_type TEXT NOT NULL DEFAULT 'novo'::text,
  editorial TEXT DEFAULT ''::text,
  photo_preference TEXT NOT NULL DEFAULT 'nao_precisa'::text,
  has_photo_shoot BOOLEAN NOT NULL DEFAULT false,
  accepts_photo_shoot_cost BOOLEAN NOT NULL DEFAULT false,
  briefing_data JSONB DEFAULT '{}'::jsonb,
  contract_duration_months INTEGER NOT NULL DEFAULT 12,
  whatsapp_group TEXT,
  show_metrics BOOLEAN NOT NULL DEFAULT true,
  client_password_hash TEXT,
  has_vehicle_flyer BOOLEAN NOT NULL DEFAULT false
);

-- Table: company_settings
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shift_a_start TEXT NOT NULL DEFAULT '08:00'::text,
  shift_a_end TEXT NOT NULL DEFAULT '18:00'::text,
  work_days TEXT[] NOT NULL DEFAULT '{segunda,terca,quarta,quinta,sexta}'::text[],
  recording_duration INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shift_b_start TEXT NOT NULL DEFAULT '13:00'::text,
  shift_b_end TEXT NOT NULL DEFAULT '18:00'::text,
  editing_deadline_hours INTEGER NOT NULL DEFAULT 48,
  review_deadline_hours INTEGER NOT NULL DEFAULT 24,
  alteration_deadline_hours INTEGER NOT NULL DEFAULT 24,
  approval_deadline_hours INTEGER NOT NULL DEFAULT 6
);

-- Table: content_tasks
CREATE TABLE IF NOT EXISTS content_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT ''::text,
  content_type TEXT NOT NULL DEFAULT 'reels'::text,
  kanban_column TEXT NOT NULL DEFAULT 'ideias'::text,
  description TEXT,
  recording_id UUID,
  script_id UUID,
  assigned_to UUID,
  created_by UUID,
  scheduled_recording_date DATE,
  scheduled_recording_time TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drive_link TEXT,
  editing_deadline TIMESTAMPTZ,
  editing_started_at TIMESTAMPTZ,
  edited_video_link TEXT,
  edited_video_type TEXT DEFAULT 'link'::text,
  approval_sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  adjustment_notes TEXT,
  script_alteration_type TEXT,
  script_alteration_notes TEXT,
  editing_priority BOOLEAN NOT NULL DEFAULT false,
  immediate_alteration BOOLEAN NOT NULL DEFAULT false,
  review_deadline TIMESTAMPTZ,
  alteration_deadline TIMESTAMPTZ,
  approval_deadline TIMESTAMPTZ,
  reviewing_by UUID,
  reviewing_by_name TEXT,
  reviewing_at TIMESTAMPTZ
);

-- Table: delivery_records
CREATE TABLE IF NOT EXISTS delivery_records (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  recording_id UUID,
  client_id UUID NOT NULL,
  videomaker_id UUID NOT NULL,
  date DATE NOT NULL,
  reels_produced INTEGER NOT NULL DEFAULT 0,
  creatives_produced INTEGER NOT NULL DEFAULT 0,
  stories_produced INTEGER NOT NULL DEFAULT 0,
  arts_produced INTEGER NOT NULL DEFAULT 0,
  extras_produced INTEGER NOT NULL DEFAULT 0,
  videos_recorded INTEGER NOT NULL DEFAULT 0,
  observations TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'realizada'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: design_task_history
CREATE TABLE IF NOT EXISTS design_task_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  action TEXT NOT NULL DEFAULT ''::text,
  details TEXT,
  attachment_url TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: design_tasks
CREATE TABLE IF NOT EXISTS design_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT ''::text,
  description TEXT,
  format_type TEXT NOT NULL DEFAULT 'feed'::text,
  kanban_column TEXT NOT NULL DEFAULT 'nova_tarefa'::text,
  priority TEXT NOT NULL DEFAULT 'media'::text,
  copy_text TEXT,
  references_links TEXT[],
  reference_images TEXT[],
  attachment_url TEXT,
  editable_file_url TEXT,
  observations TEXT,
  created_by UUID,
  assigned_to UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sent_to_client_at TIMESTAMPTZ,
  client_approved_at TIMESTAMPTZ,
  auto_approved BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  timer_running BOOLEAN NOT NULL DEFAULT false,
  timer_started_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checklist JSONB DEFAULT '[]'::jsonb,
  mockup_url TEXT
);

-- Table: endomarketing_agendamentos
CREATE TABLE IF NOT EXISTS endomarketing_agendamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL,
  profissional_id UUID NOT NULL,
  videomaker_id UUID,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'agendado'::text,
  cancellation_reason TEXT,
  checklist JSONB DEFAULT '{"reels": false, "stories": false, "estrategico": false, "institucional": false}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: endomarketing_clientes
CREATE TABLE IF NOT EXISTS endomarketing_clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id TEXT,
  company_name TEXT NOT NULL,
  responsible_person TEXT,
  phone TEXT,
  color TEXT DEFAULT '217 91% 60%'::text,
  active BOOLEAN NOT NULL DEFAULT true,
  stories_per_week INTEGER NOT NULL DEFAULT 5,
  presence_days_per_week INTEGER NOT NULL DEFAULT 3,
  selected_days TEXT[] NOT NULL DEFAULT '{segunda,terca,quarta,quinta,sexta}'::text[],
  session_duration INTEGER NOT NULL DEFAULT 60,
  execution_type TEXT NOT NULL DEFAULT 'sozinho'::text,
  plan_type TEXT NOT NULL DEFAULT 'presencial_recorrente'::text,
  total_contracted_hours NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  editorial TEXT DEFAULT ''::text
);

-- Table: endomarketing_logs
CREATE TABLE IF NOT EXISTS endomarketing_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  agendamento_id UUID,
  cliente_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: endomarketing_packages
CREATE TABLE IF NOT EXISTS endomarketing_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  package_name TEXT NOT NULL,
  description TEXT DEFAULT ''::text,
  partner_cost NUMERIC NOT NULL DEFAULT 0,
  sessions_per_week INTEGER NOT NULL DEFAULT 0,
  stories_per_day INTEGER NOT NULL DEFAULT 0,
  duration_hours NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: endomarketing_partner_tasks
CREATE TABLE IF NOT EXISTS endomarketing_partner_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL,
  client_id UUID NOT NULL,
  partner_id UUID,
  date DATE NOT NULL,
  start_time TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  task_type TEXT NOT NULL DEFAULT 'presenca'::text,
  status TEXT NOT NULL DEFAULT 'pendente'::text,
  notes TEXT,
  attachment_url TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: endomarketing_profissionais
CREATE TABLE IF NOT EXISTS endomarketing_profissionais (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  max_hours_per_day NUMERIC NOT NULL DEFAULT 6,
  available_days TEXT[] NOT NULL DEFAULT '{segunda,terca,quarta,quinta,sexta}'::text[],
  start_time TEXT NOT NULL DEFAULT '08:00'::text,
  end_time TEXT NOT NULL DEFAULT '18:00'::text,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: expense_categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  category_id UUID NOT NULL,
  expense_type TEXT NOT NULL DEFAULT 'fixa'::text,
  description TEXT NOT NULL DEFAULT ''::text,
  responsible TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: financial_activity_log
CREATE TABLE IF NOT EXISTS financial_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID,
  action_type TEXT NOT NULL DEFAULT ''::text,
  entity_type TEXT NOT NULL DEFAULT ''::text,
  entity_id UUID,
  description TEXT NOT NULL DEFAULT ''::text,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: financial_chat_messages
CREATE TABLE IF NOT EXISTS financial_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'::text,
  content TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: financial_contracts
CREATE TABLE IF NOT EXISTS financial_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  plan_id UUID,
  contract_value NUMERIC NOT NULL DEFAULT 0,
  contract_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_day INTEGER NOT NULL DEFAULT 10,
  payment_method TEXT NOT NULL DEFAULT 'pix'::text,
  status TEXT NOT NULL DEFAULT 'ativo'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: flyer_items
CREATE TABLE IF NOT EXISTS flyer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  template_id UUID,
  vehicle_model TEXT NOT NULL DEFAULT ''::text,
  vehicle_year TEXT NOT NULL DEFAULT ''::text,
  transmission TEXT NOT NULL DEFAULT 'manual'::text,
  fuel_type TEXT NOT NULL DEFAULT 'flex'::text,
  tire_condition TEXT NOT NULL DEFAULT 'bom'::text,
  price TEXT NOT NULL DEFAULT ''::text,
  extra_info TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}'::text[],
  generated_image_url TEXT,
  generated_video_url TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: flyer_templates
CREATE TABLE IF NOT EXISTS flyer_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT ''::text,
  template_type TEXT NOT NULL DEFAULT 'frame'::text,
  file_url TEXT NOT NULL DEFAULT ''::text,
  preview_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: goals
CREATE TABLE IF NOT EXISTS goals (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'clients'::text,
  title TEXT NOT NULL DEFAULT ''::text,
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'mensal'::text,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL DEFAULT (CURRENT_DATE + '30 days'::interval),
  status TEXT NOT NULL DEFAULT 'em_andamento'::text,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: integration_logs
CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT ''::text,
  action TEXT NOT NULL DEFAULT ''::text,
  status TEXT NOT NULL DEFAULT 'success'::text,
  message TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: kanban_tasks
CREATE TABLE IF NOT EXISTS kanban_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  title TEXT NOT NULL,
  column TEXT NOT NULL DEFAULT 'backlog'::text,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  week_start DATE NOT NULL,
  recording_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT ''::text,
  message TEXT NOT NULL DEFAULT ''::text,
  type TEXT NOT NULL DEFAULT 'info'::text,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: onboarding_tasks
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  stage TEXT NOT NULL DEFAULT 'contrato'::text,
  title TEXT NOT NULL DEFAULT ''::text,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'::text,
  contract_url TEXT,
  contract_sent BOOLEAN DEFAULT false,
  contract_signed BOOLEAN DEFAULT false,
  briefing_completed BOOLEAN DEFAULT false,
  briefing_data JSONB DEFAULT '{}'::jsonb,
  wants_new_identity BOOLEAN,
  use_real_photos BOOLEAN,
  photo_warning_shown BOOLEAN DEFAULT false,
  assigned_to UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drive_link TEXT
);

-- Table: partners
CREATE TABLE IF NOT EXISTS partners (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_name TEXT,
  service_function TEXT NOT NULL DEFAULT ''::text,
  fixed_rate NUMERIC NOT NULL DEFAULT 0,
  phone TEXT DEFAULT ''::text,
  notes TEXT DEFAULT ''::text,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: payment_config
CREATE TABLE IF NOT EXISTS payment_config (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  pix_key TEXT NOT NULL DEFAULT ''::text,
  receiver_name TEXT NOT NULL DEFAULT ''::text,
  bank TEXT NOT NULL DEFAULT ''::text,
  document TEXT NOT NULL DEFAULT ''::text,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  msg_billing_due TEXT NOT NULL DEFAULT 'Olá, {nome_cliente}! 😊

Passando para lembrar que a mensalidade no valor de {valor} vence no dia {dia_vencimento}.

Se já realizou o pagamento, por favor desconsidere esta mensagem.

{dados_pagamento}

Qualquer dúvida, estamos à disposição!

Equipe Pulse Growth Marketing 🚀'::text,
  msg_billing_overdue TEXT NOT NULL DEFAULT 'Olá, {nome_cliente}! 😊

Esperamos que esteja tudo bem! Passando aqui apenas para lembrar que identificamos uma pendência referente à mensalidade no valor de {valor}.

Se já realizou o pagamento, por favor desconsidere esta mensagem e nos envie o comprovante.

{dados_pagamento}

Qualquer dúvida, estamos à disposição!

Equipe Pulse Growth Marketing 🚀'::text,
  include_delivery_report BOOLEAN NOT NULL DEFAULT true,
  msg_payment_data TEXT NOT NULL DEFAULT '💳 *Dados para pagamento:*
Nome: {nome_recebedor}
Banco: {banco}
Chave PIX: {chave_pix}
CPF/CNPJ: {documento}'::text,
  msg_delivery_report TEXT NOT NULL DEFAULT 'Esse mês foi incrível e fizemos muita coisa juntos! 💪

Estivemos juntos durante *{horas_gravacao}h de gravação* em {sessoes} sessão(ões) 📹
Produzimos *{videos} vídeos* para sua marca 🎬
Publicamos *{reels} reels* no seu perfil 🎥
Estivemos presentes nos stories com *{stories} publicações* 📱
Criamos *{artes} artes* para seus canais 🎨
Desenvolvemos *{criativos} criativos* para suas campanhas ✨
Ainda entregamos *{extras} conteúdos extras* além do contratado ➕'::text
);

-- Table: plans
CREATE TABLE IF NOT EXISTS plans (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''::text,
  reels_qty INTEGER NOT NULL DEFAULT 0,
  creatives_qty INTEGER NOT NULL DEFAULT 0,
  stories_qty INTEGER NOT NULL DEFAULT 0,
  arts_qty INTEGER NOT NULL DEFAULT 0,
  recording_sessions INTEGER NOT NULL DEFAULT 0,
  recording_hours NUMERIC NOT NULL DEFAULT 0,
  extra_content_allowed INTEGER NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  periodicity TEXT NOT NULL DEFAULT 'mensal'::text,
  status TEXT NOT NULL DEFAULT 'ativo'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  partner_id UUID,
  partner_cost NUMERIC NOT NULL DEFAULT 0,
  is_partner_plan BOOLEAN NOT NULL DEFAULT false,
  accepts_extra_content BOOLEAN NOT NULL DEFAULT false
);

-- Table: profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'editor'::app_role,
  avatar_url TEXT,
  display_name TEXT,
  job_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bio TEXT DEFAULT ''::text,
  birthday DATE
);

-- Table: recordings
CREATE TABLE IF NOT EXISTS recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  videomaker_id UUID NOT NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixa'::text,
  status TEXT NOT NULL DEFAULT 'agendada'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmation_status TEXT NOT NULL DEFAULT 'pendente'::text
);

-- Table: revenues
CREATE TABLE IF NOT EXISTS revenues (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  contract_id UUID NOT NULL,
  reference_month DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'prevista'::text,
  paid_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: scripts
CREATE TABLE IF NOT EXISTS scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  title TEXT NOT NULL,
  video_type TEXT NOT NULL DEFAULT 'vendas'::text,
  content TEXT NOT NULL DEFAULT ''::text,
  recorded BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'normal'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_endomarketing BOOLEAN NOT NULL DEFAULT false,
  endo_client_id UUID,
  scheduled_date DATE,
  content_format TEXT NOT NULL DEFAULT 'reels'::text,
  created_by UUID,
  client_priority TEXT NOT NULL DEFAULT 'normal'::text,
  caption TEXT DEFAULT ''::text
);

-- Table: social_accounts
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT 'instagram'::text,
  facebook_page_id TEXT,
  instagram_business_id TEXT,
  account_name TEXT NOT NULL DEFAULT ''::text,
  access_token TEXT NOT NULL DEFAULT ''::text,
  token_expiration TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'connected'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: social_media_deliveries
CREATE TABLE IF NOT EXISTS social_media_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'reels'::text,
  title TEXT NOT NULL DEFAULT ''::text,
  description TEXT,
  delivered_at DATE NOT NULL DEFAULT CURRENT_DATE,
  posted_at DATE,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'entregue'::text,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_time TEXT,
  script_id UUID,
  recording_id UUID,
  content_task_id UUID
);

-- Table: task_comments
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: task_history
CREATE TABLE IF NOT EXISTS task_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL DEFAULT ''::text,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: traffic_campaigns
CREATE TABLE IF NOT EXISTS traffic_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  design_task_id UUID,
  content_task_id UUID,
  title TEXT NOT NULL DEFAULT ''::text,
  content_type TEXT NOT NULL DEFAULT 'criativo'::text,
  campaign_start_date DATE,
  campaign_end_date DATE,
  status TEXT NOT NULL DEFAULT 'ativo'::text,
  budget NUMERIC DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: user_permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: user_roles
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL
);

-- Table: whatsapp_config
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  api_token_configured BOOLEAN NOT NULL DEFAULT false,
  integration_active BOOLEAN NOT NULL DEFAULT false,
  default_user_id TEXT NOT NULL DEFAULT ''::text,
  default_queue_id TEXT NOT NULL DEFAULT ''::text,
  send_signature BOOLEAN NOT NULL DEFAULT false,
  close_ticket BOOLEAN NOT NULL DEFAULT false,
  auto_recording_scheduled BOOLEAN NOT NULL DEFAULT true,
  auto_recording_reminder BOOLEAN NOT NULL DEFAULT true,
  auto_video_approval BOOLEAN NOT NULL DEFAULT true,
  auto_video_approved BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  api_token TEXT NOT NULL DEFAULT ''::text,
  msg_recording_scheduled TEXT NOT NULL DEFAULT 'Olá! Sua gravação foi agendada.

Cliente: {nome_cliente}
Data: {data_gravacao}
Horário: {hora_gravacao}
Videomaker: {videomaker}

Equipe Pulse Growth Marketing'::text,
  msg_recording_reminder TEXT NOT NULL DEFAULT 'Lembrete da sua gravação amanhã.

Cliente: {nome_cliente}
Horário: {hora_gravacao}

Equipe Pulse Growth Marketing'::text,
  msg_video_approval TEXT NOT NULL DEFAULT 'Seu vídeo está pronto para aprovação.

Acesse o link abaixo para assistir:
{link_video}

Se precisar de ajustes nos avise.

Equipe Pulse Growth Marketing'::text,
  msg_video_approved TEXT NOT NULL DEFAULT 'Seu vídeo foi aprovado e será publicado em breve.

Obrigado pela confiança na Pulse Growth Marketing.'::text,
  msg_confirmation TEXT NOT NULL DEFAULT 'Olá, {nome_cliente}!

Aqui é a equipe da Pulse Growth Marketing 🚀

Passando para confirmar sua gravação agendada.

📅 Data: {data_gravacao}
⏰ Horário: {hora_gravacao}
🎥 Videomaker: {videomaker}

Por favor responda com uma das opções abaixo:

1️⃣ Confirmar gravação
2️⃣ Cancelar gravação

Assim conseguimos organizar nossa agenda da melhor forma para você.'::text,
  msg_confirmation_confirmed TEXT NOT NULL DEFAULT 'Perfeito, {nome_cliente}!

Sua gravação está confirmada para:

📅 {data_gravacao}
⏰ {hora_gravacao}

Nossa equipe estará pronta para criar conteúdos incríveis para sua marca 🚀

Até breve!

Equipe Pulse Growth Marketing'::text,
  msg_confirmation_cancelled TEXT NOT NULL DEFAULT 'Entendido, {nome_cliente}.

Sua gravação foi marcada como cancelada.

Se surgir uma nova vaga na agenda entraremos em contato com você.

Equipe Pulse Growth Marketing'::text,
  msg_backup_invite TEXT NOT NULL DEFAULT 'Olá, {nome_cliente}!

Surgiu uma vaga extra de gravação na agenda da Pulse 🚀

📅 Data: {data_gravacao}
⏰ Horário: {hora_gravacao}

Gostaria de aproveitar essa oportunidade para gravar conteúdos extras?

Responda:

1️⃣ Quero aproveitar
2️⃣ Não posso dessa vez'::text,
  msg_backup_confirmed TEXT NOT NULL DEFAULT 'Perfeito, {nome_cliente}!

Sua gravação extra foi confirmada.

Nossa equipe estará indo até você no horário combinado.

Equipe Pulse Growth Marketing'::text,
  auto_confirmation BOOLEAN NOT NULL DEFAULT true,
  msg_approval_expired TEXT NOT NULL DEFAULT 'Olá, {nome_cliente}! 😊

Para manter o fluxo de conteúdos em dia e não atrasar suas publicações, o vídeo "{titulo}" foi encaminhado para agendamento pela nossa equipe.

Pode ficar tranquilo(a)! Foi feita uma revisão interna cuidadosa no vídeo antes de seguir para a postagem. 👍

Se precisar de algum ajuste, é só nos avisar!

Equipe Pulse Growth Marketing 🚀'::text,
  auto_task_editing BOOLEAN NOT NULL DEFAULT true,
  msg_task_editing TEXT NOT NULL DEFAULT 'Olá, {nome_cliente}! 🎬

Hoje gravamos o vídeo *"{titulo}"* e ele já está com o nosso time de edição! ✂️

Assim que estiver pronto, enviaremos o link aqui para sua aprovação. 📲

Agradecemos pela confiança!

Equipe Pulse Growth Marketing 🚀'::text,
  auto_task_approved BOOLEAN NOT NULL DEFAULT true,
  msg_task_approved TEXT NOT NULL DEFAULT 'Olá, {nome_cliente}! ✅

Seu vídeo *"{titulo}"* foi aprovado com sucesso e já está sendo encaminhado para agendamento! 📅

Obrigado pela confiança!

Equipe Pulse Growth Marketing 🚀'::text,
  auto_approval_expired BOOLEAN NOT NULL DEFAULT true
);

-- Table: whatsapp_confirmations
CREATE TABLE IF NOT EXISTS whatsapp_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL,
  client_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'confirmation'::text,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_message TEXT,
  backup_client_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  backup_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: whatsapp_messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  api_response JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID,
  client_id UUID,
  trigger_type TEXT NOT NULL DEFAULT 'manual'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary Keys
ALTER TABLE active_recordings ADD PRIMARY KEY (id);
ALTER TABLE api_integration_logs ADD PRIMARY KEY (id);
ALTER TABLE api_integrations ADD PRIMARY KEY (id);
ALTER TABLE automation_flows ADD PRIMARY KEY (id);
ALTER TABLE automation_logs ADD PRIMARY KEY (id);
ALTER TABLE billing_messages ADD PRIMARY KEY (id);
ALTER TABLE cash_reserve_movements ADD PRIMARY KEY (id);
ALTER TABLE client_endomarketing_contracts ADD PRIMARY KEY (id);
ALTER TABLE client_portal_comments ADD PRIMARY KEY (id);
ALTER TABLE client_portal_contents ADD PRIMARY KEY (id);
ALTER TABLE client_portal_notifications ADD PRIMARY KEY (id);
ALTER TABLE clients ADD PRIMARY KEY (id);
ALTER TABLE company_settings ADD PRIMARY KEY (id);
ALTER TABLE content_tasks ADD PRIMARY KEY (id);
ALTER TABLE delivery_records ADD PRIMARY KEY (id);
ALTER TABLE design_task_history ADD PRIMARY KEY (id);
ALTER TABLE design_tasks ADD PRIMARY KEY (id);
ALTER TABLE endomarketing_agendamentos ADD PRIMARY KEY (id);
ALTER TABLE endomarketing_clientes ADD PRIMARY KEY (id);
ALTER TABLE endomarketing_logs ADD PRIMARY KEY (id);
ALTER TABLE endomarketing_packages ADD PRIMARY KEY (id);
ALTER TABLE endomarketing_partner_tasks ADD PRIMARY KEY (id);
ALTER TABLE endomarketing_profissionais ADD PRIMARY KEY (id);
ALTER TABLE expense_categories ADD PRIMARY KEY (id);
ALTER TABLE expenses ADD PRIMARY KEY (id);
ALTER TABLE financial_activity_log ADD PRIMARY KEY (id);
ALTER TABLE financial_chat_messages ADD PRIMARY KEY (id);
ALTER TABLE financial_contracts ADD PRIMARY KEY (id);
ALTER TABLE flyer_items ADD PRIMARY KEY (id);
ALTER TABLE flyer_templates ADD PRIMARY KEY (id);
ALTER TABLE goals ADD PRIMARY KEY (id);
ALTER TABLE integration_logs ADD PRIMARY KEY (id);
ALTER TABLE kanban_tasks ADD PRIMARY KEY (id);
ALTER TABLE notifications ADD PRIMARY KEY (id);
ALTER TABLE onboarding_tasks ADD PRIMARY KEY (id);
ALTER TABLE partners ADD PRIMARY KEY (id);
ALTER TABLE payment_config ADD PRIMARY KEY (id);
ALTER TABLE plans ADD PRIMARY KEY (id);
ALTER TABLE profiles ADD PRIMARY KEY (id);
ALTER TABLE recordings ADD PRIMARY KEY (id);
ALTER TABLE revenues ADD PRIMARY KEY (id);
ALTER TABLE scripts ADD PRIMARY KEY (id);
ALTER TABLE social_accounts ADD PRIMARY KEY (id);
ALTER TABLE social_media_deliveries ADD PRIMARY KEY (id);
ALTER TABLE task_comments ADD PRIMARY KEY (id);
ALTER TABLE task_history ADD PRIMARY KEY (id);
ALTER TABLE traffic_campaigns ADD PRIMARY KEY (id);
ALTER TABLE user_permissions ADD PRIMARY KEY (id);
ALTER TABLE user_roles ADD PRIMARY KEY (id);
ALTER TABLE whatsapp_config ADD PRIMARY KEY (id);
ALTER TABLE whatsapp_confirmations ADD PRIMARY KEY (id);
ALTER TABLE whatsapp_messages ADD PRIMARY KEY (id);

-- Unique Constraints
ALTER TABLE active_recordings ADD CONSTRAINT active_recordings_recording_id_key UNIQUE (recording_id);
ALTER TABLE financial_contracts ADD CONSTRAINT financial_contracts_client_id_key UNIQUE (client_id);
ALTER TABLE partners ADD CONSTRAINT partners_user_id_key UNIQUE (user_id);
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_user_id_module_key UNIQUE (user_id, module);
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- Indexes
CREATE INDEX idx_portal_comments_content ON client_portal_comments (content_id);
CREATE INDEX idx_portal_contents_client ON client_portal_contents (client_id);
CREATE INDEX idx_portal_contents_season ON client_portal_contents (season_year, season_month);

-- Functions

CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION get_user_role(_user_id UUID)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION get_client_by_login(p_login TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM clients WHERE client_login = p_login LIMIT 1
$$;

CREATE OR REPLACE FUNCTION notify_user(_user_id UUID, _title TEXT, _message TEXT, _type TEXT, _link TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message, type, link) VALUES (_user_id, _title, _message, _type, _link);
END;
$$;

CREATE OR REPLACE FUNCTION notify_role(_role app_role, _title TEXT, _message TEXT, _type TEXT, _link TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message, type, link)
  SELECT ur.user_id, _title, _message, _type, _link FROM user_roles ur WHERE ur.role = _role;
END;
$$;

-- ============================================
-- Custom Auth Table (replaces Supabase Auth)
-- ============================================

CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sign_in TIMESTAMPTZ
);

-- Table: recording_wait_logs
CREATE TABLE IF NOT EXISTS recording_wait_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL,
  videomaker_id UUID NOT NULL,
  client_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  wait_duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
