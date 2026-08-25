# Melhorar leitura do briefing e acessos do provedor

## Objetivo
Tornar a tela “Dados” do cliente totalmente compreensível em português e ampliar o briefing de provedor para registrar a situação e os acessos das redes sociais.

## Alterações
- Centralizar os rótulos amigáveis do briefing para evitar que chaves técnicas em inglês apareçam na visualização, histórico e PDF.
- Exibir briefings de provedor na mesma leitura organizada por seções usada no card do cliente, traduzindo também opções e listas salvas.
- Adicionar ao briefing de provedor:
  - Instagram existente (sim/não), usuário/link, login e senha;
  - página do Facebook existente (sim/não), link/nome da página, login e senha;
  - outros acessos ou observações de redes sociais.
- Carregar esses campos ao reabrir um briefing, salvá-los dentro de `briefing_data` e mostrá-los no resumo e no PDF.
- Manter compatibilidade com briefings antigos, ocultando campos vazios.

## Segurança e experiência
- Campos de senha terão visualização protegida no formulário e serão apresentados apenas nas áreas internas já destinadas aos dados do cliente.
- Respostas booleanas e códigos internos serão convertidos para “Sim”, “Não” e descrições em português.

## Validação
- Executar os testes disponíveis para os componentes afetados.
- Conferir no preview a tela pública do briefing e a leitura interna em “Dados”, incluindo responsividade e ausência de rótulos técnicos em inglês.

## Detalhes técnicos
- Frontend React/TypeScript, sem alterar a arquitetura VPS.
- Arquivos principais: formulário de briefing do provedor, resumo, leitura do briefing no módulo Clientes, histórico e geração de PDF.
