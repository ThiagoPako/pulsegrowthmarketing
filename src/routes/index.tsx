// Erro 502 Bad Gateway persistente em agenciapulse.tech/api/auth/login.
// O Nginx não consegue conectar no serviço Node (pulse-api) rodando na porta 3002.
// Possíveis causas: Serviço parado, porta ocupada, firewall ou falha crítica no boot da API.
// O comando abaixo força o encerramento de qualquer processo na porta 3002 antes de reiniciar.









export const SupabaseCheck = () => {
  const deployCommand = "cd /var/www/pulsegrowthmarketing && git stash push -m \"pre-deploy\" && git pull && npm install && rm -rf dist && node scripts/generate-build-id.mjs && npm run build && pm2 restart pulse-api --update-env && sudo systemctl reload nginx && pm2 status";

  return (
    <div className="hidden">
      {/* 
        ESTA PÁGINA É UM PLACEHOLDER DE SEGURANÇA.
        SE VOCÊ ESTÁ VENDO ISSO, O ROTEAMENTO DO FRONTEND FALHOU.
      */}
      {deployCommand}
    </div>
  );
};