export const SupabaseCheck = () => {
  return (
    <div className="p-4 bg-card text-card-foreground rounded-lg border shadow-sm">
      <h2 className="text-lg font-bold mb-2">Comando de Atualização da VPS</h2>
      <p className="mb-4">Use o comando abaixo no terminal da sua VPS para carregar todas as atualizações mais recentes:</p>
      <div className="bg-muted p-3 rounded font-mono text-sm break-all select-all">
        cd /var/www/pulsegrowthmarketing && git pull && npm install && npm run build && pm2 restart pulse-api pulse-uploads && sudo systemctl reload nginx && pm2 status
      </div>
      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md text-sm text-blue-600 dark:text-blue-400">
        <strong>Nota:</strong> Este comando sincroniza o código, reconstrói o frontend e reinicia os serviços do backend.
      </div>
    </div>
  );
};

export default SupabaseCheck;