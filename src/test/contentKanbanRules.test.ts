import { describe, expect, it } from 'vitest';
import type { Profile } from '@/hooks/useAuth';
import {
  canReleaseAnalysis,
  editingControlMoveError,
  isContentManager,
  missingFootageForEditing,
} from '@/lib/contentKanbanRules';

const p = (role: string, roles?: string[]) => ({ id: 'u1', name: 'X', role, roles } as unknown as Profile);

describe('decisões do dono para o Kanban de vídeo', () => {
  it('gestão = admin, social media e gestor de projetos (também como papel adicional)', () => {
    expect(isContentManager(p('admin'))).toBe(true);
    expect(isContentManager(p('social_media'))).toBe(true);
    expect(isContentManager(p('gestor_projetos'))).toBe(true);
    expect(isContentManager(p('editor'))).toBe(false);
    expect(isContentManager(p('videomaker'))).toBe(false);
    expect(isContentManager(p('copywriter'))).toBe(false);
    expect(isContentManager(p('editor', ['editor', 'gestor_projetos']))).toBe(true);
    expect(isContentManager(null)).toBe(false);
  });

  it('liberar ou devolver da Análise: admin e social media (gestor não)', () => {
    expect(canReleaseAnalysis(p('admin'))).toBe(true);
    expect(canReleaseAnalysis(p('social_media'))).toBe(true);
    expect(canReleaseAnalysis(p('gestor_projetos'))).toBe(false);
    expect(canReleaseAnalysis(p('editor'))).toBe(false);
  });

  it('para entrar em Edição só os brutos importam', () => {
    expect(missingFootageForEditing({ drive_link: null })).toBe(true);
    expect(missingFootageForEditing({ drive_link: '   ' })).toBe(true);
    expect(missingFootageForEditing({ drive_link: 'https://drive.google.com/x' })).toBe(false);
  });

  it('Controle de Edição: editor mexe só nos próprios cards e pega da fila para si', () => {
    const base = { isManager: false, ownsCard: false, cardIsFree: false, target: '__queue__', targetIsSelf: false };
    expect(editingControlMoveError({ ...base, isManager: true })).toBeNull();
    expect(editingControlMoveError(base)).toMatch(/outro editor/);
    expect(editingControlMoveError({ ...base, ownsCard: true })).toBeNull(); // devolver o próprio à fila
    expect(editingControlMoveError({ ...base, ownsCard: true, target: 'colega' })).toMatch(/gestão/);
    expect(editingControlMoveError({ ...base, cardIsFree: true, target: 'eu', targetIsSelf: true })).toBeNull();
    expect(editingControlMoveError({ ...base, cardIsFree: true, target: 'colega' })).toMatch(/gestão/);
  });
});
