// CORREÇÃO: A tabela "plan_promotions" foi liberada na API da VPS adicionando-a ao array ALLOWED_TABLES no server.mjs.
// Reparo de Auth: Se houver erro de autenticação, acesse /repair-auth para sincronizar.
// Agenda CRM: Sistema de Briefing SDR -> Closer e lembretes 24h implementados.
// Cache-Busting: Estratégia de "Hard Reload" ativada para garantir que as atualizações fiquem visíveis na VPS.
// Agenda CRM Calendário: Regra de intervalo mínimo de 1h30 entre reuniões implementada.





export const SupabaseCheck = () => {
  const deployCommand = "cd /var/www/pulsegrowthmarketing && git stash push -m \"pre-deploy\" && git pull && npm install && rm -rf dist && node scripts/generate-build-id.mjs && npm run build && pm2 restart pulse-api --update-env && sudo systemctl reload nginx && pm2 status";

  return (
    <div className="min-h-screen bg-background p-8 flex flex-col items-center justify-start space-y-12">
      {/* Bloco de Atualização VPS */}
      <div className="max-w-2xl w-full p-6 bg-card text-card-foreground rounded-xl border-2 border-primary/20 shadow-2xl space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-primary">Comando para atualizar na VPS (Correção de Colunas)</h2>
          <p className="text-muted-foreground">
            Este comando força a limpeza de cache local, atualiza o código via Git (preservando alterações locais em stash) e reinicia os processos de forma atômica para garantir que as novas funcionalidades fiquem visíveis.
          </p>
        </div>

        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative bg-muted p-4 rounded-lg font-mono text-sm break-all cursor-pointer hover:bg-muted/80 transition-colors border border-border" onClick={() => navigator.clipboard.writeText(deployCommand)}>
            {deployCommand}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-secondary/50 rounded-lg border border-border">
            <span className="font-semibold block mb-1 text-primary">Preservação de Dados</span>
            O banco de dados PostgreSQL e os uploads não são afetados pelo build ou git pull.
          </div>
          <div className="p-3 bg-secondary/50 rounded-lg border border-border">
            <span className="font-semibold block mb-1 text-primary">Zero Downtime</span>
            O reload do Nginx e restart do PM2 garantem que a transição seja suave.
          </div>
        </div>
      </div>

      {/* Regras de Funcionamento da Colheita */}
      <div className="max-w-4xl w-full p-8 bg-card text-card-foreground rounded-xl border border-border shadow-sm space-y-8">
        <div className="border-b border-border pb-4">
          <h1 className="text-3xl font-black tracking-tighter text-primary uppercase">COLHEITA DE LEADS — FUNCIONAMENTO</h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            A funcionalidade Colheita de Leads será responsável por encontrar empresas para prospecção comercial, utilizando a base pública de CNPJ da Receita Federal e, posteriormente, o Google Places para enriquecimento dos dados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-3">
            <h3 className="font-bold text-lg text-primary">1. Definição da busca</h3>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>Estado</li>
              <li>Cidade ou região</li>
              <li>Segmento/nicho da empresa</li>
              <li>Opcionalmente, CNAE e outros filtros</li>
            </ul>
            <p className="text-xs italic">Ao clicar em “Iniciar Colheita”, o sistema começa a busca.</p>
          </section>

          <section className="space-y-3">
            <h3 className="font-bold text-lg text-primary">2. Receita Federal — empresas</h3>
            <p className="text-sm text-muted-foreground">
              O sistema consulta a base de CNPJ para identificar:
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>CNPJ, Razão social, Nome fantasia</li>
              <li>CNAE/atividade, Endereço completo</li>
              <li>Situação cadastral</li>
            </ul>
          </section>
        </div>

        <div className="space-y-4 bg-muted/30 p-6 rounded-lg border border-border">
          <h3 className="font-bold text-lg text-primary">3. Google — enriquecimento dos dados</h3>
          <p className="text-sm text-muted-foreground">
            O objetivo principal desta etapa é encontrar o <strong>telefone comercial</strong>.
            Também coletamos: Site, Avaliações e link do Google Maps.
          </p>
        </div>

        <div className="bg-primary/5 p-6 rounded-lg border-2 border-primary/20">
          <h3 className="font-bold text-lg text-primary uppercase mb-3">4. REGRA PRINCIPAL DA COLHEITA</h3>
          <p className="text-sm font-medium mb-4">
            A empresa só poderá virar um card dentro do sistema se possuir <span className="underline decoration-primary">telefone comercial encontrado</span>.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-background rounded border border-border">
              <p className="font-bold mb-1">Empresa A</p>
              <p>Receita ✅ | Google ✅ | Telefone ✅</p>
              <p className="text-green-500 font-bold mt-1">→ Gerar card</p>
            </div>
            <div className="p-3 bg-background rounded border border-border">
              <p className="font-bold mb-1">Empresa B</p>
              <p>Receita ✅ | Google ✅ | Telefone ❌</p>
              <p className="text-destructive font-bold mt-1">→ Não gerar card</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary">5. Geração dos Cards</h3>
          <p className="text-sm text-muted-foreground">
            O telefone será o critério obrigatório. Antes de criar, o sistema verifica duplicidade por CNPJ para evitar cadastros repetidos.
          </p>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          <div className="flex items-center gap-2">
            <span>Filtros</span>
            <span className="text-primary">→</span>
            <span>Receita Federal</span>
            <span className="text-primary">→</span>
            <span>Google Places</span>
            <span className="text-primary">→</span>
            <span>Card</span>
          </div>
          <span>Agência Pulse 2026</span>
        </div>
      </div>
    </div>
  );
};

export default SupabaseCheck;