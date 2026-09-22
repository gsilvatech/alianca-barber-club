begin;

alter table public.appointments
  add column if not exists duration_applied integer;

alter table public.appointments disable trigger user;
update public.appointments as appointment
set duration_applied = service.duration
from public.services as service
where appointment.duration_applied is null
  and appointment.barber_id = service.barber_id
  and lower(trim(service.name)) = lower(trim(
    case
      when appointment.service like 'MANUAL:%' then split_part(appointment.service, ' - ', 2)
      when appointment.service like 'PLANO: %' then substring(appointment.service from 8)
      when appointment.service like 'Aquisição de Plano:%' then substring(appointment.service from 21)
      when appointment.service like 'ADMIN: %' then substring(appointment.service from 8)
      else appointment.service
    end
  ));

update public.appointments
set duration_applied = case when service like 'BLOQUEIO%' then 10 else 60 end
where duration_applied is null;

alter table public.appointments
  alter column duration_applied set default 60;

alter table public.appointments
  alter column duration_applied set not null;

alter table public.appointments
  drop constraint if exists appointments_duration_applied_positive;

alter table public.appointments
  add constraint appointments_duration_applied_positive
  check (duration_applied > 0);

create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  if exists (
    select 1
    from public.blocked_dates as block
    where block.barber_id = new.barber_id
      and block.date = new.date
  ) then
    raise exception 'O barbeiro não atende nesta data.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.barber_id::text || ':' || new.date::text, 0)
  );

  if exists (
    select 1
    from public.appointments as existing
    where existing.barber_id = new.barber_id
      and existing.date = new.date
      and existing.status = 'confirmed'
      and existing.id is distinct from new.id
      and new.time::time < existing.time::time + make_interval(mins => existing.duration_applied)
      and new.time::time + make_interval(mins => new.duration_applied) > existing.time::time
  ) then
    raise exception 'Este horário conflita com outro agendamento.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_appointment_overlap on public.appointments;

create trigger prevent_appointment_overlap
before insert or update of barber_id, date, time, status, duration_applied
on public.appointments
for each row
execute function public.prevent_appointment_overlap();

alter table public.appointments enable trigger user;

commit;
