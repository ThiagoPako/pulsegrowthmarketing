-- Usuário de teste da Meta (meta@pulse.com) com acesso completo de admin.
-- Mantém também o cargo revisor_meta (módulo "Clientes de Teste" foi removido do app).
INSERT INTO user_roles (user_id, role)
SELECT u.id, 'admin'::app_role FROM auth_users u
WHERE lower(u.email) = 'meta@pulse.com'
  AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin');

SELECT u.email, r.role FROM auth_users u JOIN user_roles r ON r.user_id = u.id WHERE lower(u.email) = 'meta@pulse.com';
