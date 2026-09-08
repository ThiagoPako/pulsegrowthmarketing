import LegalLayout from './LegalLayout';

export default function TermsOfUse() {
  return (
    <LegalLayout
      title="Termos de Uso"
      subtitle="Condições de uso do sistema Pulse HUB, da Pulse Growth Marketing."
    >
      <h2>1. Objeto</h2>
      <p>
        O Pulse HUB é um sistema de uso interno da Pulse Growth Marketing e de seus clientes contratantes, destinado
        à gestão de produção de conteúdo, aprovação e publicação automática em redes sociais.
      </p>

      <h2>2. Acesso</h2>
      <ul>
        <li>O acesso é individual, nominal e concedido pela agência.</li>
        <li>O usuário é responsável por manter suas credenciais em sigilo.</li>
        <li>É proibido compartilhar acesso ou tentar burlar as permissões de perfil.</li>
      </ul>

      <h2>3. Conexão de contas Facebook e Instagram</h2>
      <p>
        A conexão de contas ocorre por autorização oficial da Meta. Ao autorizar, o cliente permite que a agência
        publique conteúdos previamente combinados em sua conta profissional. A autorização pode ser revogada a
        qualquer momento, sem custo, encerrando imediatamente a publicação automática.
      </p>

      <h2>4. Responsabilidade pelo conteúdo</h2>
      <p>
        O conteúdo publicado é de responsabilidade da agência e do cliente contratante, que declaram possuir os
        direitos sobre imagens, vídeos e textos utilizados, e se comprometem a respeitar as políticas de conteúdo da
        Meta e a legislação brasileira.
      </p>

      <h2>5. Disponibilidade</h2>
      <p>
        Empregamos esforços para manter o serviço disponível, mas publicações podem falhar por indisponibilidade das
        APIs da Meta, expiração de token ou recusa da plataforma. Nesses casos, o sistema registra o erro e permite
        nova tentativa.
      </p>

      <h2>6. Privacidade</h2>
      <p>
        O tratamento de dados segue a{' '}
        <a href="/politica-de-privacidade" className="text-primary underline">Política de Privacidade</a>.
      </p>

      <h2>7. Encerramento</h2>
      <p>
        Encerrado o contrato, o acesso é desativado e os vínculos com contas sociais são removidos, conforme a página
        de <a href="/exclusao-de-dados" className="text-primary underline">Exclusão de Dados</a>.
      </p>

      <h2>8. Contato</h2>
      <p>Dúvidas sobre estes termos: <strong>contato@agenciapulse.tech</strong>.</p>
    </LegalLayout>
  );
}
