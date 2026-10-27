-- Fase 1 · Logo da igreja (único arquivo enviado para a plataforma).
-- Artes, fotos e vídeos NÃO ficam aqui: as tarefas guardam só links (Canva, Drive, Instagram).
-- Bucket público "logos", uma pasta por igreja: logos/{church_id}/logo.png
-- Só admin e líder da igreja enviam ou trocam o logo.

create or replace function public.uuid_ou_nulo(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

revoke execute on function public.uuid_ou_nulo(text) from public, anon;
grant execute on function public.uuid_ou_nulo(text) to authenticated;

do $$
begin
  -- No Supabase o schema storage existe; no Postgres de teste local, não.
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'schema storage ausente: bucket de logos não criado (ambiente de teste)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy logos_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'logos'
      and public.is_gestor(public.uuid_ou_nulo((storage.foldername(name))[1]))
    )
  $p$;
  execute $p$
    create policy logos_update on storage.objects for update to authenticated
    using (
      bucket_id = 'logos'
      and public.is_gestor(public.uuid_ou_nulo((storage.foldername(name))[1]))
    )
  $p$;
  execute $p$
    create policy logos_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'logos'
      and public.is_gestor(public.uuid_ou_nulo((storage.foldername(name))[1]))
    )
  $p$;
end $$;
