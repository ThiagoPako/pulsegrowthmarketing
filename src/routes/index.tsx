// COMANDO DE DEPLOY (COPIE E COLE NO TERMINAL DA VPS):
// cd /var/www/pulsegrowthmarketing && git stash push -m "pre-deploy" && git pull && npm install && rm -rf dist && node scripts/generate-build-id.mjs && npm run build && pm2 restart pulse-api --update-env && sudo systemctl reload nginx && pm2 status

// A funcionalidade de geração de receitas recorrentes (botão "Gerar Receitas do Mês") foi implementada.
// Ela gera cobranças para todos os contratos ativos no mês selecionado, evitando duplicidades.

















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