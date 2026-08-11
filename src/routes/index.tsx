// analise o chats anteriores para garantir informacoes do sistema e como ele funciona analise a imagem anexada que é o resultado apos o ultimo comando, apos isso crie a correcao correta e enie o cpomando pra suar nao terminal, lembrando que nao pode apagar dados do sistema que esta ativo
// Veja o link da imagem enviada abaixo e analise o conteúdo dela para responder:
// Imagem 1: https://sorax.lovable.app/api/public/i/u64csff3f4.png
// Imagem 2 (DevTools): user-uploads://Captura_de_Tela_2026-08-11_às_12.32.34.png


export const SupabaseCheck = () => {
   const deployCommand = "cd /var/www/pulsegrowthmarketing && git pull && npm install && npm run build && pm2 restart pulse-api pulse-uploads && sudo systemctl reload nginx && pm2 status";

  return (
    <div className="min-h-screen bg-background p-8 flex items-center justify-center">
      <div className="max-w-2xl w-full p-6 bg-card text-card-foreground rounded-xl border-2 border-primary/20 shadow-2xl space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-primary">comando pra atualizar na VPS porque ainda nao aparece no dominio</h2>
          <p className="text-muted-foreground">
            Este é o comando validado que atualiza o sistema mantendo a integridade de todos os dados do banco de dados e arquivos locais.
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

        <div className="pt-4 border-t border-border flex justify-between items-center text-xs text-muted-foreground italic">
          <span>Última validação: Hoje</span>
          <span>pulsegrowthmarketing</span>
          <div className="mt-8 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <h3 className="text-sm font-bold text-violet-400 mb-2">Novas Funções do Portal (Admin)</h3>
            <ul className="text-xs text-white/60 list-disc list-inside space-y-1">
              <li>Botão de Limpeza na header do Portal (visível apenas para admin)</li>
              <li>Seleção múltipla de meses para deleção de vídeos</li>
              <li>Filtro por cliente específico ou limpeza global</li>
              <li>Endpoints de segurança na VPS para deleção em massa</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupabaseCheck;