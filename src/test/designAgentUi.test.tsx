import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DesignAgentBadge, { isDesignAgentWorking } from '@/components/designer/DesignAgentBadge';
import DesignFormatPicker from '@/components/designer/DesignFormatPicker';
import { dimensionsFromPreset } from '@/lib/designBrief';
import { isAgentDesignTask } from '@/hooks/useDesignTasks';

// Pulse Plus: o selo só aparece para quem tem o acesso (lista do servidor)
const PLUS = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/usePulsePlus', () => ({
  PULSE_PLUS_MODULE: 'pulse_plus',
  usePulsePlus: () => PLUS.value,
  usePulsePlusKnown: () => PLUS.value,
}));

const agents = [{ user_id: 'a1', name: 'Íris Designer' }];
const now = new Date().toISOString();
const old = new Date(Date.now() - 2 * 3600_000).toISOString();

describe('selo de agente no card de arte', () => {
  it('mostra "Criando" enquanto o agente dá sinal de vida', () => {
    render(<DesignAgentBadge task={{ kanban_column: 'executando', assigned_to: 'a1', agent_step: 'montando o layout', agent_heartbeat_at: now }} agents={agents} />);
    expect(screen.getByText(/Criando · Íris/)).toBeInTheDocument();
    expect(screen.getByText('montando o layout')).toBeInTheDocument();
  });

  it('mostra "Em correção" em Ajustes e "Parada" sem sinal há mais de 30 min', () => {
    const { rerender } = render(<DesignAgentBadge task={{ kanban_column: 'ajustes', assigned_to: 'a1', agent_step: 'corrigindo', agent_heartbeat_at: now }} agents={agents} />);
    expect(screen.getByText(/Em correção · Íris/)).toBeInTheDocument();
    rerender(<DesignAgentBadge task={{ kanban_column: 'ajustes', assigned_to: 'a1', agent_step: 'corrigindo', agent_heartbeat_at: old }} agents={agents} />);
    expect(screen.getByText(/Parada · Íris/)).toBeInTheDocument();
    expect(isDesignAgentWorking({ kanban_column: 'ajustes', assigned_to: 'a1', agent_step: 'x', agent_heartbeat_at: old })).toBe(false);
  });

  it('na Pré-análise mostra quem fez; sem agente não mostra nada', () => {
    const { container, rerender } = render(<DesignAgentBadge task={{ kanban_column: 'analise_ia', designed_by: 'a1' }} agents={agents} />);
    expect(screen.getByText('Pré-análise')).toBeInTheDocument();
    expect(screen.getByText(/feita por Íris/)).toBeInTheDocument();
    rerender(<DesignAgentBadge task={{ kanban_column: 'executando', assigned_to: 'humana' }} agents={agents} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('filtro "Com agente": feita por agente, com agente ou na Pré-análise', () => {
    const ids = new Set(['a1']);
    expect(isAgentDesignTask({ kanban_column: 'em_analise', designed_by: 'a1', assigned_to: null }, ids)).toBe(true);
    expect(isAgentDesignTask({ kanban_column: 'analise_ia', designed_by: null, assigned_to: null }, ids)).toBe(true);
    expect(isAgentDesignTask({ kanban_column: 'executando', designed_by: null, assigned_to: 'humana' }, ids)).toBe(false);
  });
});

describe('selo de agente sem Pulse Plus', () => {
  it('não aparece em nenhuma coluna', () => {
    PLUS.value = false;
    try {
      for (const task of [
        { kanban_column: 'executando', assigned_to: 'a1', agent_step: 'montando', agent_heartbeat_at: now },
        { kanban_column: 'ajustes', assigned_to: 'a1', agent_step: 'corrigindo', agent_heartbeat_at: old },
        { kanban_column: 'analise_ia', designed_by: 'a1' },
      ]) {
        const { container, unmount } = render(<DesignAgentBadge task={task} agents={agents} />);
        expect(container).toBeEmptyDOMElement();
        unmount();
      }
    } finally {
      PLUS.value = true;
    }
  });
});

describe('escolha de formato', () => {
  it('troca de preset e mostra a medida de impressão com sangria', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DesignFormatPicker value={dimensionsFromPreset('feed')} onChange={onChange} />);
    expect(screen.getByText('Feed · 1080×1350 px')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Panfleto A5/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: 'panfleto_a5', unit: 'mm', dpi: 300, bleed_mm: 3 }));
    rerender(<DesignFormatPicker value={dimensionsFromPreset('panfleto_a5')} onChange={onChange} />);
    expect(screen.getByText(/exportar 1819×2551 px com sangria/)).toBeInTheDocument();
  });

  it('personalizado sem medida pede largura e altura', () => {
    render(<DesignFormatPicker value={dimensionsFromPreset('personalizado')} onChange={() => {}} />);
    expect(screen.getByText(/Preencha largura e altura/)).toBeInTheDocument();
    expect(screen.getByText('Largura *')).toBeInTheDocument();
  });
});
