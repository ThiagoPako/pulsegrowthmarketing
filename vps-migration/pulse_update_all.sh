#!/bin/bash
# ============================================
# Pulse Growth Marketing - VPS UPDATE COMPLETO
# Execute como root na VPS
# Inclui: Relatórios de Custo + Rateio + Editor Videomaker
# ============================================

set -e

PROJECT_DIR="/var/www/pulsegrowthmarketing"
DB_NAME="pulse_db"
DB_USER="pulse_user"
NGINX_WWW="/var/www/html"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  PULSE GROWTH - UPDATE COMPLETO                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ============================================
# 1. PUXAR CÓDIGO ATUALIZADO
# ============================================
echo ""
echo "=== 1. Puxando atualizações do Git ==="
cd $PROJECT_DIR
git stash || true
git pull origin main
git stash pop || true

# ============================================
# 2. DEPENDÊNCIAS
# ============================================
echo ""
echo "=== 2. Instalando dependências do projeto ==="
bun install

cd "$PROJECT_DIR/vps-api-server"
if [ -f "package.json" ]; then
    echo "=== 2.1. Instalando dependências da API ==="
    npm install || bun install || true
fi

# ============================================
# 3. BUILD DO FRONTEND
# ============================================
echo ""
echo "=== 3. Gerando build de produção ==="
cd $PROJECT_DIR
bun run build

