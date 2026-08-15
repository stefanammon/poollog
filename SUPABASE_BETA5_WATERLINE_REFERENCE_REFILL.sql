-- FreePoolLog4U Mini 1.0.0-beta.5
-- Notwendige Post-Freeze-Ergaenzungen 2026-08-15:
-- 1) einmalige, unveraenderliche Wasserlinien-0-Referenz je Pool
-- 2) Wasserfuellung: Wasserlinie vor Auffuellen + optional zugefuehrte Wassermenge
--
-- Vor dem Deployment des zugehoerigen Frontends einmalig im Supabase SQL Editor ausfuehren.

begin;

alter table public.pools
  add column if not exists waterline_reference_confirmed_at timestamptz null;

comment on column public.pools.waterline_reference_confirmed_at is
  'Zeitpunkt der einmaligen Bestaetigung der festen Wasserlinien-0-Referenz in FreePoolLog4U Mini. Dies ist der Bestaetigungszeitpunkt, nicht zwingend der Beginn historischer Messungen. Nach erstmaligem Setzen unveraenderlich.';

alter table public.events
  add column if not exists waterline_before_mm numeric null,
  add column if not exists water_added_volume_l numeric null;

comment on column public.events.waterline_before_mm is
  'Bei Aktion Wasserfuellung: Wasserlinie unmittelbar vor dem Auffuellen, relativ zur festen 0-Marke, in mm.';

comment on column public.events.water_added_volume_l is
  'Bei Aktion Wasserfuellung: optional dokumentierte zugefuehrte Wassermenge in Litern; darf auch eine Schaetzung des Benutzers sein.';

alter table public.events
  drop constraint if exists events_water_added_volume_l_positive;

alter table public.events
  add constraint events_water_added_volume_l_positive
  check (water_added_volume_l is null or water_added_volume_l > 0);

create or replace function public.freepoollog4u_keep_waterline_reference_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.waterline_reference_confirmed_at is not null
     and new.waterline_reference_confirmed_at is distinct from old.waterline_reference_confirmed_at then
    raise exception using
      errcode = 'P0001',
      message = 'FREEPOOLLOG4U_WATERLINE_REFERENCE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists freepoollog4u_waterline_reference_immutable
  on public.pools;

create trigger freepoollog4u_waterline_reference_immutable
before update of waterline_reference_confirmed_at on public.pools
for each row
execute function public.freepoollog4u_keep_waterline_reference_immutable();

revoke execute on function public.freepoollog4u_keep_waterline_reference_immutable()
  from public, anon, authenticated;

-- Die vorhandenen RLS-Policies fuer pools/events bleiben wirksam.
-- Es werden keine neuen Tabellen und keine neuen Grants benoetigt.

commit;
