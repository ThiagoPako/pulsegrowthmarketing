// Textos padrão que a Ísis já usou (gerado a partir do histórico do git). Modelo salvo no banco igual a um destes
// é tratado como "não editado" e passa a usar o padrão atual (usuário, 01/11/2026: mensagens mais curtas e com respiro).
export const LEGACY_TEMPLATES = {
  "relatorio_mensal": [
    "Bom dia, {nome_cliente}! ☀️\n\nSegue o resumo do que entregamos em {mes_anterior} para você 🧡",
    "Bom dia, {nome_cliente}! ☀️\n\nFechamos {mes_anterior}. Veja o que fizemos juntos:\n\n🎬 {qtd_videos} vídeos · 🎨 {qtd_artes} artes\n📲 {qtd_posts} posts · 🎥 {qtd_gravacoes} gravações\n⏱️ {horas_dedicadas} h dedicadas ao seu perfil\n\n📈 {resumo_rede}\n\nPara {mes_atual}:\n{sugestoes}\n\nRelatório completo: {link_relatorio}",
    "Bom dia, {nome_cliente}! ☀️ Aqui é a Ísis, da Pulse.\nFechamos {mes_anterior} e quero te mostrar o que fizemos juntos:\n🎬 {qtd_videos} vídeos · 🎨 {qtd_artes} artes · 📲 {qtd_posts} posts · 🎥 {qtd_gravacoes} gravações\n⏱️ {horas_dedicadas} h dedicadas ao seu perfil\n📈 {resumo_rede}\nPara {mes_atual}, nossas sugestões:\n{sugestoes}\nO relatório completo está aqui: {link_relatorio}\nQualquer ideia, é só me chamar! 🧡"
  ],
  "pre_vencimento": [
    "Oi, {nome_cliente}! Obrigada por mais um mês de parceria 🧡\n\nEm {mes_ref}, fizemos {gravacoes} juntos.\n{dica_assiduidade}\n\nSua mensalidade vence dia {dia_vencimento}.",
    "Oi, {nome_cliente}! Obrigada por mais um mês de parceria 🧡\n\nEm {mes_ref}: {gravacoes_feitas} de {gravacoes_marcadas} gravações feitas.\n{dica_assiduidade}\n\nSua mensalidade vence dia {dia_vencimento}.",
    "Oi, {nome_cliente}! Passando para agradecer a parceria de mais um mês 🧡\nNas agendas de {mes_ref}: {gravacoes_feitas} de {gravacoes_marcadas} gravações realizadas, com média de {media_videos} vídeos por gravação.\n{dica_assiduidade}\nSua mensalidade vence dia {dia_vencimento}; no dia te mando o Pix e o link, tudo certinho."
  ],
  "cobranca": [
    "Olá, {nome_cliente}! Tudo bem? 😊\nHoje é o vencimento da sua mensalidade Pulse ({plano}): *{valor}*.\n👉 *Pague por aqui (Pix ou cartão):* {link_pagamento}\n💠 Prefere o Pix direto? O código vai na próxima mensagem: toque, segure e copie; no app do seu banco, vá em Pix → Pix Copia e Cola.\nChave: {chave_pix} · {nome_recebedor}\n_{aviso_cartao}_\nSe já pagou, pode desconsiderar. Obrigada pela confiança! 🧡",
    "Olá, {nome_cliente}! Tudo bem? 😊\nHoje é o vencimento da sua mensalidade Pulse ({plano}): *{valor}*.\n💠 *Pix (preferencial):*\n{pix_copia_cola}\nChave: {chave_pix} · {nome_recebedor}\n💳 Prefere cartão? Pague pelo link: {link_infinitepay}\n_{aviso_cartao}_\nSe já pagou, pode desconsiderar. Obrigada pela confiança! 🧡",
    "Olá, {nome_cliente}! Tudo bem? 😊\nHoje é o vencimento da sua mensalidade Pulse ({plano}): *{valor}*.\n💠 *Pix (preferencial):*\n{pix_copia_cola}\nChave: {chave_pix} · {nome_recebedor}\n💳 Prefere cartão? Pague pelo link (valor no cartão: {valor_cartao}, já com a taxa da operadora):\n{link_infinitepay}\nSe já pagou, pode desconsiderar. Obrigada pela confiança! 🧡",
    "Olá, {nome_cliente}! Tudo bem? 😊\nHoje é o vencimento da sua mensalidade Pulse ({plano}): *{valor}*.\n💠 *Pix (preferencial):*\n{pix_copia_cola}\nChave: {chave_pix} · {nome_recebedor}\n💳 Prefere cartão? Pague pelo link: {link_infinitepay}\nSe já pagou, pode desconsiderar. Obrigada pela confiança! 🧡"
  ],
  "lembrete": [
    "Oi, {nome_cliente}! Não localizamos ainda o pagamento da mensalidade de {mes_ref} ({valor}).\nSe já pagou, desconsidere e me desculpe 🙏. Se precisar, é só pagar por aqui (Pix ou cartão): {link_pagamento}\nO código Pix vai na próxima mensagem, para copiar.",
    "Oi, {nome_cliente}! Não localizamos ainda o pagamento da mensalidade de {mes_ref} ({valor}).\nSe já pagou, desconsidere e me desculpe 🙏. Se precisar, o Pix e o link continuam valendo:\n{pix_copia_cola}\n{link_infinitepay}"
  ],
  "obrigado": [
    "Olá, {nome_cliente}! Tudo bem?\nRecebemos o pagamento da sua mensalidade de {mes_ref} ({plano}), no valor de *{valor}*, em {data_pagamento}. ✅\nMuito obrigada pela confiança e pela parceria com a Pulse. É um prazer fazer parte da história de vocês e seguir construindo resultados juntos.\n{recibo}\nConte sempre com a gente! 🧡"
  ]
};

export const LEGACY_FOOTERS = [
  "—\n_Esta é uma mensagem automática. Para dúvidas, fale com o {contato_nome}: {contato_telefone}._",
  "—\n_Esta é uma mensagem automática. Para dúvidas, fale com o Thiago: (62) 98538-2981._"
];
