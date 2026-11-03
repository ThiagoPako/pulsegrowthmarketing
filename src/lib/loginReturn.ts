// Volta depois do login (03/11/2026): o storymaker de evento manda a equipe para /login?volta=/story/<token>; depois de
// entrar, a pessoa volta para a página do evento. Só caminhos do storymaker, para o parâmetro não virar redirecionamento aberto.
export function loginReturnPath(search: string): string | null {
  const v = new URLSearchParams(search).get('volta') || '';
  return /^\/story\/[A-Za-z0-9_-]{20,40}$/.test(v) ? v : null;
}
