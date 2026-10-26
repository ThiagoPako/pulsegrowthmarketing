import type { User, UserRole } from '@/types';

/**
 * Funções do colaborador: a principal e as adicionais (user_roles), sem repetir.
 * Um usuário pode ter várias (ex.: videomaker + editor); olhar só `role` (a principal)
 * tirava a pessoa dos rankings da outra função.
 */
export function userRoleList(user: Pick<User, 'role' | 'roles'> | null | undefined): UserRole[] {
  if (!user) return [];
  const list = user.roles?.length ? user.roles : [user.role];
  return Array.from(new Set(list.filter(Boolean)));
}

/** Tem alguma destas funções (principal ou adicional), como o EditingControl já fazia. */
export function userHasRole(user: Pick<User, 'role' | 'roles'> | null | undefined, ...roles: UserRole[]): boolean {
  const list = userRoleList(user);
  return roles.some(role => list.includes(role));
}
