Supabase Beta Account Limit

Project: FreePoolLog4U Mini
Application version: 1.0.0-beta.5
Implemented/tested: 2026-08-14
Purpose: Temporary technical safeguard for the controlled external
beta test.

1. Purpose and scope

The external beta is initially planned for a maximum of 20 testers.
Because the app URL, QR code, or beta manual may be forwarded, Supabase
Auth registrations are additionally capped server-side.

Production limit: 30 currently existing accounts in auth.users.

This is not a product feature. It is a temporary beta safeguard and is
deliberately isolated from the application so it can later be changed or
removed easily.

The existing admin account counts toward the limit. Other developer/test
accounts would also count if present in auth.users.

Deleted Auth users automatically free a slot. The system does not count
historical registrations.

2. Environment at completion

Supabase plan: Free

Auth email delivery: Custom SMTP via Brevo (smtp-relay.brevo.com)

Auth users after testing/cleanup: 1 (Admin)

Production account limit: 30

Free slots after testing/cleanup: 29

Before User Created Auth Hook: enabled

GitHub/PWA application remains: FreePoolLog4U Mini 1.0.0-beta.5

No application deployment was required for this safeguard.

3. Architecture

Two server-side layers enforce the beta cap.

3.1 Before User Created Auth Hook

Supabase Authentication calls:

public.freepoollog4u_before_user_created(jsonb)

before creating a new Auth user.

If 30 accounts already exist, the hook rejects signup with:

Die aktuelle Beta-Testgruppe ist vollständig. Neue Registrierungen
sind derzeit nicht möglich.

The existing beta.5 frontend already displays this returned Auth error
correctly. No frontend modification was therefore deployed.

3.2 Hard database guard

A BEFORE INSERT trigger on auth.users calls:

public.freepoollog4u_enforce_beta_account_limit()

This is the authoritative second layer intended to prevent the account
count from exceeding the cap even when registrations occur concurrently.

The shared capacity function uses a PostgreSQL transaction-level
advisory lock before counting auth.users.

3.3 Database objects

Functions:

public.freepoollog4u_beta_account_limit_reached()

public.freepoollog4u_before_user_created(jsonb)

public.freepoollog4u_enforce_beta_account_limit()

Trigger on auth.users:

freepoollog4u_beta_account_limit_before_insert

Supabase Auth Hook:

Authentication → Hooks → Before User Created

Type: Postgres

Schema: public

Function: freepoollog4u_before_user_created

No user list or user count is exposed to the browser.

4. Production SQL

The following represents the intended production configuration with the
account limit set to 30.

-- FreePoolLog4U Mini 1.0.0-beta.5
-- Temporary server-side account cap for controlled external beta testing.
-- Limit: 30 currently existing rows in auth.users.

do $$
declare
  current_user_count bigint;
begin
  select count(*) into current_user_count from auth.users;
  if current_user_count > 30 then
    raise exception
      'FreePoolLog4U beta account limit cannot be installed: auth.users currently contains % users (limit 30).',
      current_user_count;
  end if;
end
$$;

create or replace function public.freepoollog4u_beta_account_limit_reached()
returns boolean
language plpgsql
as $$
declare
  current_user_count bigint;
begin
  perform pg_advisory_xact_lock(734310202608140030::bigint);

  select count(*)
    into current_user_count
    from auth.users;

  return current_user_count >= 30;
end;
$$;

create or replace function public.freepoollog4u_before_user_created(event jsonb)
returns jsonb
language plpgsql
as $$
begin
  if public.freepoollog4u_beta_account_limit_reached() then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',
        'Die aktuelle Beta-Testgruppe ist vollständig. Neue Registrierungen sind derzeit nicht möglich.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

create or replace function public.freepoollog4u_enforce_beta_account_limit()
returns trigger
language plpgsql
as $$
begin
  if public.freepoollog4u_beta_account_limit_reached() then
    raise exception using
      errcode = 'P0001',
      message = 'FREEPOOLLOG4U_BETA_ACCOUNT_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

