import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Rocket } from 'lucide-react';

export interface LegalLayoutProps {
  title: string;
  subtitle?: string;
  updatedAt?: string;
  children: ReactNode;
}

/**
 * Layout compartilhado das páginas legais públicas (Privacidade, Termos, Exclusão de Dados).
 * Essas páginas precisam ser acessíveis sem login para a revisão do app Meta.
 */
export default function LegalLayout({ title, subtitle, updatedAt = '08 de setembro de 2026', children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <Rocket size={14} className="text-primary-foreground" />
          </div>
          <Link to="/" className="font-display font-semibold hover:text-primary transition-colors">
            Pulse Growth Marketing
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-display font-bold">{title}</h1>
        {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        <p className="mt-1 text-xs text-muted-foreground">Última atualização: {updatedAt}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mt-8 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </main>

      <footer className="border-t border-border/50 mt-10">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/politica-de-privacidade" className="hover:text-primary transition-colors">Política de Privacidade</Link>
          <Link to="/termos-de-uso" className="hover:text-primary transition-colors">Termos de Uso</Link>
          <Link to="/exclusao-de-dados" className="hover:text-primary transition-colors">Exclusão de Dados</Link>
          <span className="ml-auto">contato@agenciapulse.tech</span>
        </div>
      </footer>
    </div>
  );
}
