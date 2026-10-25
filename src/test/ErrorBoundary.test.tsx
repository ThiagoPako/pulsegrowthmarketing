import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ErrorBoundary from '@/components/ErrorBoundary';
import React from 'react';

function ThrowingComponent(): React.ReactElement {
  throw new Error('Test error');
}

function StaleChunkComponent(): React.ReactElement {
  throw new TypeError('Failed to fetch dynamically imported module: https://agenciapulse.tech/assets/Old-abc123.js');
}

function WorkingComponent() {
  return <div>Working</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>
    );
    expect(getByText('Working')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    
    expect(getByText('Algo deu errado')).toBeInTheDocument();
    expect(getByText('Tentar novamente')).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  });

  it('shows the new version notice when a lazy chunk is gone after a deploy', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <StaleChunkComponent />
      </ErrorBoundary>
    );

    expect(getByText('Há uma versão nova do sistema')).toBeInTheDocument();
    expect(getByText('Atualizar agora')).toBeInTheDocument();
    expect(queryByText('Algo deu errado')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
