/**
 * SCRIPT DE REPARO ATÔMICO PARA VPS
 * Use este comando se as atualizações não aparecerem:
 * 
 * cd /var/www/pulsegrowthmarketing && \
 * git stash push -m "emergency-stash" && \
 * git pull origin main && \
 * npm install && \
 * rm -rf dist && \
 * npm run build && \
 * pm2 delete all 2>/dev/null || true && \
 * pm2 start vps-api-server/server.mjs --name pulse-api && \
 * sudo systemctl restart nginx && \
 * pm2 status
 */

console.log("Comando de reparo atômico gerado na documentação.");
