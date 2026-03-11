import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '@/hooks/useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves data to localStorage on unmount', () => {
    const { unmount } = renderHook(() =>
      useAutoSave('test-key', { name: 'John' })
    );

    unmount();

    const saved = localStorage.getItem('autosave:test-key');
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved!);
    expect(parsed.data).toEqual({ name: 'John' });
  });

  it('clears saved data when clearSaved is called', () => {
    localStorage.setItem(
      'autosave:clear-test',
      JSON.stringify({ data: { x: 1 }, savedAt: Date.now() })
    );

    const { result } = renderHook(() =>
      useAutoSave('clear-test', { x: 2 })
    );

    act(() => {
      result.current.clearSaved();
    });

    expect(localStorage.getItem('autosave:clear-test')).toBeNull();
  });

  it('does not save when disabled', () => {
    const { unmount } = renderHook(() =>
      useAutoSave('disabled-test', { a: 1 }, { enabled: false })
    );

    unmount();

    expect(localStorage.getItem('autosave:disabled-test')).toBeNull();
  });
});
