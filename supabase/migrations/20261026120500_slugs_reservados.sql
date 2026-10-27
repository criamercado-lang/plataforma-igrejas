-- Fase 1 · Endereços usados pelo próprio app não podem virar endereço de igreja
-- (senão /app, /api ou /convite abririam a página pública de uma igreja).
alter table public.churches
  add constraint churches_slug_reservado
  check (slug not in ('app', 'api', 'convite', 'assets', 'entrar', 'plataforma', 'admin', 'login', 'static'));
