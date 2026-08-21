// vamos organizar um breafing especifico quando cliente for provedor de internet, preciso saber as cidades que ele atua, qual os planos atuais e valores, se podemos fazer videos da equipe ou não,  quais os diferenciais da empresa que eles acreditam, se vamos ter verbas de marketing para blogueiras e marketing externo como outdorrs e panfletagem.  qual orcamento inicial para anúncios meta ads. quero evitar perguntas desnecessárias que não vao fazer muita diferença, preciso que seja pontual mas que tbm nao falte informações na hora de criar o editorial.
// cd /var/www/pulsegrowthmarketing && git stash push -m "pre-deploy" && git pull && npm install && rm -rf dist && node scripts/generate-build-id.mjs && npm run build && pm2 restart pulse-api --update-env && sudo systemctl reload nginx && pm2 status

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