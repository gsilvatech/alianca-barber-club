begin;

create or replace function public.can_manage_inventory()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'barber', 'barbers')
  );
$$;

revoke all on function public.can_manage_inventory() from public;
grant execute on function public.can_manage_inventory() to authenticated;

create or replace function public.prevent_client_role_change()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if new.role is distinct from old.role
    and auth.role() is distinct from 'service_role' then
    raise exception 'Apenas o servidor pode alterar funções de usuários.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_client_role_change on public.profiles;

create trigger prevent_client_role_change
before update of role on public.profiles
for each row
execute function public.prevent_client_role_change();

alter table public.products enable row level security;

revoke all on table public.products from anon;
grant select, insert, update, delete on table public.products to authenticated;

do $$
declare
  existing_policy text;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
  loop
    execute format('drop policy if exists %I on public.products', existing_policy);
  end loop;
end;
$$;

create policy "inventory read by staff"
on public.products
for select
to authenticated
using ((select public.can_manage_inventory()));

create policy "inventory insert by staff"
on public.products
for insert
to authenticated
with check ((select public.can_manage_inventory()));

create policy "inventory update by staff"
on public.products
for update
to authenticated
using ((select public.can_manage_inventory()))
with check ((select public.can_manage_inventory()));

create policy "inventory delete by staff"
on public.products
for delete
to authenticated
using ((select public.can_manage_inventory()));

create or replace function public.set_product_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_product_audit_fields on public.products;

create trigger set_product_audit_fields
before insert or update on public.products
for each row
execute function public.set_product_audit_fields();

commit;
