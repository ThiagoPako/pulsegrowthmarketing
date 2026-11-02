// ─── Portal do cliente: quem usa e quem precisa do link sem login (pedido do usuário, 02/11/2026) ────────────────
// "Sempre encaminhar o cliente para o portal… quando tiver vídeo para o cliente aprovar, enviar o link do portal para
// ele fazer login; caso o cliente fale no grupo que não tem acesso, que não consegue acessar, que não tem conta, já
// mande o link para fazer cadastro; cliente não acessou o portal, envie o link do vídeo para assistir e aprovar numa
// página única sem login." Regras puras (sem banco), para os testes.

/** Frases de quem não tem ou não consegue acesso ao portal (texto do grupo, sem acento e minúsculo). */
const NO_ACCESS = [
  /n[aã]o (tenho|tem|possuo) (acesso|login|senha|conta|cadastro)/,
  /n[aã]o (consigo|consegui|to conseguindo|estou conseguindo|da pra|dá pra|deu pra) (acessar|entrar|abrir|logar|ver)/,
  /(esqueci|perdi) (a |minha )?(senha|login)/,
  /(portal|link|area do cliente|área do cliente).{0,40}(nao|não) (abre|abriu|funciona|carrega|entra)/,
  /(como|onde) (eu )?(acesso|entro|faco login|faço login|me cadastro|crio (a )?conta)/,
  /(sem|nao tenho|não tenho) (acesso|cadastro) (ao|no) portal/,
  /(senha|login).{0,20}(errad|invalid|inválid|nao funciona|não funciona)/,
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** A mensagem do grupo diz que o cliente não tem ou não consegue acesso ao portal? */
export function saysNoPortalAccess(text) {
  const t = norm(text);
  if (t.length < 6) return false;
  const plain = (re) => new RegExp(norm(re.source.replace(/\\\//g, '/')), re.flags);
  return NO_ACCESS.some((re) => re.test(t) || plain(re).test(t));
}

/**
 * O cliente usa o portal? Tem login criado e entrou nos últimos 45 dias. Sem isso, o aviso de vídeo novo leva o link
 * de aprovação sem login de cada vídeo (e o de cadastro), além do portal.
 */
export function usesPortal({ users = 0, lastAccess = null, now = new Date() } = {}) {
  if (!(Number(users) > 0) || !lastAccess) return false;
  return now.getTime() - new Date(lastAccess).getTime() <= 45 * 86400000;
}

/** Mensagem de vídeo(s) para aprovar: portal para quem usa; link sem login de cada vídeo para quem não usa. */
export function approvalMessage({ firstName, items, portalUrl, signupUrl, portalUser }) {
  const hi = `Olá${firstName ? `, ${firstName}` : ''}! 😊`;
  if (portalUser) {
    const what = items.length === 1 ? `Seu conteúdo "${items[0].title}" ficou pronto! 🎬` : `${items.length} conteúdos novos chegaram no seu portal:\n${items.map((i) => `• ${i.title}`).join('\n')}`;
    return `${hi}\n\n${what}\n\n📱 Assista e aprove na sua Área do Cliente:\n${portalUrl}`;
  }
  const list = items.map((i) => `🎬 ${i.title}\n${i.link}`).join('\n\n');
  return [
    hi, '',
    items.length === 1 ? 'Seu vídeo ficou pronto! Toque no link para assistir como vai ficar no Instagram e aprovar ou pedir ajuste (não precisa de login):'
      : `${items.length} vídeos ficaram prontos! Toque em cada link para assistir como vai ficar no Instagram e aprovar ou pedir ajuste (não precisa de login):`,
    '', list, '',
    `📱 Na sua Área do Cliente você acompanha tudo em um lugar só. Crie seu acesso: ${signupUrl}`,
  ].join('\n');
}

/** Resposta no grupo para quem disse que não tem acesso: cadastro + os vídeos pendentes sem login. */
export function noAccessReply({ firstName, signupUrl, portalUrl, pending }) {
  return [
    `Oi${firstName ? `, ${firstName}` : ''}! Resolvemos agora 😊`, '',
    `👉 Crie seu acesso à Área do Cliente (leva 1 minuto):\n${signupUrl}`, '',
    `Depois é só entrar por aqui: ${portalUrl}`,
    ...(pending.length ? ['', 'Enquanto isso, dá para assistir e aprovar sem login:', ...pending.map((p) => `🎬 ${p.title}\n${p.link}`)] : []),
  ].join('\n');
}