# Copiar build para nginx se necessário
if [ -d "$PROJECT_DIR/dist" ] && [ -d "$NGINX_WWW" ]; then
    echo "=== 3.1. Copiando build para nginx ==="
    cp -r $PROJECT_DIR/dist/* $NGINX_WWW/ || true
fi

# ============================================
# 4. MIGRAÇÕES DO BANCO DE DADOS
# ============================================
echo ""
echo "=== 4. Aplicando migrações no PostgreSQL ==="

# -- 4.1 Enum para regra de rateio --
sudo -u postgres psql -d $DB_NAME -c "
DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cost_allocation_rule') THEN
        CREATE TYPE cost_allocation_rule AS ENUM ('approved', 'recorded', 'posted');
    END IF;
END \$\$;
"

# -- 4.2 Coluna de rateio em company_settings --
sudo -u postgres psql -d $DB_NAME -c "
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS cost_allocation_rule cost_allocation_rule 
NOT NULL DEFAULT 'approved'::cost_allocation_rule;
"

# -- 4.3 Garantir colunas de edição em content_tasks (Editor Videomaker) --
sudo -u postgres psql -d $DB_NAME -c "
ALTER TABLE content_tasks
ADD COLUMN IF NOT EXISTS editing_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS editing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS edited_video_link TEXT,
ADD COLUMN IF NOT EXISTS edited_video_type TEXT DEFAULT 'link',
ADD COLUMN IF NOT EXISTS approval_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS adjustment_notes TEXT,
ADD COLUMN IF NOT EXISTS script_alteration_type TEXT,
ADD COLUMN IF NOT EXISTS script_alteration_notes TEXT,
ADD COLUMN IF NOT EXISTS editing_priority BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS immediate_alteration BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS review_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS alteration_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approval_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewing_by UUID,
ADD COLUMN IF NOT EXISTS reviewing_by_name TEXT,
ADD COLUMN IF NOT EXISTS reviewing_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS editing_paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS editing_paused_seconds INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS edited_by UUID;
"

# -- 4.4 Colunas para gravação ao vivo (Live Recording) --
sudo -u postgres psql -d $DB_NAME -c "
ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_total_seconds INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS planned_script_ids TEXT[] NOT NULL DEFAULT '{}'::text[];
"

# -- 4.5 Tabela de gravações ativas (se não existir) --
sudo -u postgres psql -d $DB_NAME -c "
CREATE TABLE IF NOT EXISTS active_recordings (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    recording_id UUID NOT NULL,
    videomaker_id UUID NOT NULL,
    client_id UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    planned_script_ids TEXT[] NOT NULL DEFAULT '{}'::text[]
);
"

# -- 4.6 Garantir tabela de design_task_history --
sudo -u postgres psql -d $DB_NAME -c "
CREATE TABLE IF NOT EXISTS design_task_history (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    action TEXT NOT NULL DEFAULT ''::text,
    details TEXT,
    attachment_url TEXT,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"

# -- 4.7 Garantir expense_categories se necessário --
sudo -u postgres psql -d $DB_NAME -c "
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"

# -- 4.8 Índices de performance para relatórios de custo --
sudo -u postgres psql -d $DB_NAME -c "
CREATE INDEX IF NOT EXISTS idx_content_tasks_edited_by ON content_tasks(edited_by);
CREATE INDEX IF NOT EXISTS idx_content_tasks_assigned_to ON content_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_content_tasks_client_id ON content_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_content_tasks_kanban_column ON content_tasks(kanban_column);
CREATE INDEX IF NOT EXISTS idx_recordings_videomaker ON recordings(videomaker_id);
CREATE INDEX IF NOT EXISTS idx_recordings_client ON recordings(client_id);
CREATE INDEX IF NOT EXISTS idx_recordings_date ON recordings(date);
CREATE INDEX IF NOT EXISTS idx_design_tasks_assigned ON design_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_social_deliveries_client ON social_media_deliveries(client_id);
CREATE INDEX IF NOT EXISTS idx_social_deliveries_created_by ON social_media_deliveries(created_by);
"

# -- 4.9 Re-aplicar schema completo (idempotent) --
echo "=== 4.10 Re-aplicando schema completo ==="
if [ -f "$PROJECT_DIR/vps-migration/pulse_vps_schema.sql" ]; then
    sudo -u postgres psql -d $DB_NAME -f $PROJECT_DIR/vps-migration/pulse_vps_schema.sql || echo "Schema aplicado com warnings (normal para IF NOT EXISTS)"
fi

# ============================================
# 5. REINICIAR SERVIÇOS
# ============================================
echo ""
echo "=== 5. Reiniciando serviços ==="

# -- API Node (PM2) --
if [ -d "$PROJECT_DIR/vps-api-server" ]; then
    cd "$PROJECT_DIR/vps-api-server"
    if command -v pm2 &> /dev/null; then
        echo "=== 5.1 Reiniciando API Node (PM2) ==="
        pm2 restart pulse-api || pm2 start server.mjs --name pulse-api || echo "PM2: serviço já rodando ou requer start manual"
        pm2 save
    else
        echo "AVISO: PM2 não encontrado. Reinicie o servidor Node manualmente:"
        echo "  cd $PROJECT_DIR/vps-api-server && node server.mjs"
    fi
fi

# -- Nginx --
if command -v nginx &> /dev/null; then
    echo "=== 5.2 Reload Nginx ==="
    nginx -t && systemctl reload nginx || true
fi

# ============================================
# 6. VERIFICAÇÃO
# ============================================
echo ""
echo "=== 6. Verificação pós-update ==="
sudo -u postgres psql -d $DB_NAME -c "
SELECT 
    'company_settings' as tabela,
    column_name,
    data_type 
FROM information_schema.columns 
WHERE table_name = 'company_settings' AND column_name = 'cost_allocation_rule'
UNION ALL
SELECT 
    'content_tasks' as tabela,
    column_name,
    data_type 
FROM information_schema.columns 
WHERE table_name = 'content_tasks' AND column_name IN ('editing_deadline','edited_by','editing_started_at')
UNION ALL
SELECT 
    'recordings' as tabela,
    column_name,
    data_type 
FROM information_schema.columns 
WHERE table_name = 'recordings' AND column_name IN ('timer_started_at','timer_total_seconds');
"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  UPDATE CONCLUÍDO COM SUCESSO!                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Novidades ativadas:                                         ║"
echo "║   • Relatórios de custo por colaborador/serviço/cliente      ║"
echo "║   • Regra de rateio configurável (approved/recorded/posted)  ║"
echo "║   • Funções de editor no dashboard de videomaker             ║"
echo "║   • Live recording com cronômetro                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