drop trigger if exists freepoollog4u_beta_account_limit_before_insert
  on auth.users;

create trigger freepoollog4u_beta_account_limit_before_insert
before insert on auth.users
for each row
execute function public.freepoollog4u_enforce_beta_account_limit();

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.freepoollog4u_beta_account_limit_reached()
  to supabase_auth_admin;

grant execute
  on function public.freepoollog4u_before_user_created(jsonb)
  to supabase_auth_admin;

revoke execute
  on function public.freepoollog4u_beta_account_limit_reached()
  from public, anon, authenticated;

revoke execute
  on function public.freepoollog4u_before_user_created(jsonb)
  from public, anon, authenticated;

revoke execute
  on function public.freepoollog4u_enforce_beta_account_limit()
  from public, anon, authenticated;

5. Verification query

Use this query to check the current account count and whether the
production limit has been reached:

select
  count(*) as current_auth_users,
  public.freepoollog4u_beta_account_limit_reached() as limit_reached
from auth.users;

At completion on 2026-08-14 the expected/verified state after cleanup
was:

current_auth_users = 1

limit_reached = false

6. Tests performed

The limit was temporarily reduced to the number of existing accounts to
test the boundary without creating 30 real users.

Successfully verified:

Registration below the limit.

Email confirmation through Brevo.

Registration rejection when the simulated limit was reached.

Correct user-facing German error message.

Login of an existing user while the signup limit was reached.

Password reset of an existing user while the signup limit was
reached.

Administrative deletion of a test account.

Automatic freeing of a signup slot after deletion.

Successful registration after a slot became available.

Restoration of the production limit to 30.

Cleanup of the temporary test account, leaving only the Admin
account.

A true simultaneous/concurrent registration test was not performed.
The hard database trigger and advisory-lock mechanism were added
specifically to protect this case, but this concurrency scenario remains
unverified by a practical load/concurrency test.

7. Changing the account limit

The limit is centralized in:

public.freepoollog4u_beta_account_limit_reached()

To change the cap, replace the number in:

return current_user_count >= 30;

For example, a future cap of 100 would use:

return current_user_count >= 100;

After changing the value, verify it with the query in section 5.

8. Rollback / removing the beta safeguard

Removal should be performed in this order.

Step 1 -- Disable/remove the Auth Hook

In Supabase Dashboard:

Authentication → Hooks → Before User Created

Disable or delete the hook using:

public.freepoollog4u_before_user_created

Step 2 -- Remove the database objects

After the Auth Hook has been disabled/removed, run:

drop trigger if exists freepoollog4u_beta_account_limit_before_insert
  on auth.users;

drop function if exists public.freepoollog4u_enforce_beta_account_limit();

drop function if exists public.freepoollog4u_before_user_created(jsonb);

drop function if exists public.freepoollog4u_beta_account_limit_reached();

No GitHub/PWA change is required to remove the safeguard because the
production beta.5 frontend was not modified for it.

9. Operational notes

The account limit applies only to new Auth-user creation.

Existing users remain able to log in.

Password reset and password changes for existing users remain
available.

Email confirmation is not intended to consume an additional account
slot; the Auth user is created during signup.

Administrative deletion of an Auth user immediately reduces the
current account count.

The cap counts all rows currently present in auth.users, including
admin/developer/test accounts.

Do not expose auth.users, its count, or privileged Supabase
credentials to the client.

Do not remove the database trigger merely because the Auth Hook
appears sufficient; the trigger is the hard guard for concurrency.

Before making future Auth/database changes, remember that a failing
trigger on auth.users can prevent new signups.

10. Beta readiness status

As of 2026-08-14, FreePoolLog4U Mini 1.0.0-beta.5 is configured for:

maximum planned external beta group: 20 testers

hard technical account ceiling: 30 current Auth accounts

current starting state after testing: 1 Admin account

available account capacity: 29

The server-side registration safeguard was tested successfully except
for a practical simultaneous-registration concurrency test.
