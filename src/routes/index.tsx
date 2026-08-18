// preciso que tenha um botão em proposta unica para ativar a funcao do plano anual com desconto nos primeiros 6 meses
// cd /var/www/pulsegrowthmarketing && git stash push -m "pre-deploy" && git pull && npm install && rm -rf dist && node scripts/generate-build-id.mjs && npm run build && pm2 restart pulse-api --update-env && sudo systemctl reload nginx && pm2 status

// Suporte a Ofertas Granulares (Anual 6+6):
// A tabela plan_promotions agora suporta duration_months. 
// Na apresentação de planos, ofertas de duração menor que o contrato (ex: 6 meses promo em contrato de 12)
// são exibidas com a transição de valores clara para o cliente.



















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