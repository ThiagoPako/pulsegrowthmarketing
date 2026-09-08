import LegalLayout from './LegalLayout';

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      subtitle="Como a Pulse Growth Marketing coleta, usa e protege dados no sistema Pulse HUB."
    >
      <h2>1. Quem somos</h2>
      <p>
        A Pulse Growth Marketing é uma agência de marketing que opera o sistema interno <strong>Pulse HUB</strong>,
        utilizado para gerenciar a produção de conteúdo e a publicação de postagens nas redes sociais dos clientes
        contratantes. Contato: <strong>contato@agenciapulse.tech</strong>.
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li><strong>Dados da agência e da equipe:</strong> nome, e-mail corporativo e função, usados apenas para autenticação e controle de acesso.</li>
        <li><strong>Dados dos clientes contratantes:</strong> razão social, responsável, contato e informações do contrato de serviço.</li>
        <li><strong>Dados de contas Meta (Facebook e Instagram):</strong> identificador da conta profissional, nome de usuário, nome da Página, foto de perfil pública e token de acesso emitido pela Meta.</li>
        <li><strong>Conteúdo de publicação:</strong> imagens, vídeos, legendas e horários agendados fornecidos pela agência ou pelo cliente.</li>
      </ul>

      <h2>3. Como usamos os dados da Meta</h2>
      <p>
        Os dados obtidos pelas APIs da Meta são usados exclusivamente para: identificar a conta profissional correta do
        cliente, publicar conteúdos autorizados (feed, carrossel, Reels e Stories) e exibir o status da publicação
        dentro do sistema. Não usamos esses dados para publicidade, criação de perfis comportamentais, venda ou
        compartilhamento com terceiros.
      </p>

      <h2>4. Armazenamento e segurança</h2>
      <ul>
        <li>Todos os dados ficam em servidor próprio (VPS) com banco de dados PostgreSQL de acesso restrito.</li>
        <li>Os tokens de acesso da Meta nunca são exibidos na interface e nunca são enviados ao navegador.</li>
        <li>O acesso ao sistema exige autenticação e é limitado por função (permissões por perfil).</li>
        <li>A comunicação com o sistema ocorre por HTTPS.</li>
      </ul>

      <h2>5. Retenção</h2>
      <p>
        Mantemos os dados enquanto durar a relação contratual com o cliente. Encerrado o contrato ou revogada a
        autorização, as credenciais e vínculos de conta social são excluídos do banco de dados.
      </p>

      <h2>6. Seus direitos</h2>
      <p>
        Conforme a LGPD (Lei 13.709/2018), o titular pode solicitar acesso, correção, portabilidade ou exclusão dos
        seus dados, além de revogar a autorização concedida ao aplicativo a qualquer momento. Basta escrever para
        <strong> contato@agenciapulse.tech</strong> ou seguir as instruções da página de{' '}
        <a href="/exclusao-de-dados" className="text-primary underline">Exclusão de Dados</a>.
      </p>

      <h2>7. Revogação pelo Facebook ou Instagram</h2>
      <p>
        A autorização também pode ser removida diretamente nas configurações da conta Meta, em “Aplicativos e sites”.
        Ao receber a notificação de remoção, apagamos automaticamente os tokens e vínculos associados.
      </p>

      <h2>8. Alterações</h2>
      <p>
        Esta política pode ser atualizada. A data da última revisão é sempre exibida no topo desta página.
      </p>
    </LegalLayout>
  );
}
