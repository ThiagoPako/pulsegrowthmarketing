import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ErrorBoundary from '@/components/ErrorBoundary';
import React from 'react';

function ThrowingComponent(): React.ReactElement {
  throw new Error('Test error');
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
});
