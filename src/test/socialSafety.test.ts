import { describe, expect, it } from 'vitest';
import { LIMITS, createLimiter, varyPublicReply } from '../../vps-api-server/lib/socialSafety.mjs';

describe('proteção das contas contra bloqueio', () => {
  it('respeita o espaço mínimo e o teto por hora de cada conta', () => {
    let t = 0;
    const lim = createLimiter({ now: () => t });
    expect(lim.take('public_reply', 'a')).toBe(true);
    t += 5_000;
    expect(lim.take('public_reply', 'a')).toBe(false); // cedo demais
    expect(lim.take('public_reply', 'b')).toBe(true); // outra conta não divide o teto
    for (let i = 1; i < LIMITS.public_reply; i += 1) { t += 21_000; expect(lim.take('public_reply', 'a')).toBe(true); }
    t += 21_000;
    expect(lim.take('public_reply', 'a')).toBe(false); // passou do teto da hora
    t += 3_600_000;
    expect(lim.take('public_reply', 'a')).toBe(true); // a hora virou
  });

  it('resposta pública nunca sai igual: chama pelo @ e escolhe entre as versões', () => {
    expect(varyPublicReply('Te mandei no direct! 💌', 'ana.souza', () => 0)).toBe('@ana.souza Te mandei no direct! 💌');
    expect(varyPublicReply('Olha o direct 😉 | Te chamei no direct!', 'joao', () => 0.9)).toBe('@joao Te chamei no direct!');
    expect(varyPublicReply('@ana já vai', 'ana', () => 0)).toBe('@ana já vai');
    expect(varyPublicReply('', 'ana')).toBe('');
  });
});
