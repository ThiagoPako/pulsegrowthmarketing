// qual comando uso no terminal?
// cd /var/www/pulsegrowthmarketing && git stash push -m "pre-deploy" && git pull && npm install && rm -rf dist && node scripts/generate-build-id.mjs && npm run build && pm2 restart pulse-api --update-env && sudo systemctl reload nginx && pm2 status

// A funcionalidade de metas de entrega personalizáveis (Plano Especial) está ativa.
// Permite definir quantidades exatas (ex: 1, 2, 3) sem restrição de múltiplos de 4.
// O cálculo da meta total permite sobreposição manual em planos especiais.


















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