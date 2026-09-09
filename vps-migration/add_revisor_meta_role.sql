-- Cargo "Revisor Meta": conta de avaliação usada pela equipe de revisão da Meta.
-- Acesso restrito no app a: Social, Conexões Sociais, Estúdio de Postagem e Portal.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'revisor_meta';
