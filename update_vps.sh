#!/bin/bash
git pull origin main
bun install
bun run build
psql -d $SUPABASE_DB_URL -f vps-api-server/migrations.sql # Exemplo se houver migrations
pm2 restart all
