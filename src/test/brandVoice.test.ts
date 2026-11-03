import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { VOZ_DA_MARCA } from '../../vps-api-server/lib/brandVoice.mjs';
import { VICTORIA_SYSTEM } from '../../vps-api-server/lib/victoria.mjs';

describe('legenda na voz da empresa', () => {
  it('pede primeira pessoa e proíbe narrar o vídeo de fora', () => {
    expect(VOZ_DA_MARCA).toMatch(/primeira pessoa do plural/);
    expect(VOZ_DA_MARCA).toMatch(/no vídeo/);
  });

  it('entra na legenda da Victoria', () => {
    expect(VICTORIA_SYSTEM).toContain(VOZ_DA_MARCA);
  });

  it('entra no system da legenda do post', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'vps-api-server/lib/postCaption.mjs'), 'utf8');
    expect(src).toContain('- ${VOZ_DA_MARCA}');
  });
});

describe('resposta a comentário na voz da empresa', () => {
  it('entra no system da Ísis nos comentários', async () => {
    const { VOZ_DA_MARCA_COMENTARIO } = await import('../../vps-api-server/lib/brandVoice.mjs');
    expect(VOZ_DA_MARCA_COMENTARIO).toMatch(/você É a empresa/);
    const src = fs.readFileSync(path.resolve(process.cwd(), 'vps-api-server/lib/socialHub.mjs'), 'utf8');
    expect(src).toContain('- ${VOZ_DA_MARCA_COMENTARIO}');
  });
});
