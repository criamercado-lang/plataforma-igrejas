-- Fixa o search_path das funções auxiliares (alerta do Supabase Security Advisor).
alter function public.set_updated_at() set search_path = public;
alter function public.normalizar_telefone(text) set search_path = public;
alter function public.normalizar_nome(text) set search_path = public;
alter function public.hash_token(text) set search_path = public;
alter function public.novo_token() set search_path = public;
alter function public.check_same_church() set search_path = public;
alter function public._volunteer_json(public.volunteers) set search_path = public;
alter function public.uuid_ou_nulo(text) set search_path = public;
