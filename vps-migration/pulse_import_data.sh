#!/bin/bash
# ============================================
# Importar dados CSV para o PostgreSQL da VPS
# Execute após rodar pulse_vps_setup.sh
# ============================================

set -e
DB="pulse_db"
USER="pulse_user"
DATA_DIR="/var/www/pulsegrowthmarketing/pulse_data_export"

echo "=== Importando dados ==="

# Ordem importa por causa das foreign keys
# 1. Tabelas sem dependências
for table in plans expense_categories company_settings payment_config endomarketing_packages endomarketing_clientes endomarketing_profissionais flyer_templates whatsapp_config; do
  if [ -f "$DATA_DIR/${table}.csv" ]; then
    echo "Importing $table..."
    psql -U $USER -d $DB -c "\COPY $table FROM '$DATA_DIR/${table}.csv' WITH CSV HEADER"
  fi
done

# 2. profiles e user_roles (auth)
for table in profiles user_roles; do
  if [ -f "$DATA_DIR/${table}.csv" ]; then
    echo "Importing $table..."
    psql -U $USER -d $DB -c "\COPY $table FROM '$DATA_DIR/${table}.csv' WITH CSV HEADER"
  fi
done

# 3. Tabelas com FK para clients/profiles
for table in clients api_integrations automation_flows goals; do
  if [ -f "$DATA_DIR/${table}.csv" ]; then
    echo "Importing $table..."
    psql -U $USER -d $DB -c "\COPY $table FROM '$DATA_DIR/${table}.csv' WITH CSV HEADER"
  fi
done

# 4. Tabelas dependentes
for table in financial_contracts recordings scripts onboarding_tasks design_tasks notifications user_permissions partners revenues; do
  if [ -f "$DATA_DIR/${table}.csv" ]; then
    echo "Importing $table..."
    psql -U $USER -d $DB -c "\COPY $table FROM '$DATA_DIR/${table}.csv' WITH CSV HEADER"
  fi
done

# 5. Restante
for table in content_tasks delivery_records social_media_deliveries client_portal_contents client_portal_comments client_portal_notifications task_history task_comments design_task_history flyer_items whatsapp_messages whatsapp_confirmations billing_messages api_integration_logs automation_logs integration_logs financial_activity_log financial_chat_messages traffic_campaigns; do
  if [ -f "$DATA_DIR/${table}.csv" ]; then
    echo "Importing $table..."
    psql -U $USER -d $DB -c "\COPY $table FROM '$DATA_DIR/${table}.csv' WITH CSV HEADER"
  fi
done

echo "=== Importação concluída! ==="
