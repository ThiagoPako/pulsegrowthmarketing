import { describe, expect, it } from 'vitest';
import { getClientStatus } from '@/components/social/ClientStatusBadge';

describe('Client status priority', () => {
  it('prioritizes overdue work even during onboarding', () => {
    expect(getClientStatus({ hasOverdue: true, isOnboarding: true })).toBe('atrasado');
    expect(getClientStatus({ hasOverdue: true, isOnboarding: false })).toBe('atrasado');
  });

  it('uses onboarding when there is no overdue work', () => {
    expect(getClientStatus({ hasOverdue: false, isOnboarding: true })).toBe('onboarding');
  });

  it('uses up to date when neither condition applies', () => {
    expect(getClientStatus({ hasOverdue: false, isOnboarding: false })).toBe('em_dia');
  });
});