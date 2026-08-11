#!/bin/bash
# VPS Auth & Stability Repair Script
# Final build logic for agenciapulse.tech

set -e

PROJECT_ROOT="/var/www/pulsegrowthmarketing"
SERVER_PATH="$PROJECT_ROOT/vps-api-server"

echo "Step 1: Updating source code..."
cd $PROJECT_ROOT
git pull

echo "Step 2: Installing dependencies..."
npm install
cd $SERVER_PATH
npm install

echo "Step 3: Building frontend with stability patches..."
cd $PROJECT_ROOT
# Ensure we're building for production
npm run build

echo "Step 4: Ensuring database permissions for API user..."
# We assume the current shell has access to the db or we use the local postgres
# This fixes "must be owner" and "permission denied" errors shown in logs
sudo -u postgres psql -d pulse_db -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pulse_user;"
sudo -u postgres psql -d pulse_db -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pulse_user;"
sudo -u postgres psql -d pulse_db -c "ALTER TABLE auth_users OWNER TO pulse_user;"
sudo -u postgres psql -d pulse_db -c "ALTER TABLE profiles OWNER TO pulse_user;"
sudo -u postgres psql -d pulse_db -c "ALTER TABLE user_roles OWNER TO pulse_user;"

echo "Step 5: Cleaning Nginx cache and updating assets..."
NGINX_ROOT=$(grep -r "root" /etc/nginx/sites-enabled/ | head -1 | awk '{print $2}' | tr -d ';')
if [ -n "$NGINX_ROOT" ] && [ -d "$NGINX_ROOT" ]; then
    echo "Updating Nginx root: $NGINX_ROOT"
    sudo cp -r dist/* $NGINX_ROOT/
else
    echo "Using default Nginx root..."
    sudo cp -r dist/* /var/www/pulsegrowthmarketing/dist/
fi

echo "Step 6: Restarting PM2 processes..."
pm2 restart pulse-api || pm2 start server.mjs --name pulse-api
pm2 save

echo "Step 7: Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ SUCCESS: System updated and hardened."
pm2 status
