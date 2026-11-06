-- Ejecutar este archivo completo en Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text not null default '',
  last_name text not null default '',
  id_number text,
  phone text,
  avatar_url text,
  role text not null default 'jugador' check (role in ('jugador','administracion')),
  suspended boolean not null default false,
  points_balance bigint not null default 0,
  ranking_points bigint not null default 0,
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  referrals_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;

create table if not exists public.prizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  icon text not null default '🎁',
  points_cost integer not null check (points_cost > 0),
  stock integer not null default -1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.redemption_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  active boolean not null default true,
  used boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists redemption_codes_active_code_idx on public.redemption_codes(code) where active and not used;

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  prize_id uuid references public.prizes(id) on delete set null,
  code_id uuid references public.redemption_codes(id),
  points_spent integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid unique not null references public.profiles(id) on delete cascade,
  rewarded boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 5000),
  duration_seconds integer not null check (duration_seconds between 0 and 3600),
  created_at timestamptz not null default now()
);

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  ip_address inet,
  created_at timestamptz not null default now()
);

create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  ip_address inet not null,
  accounts_count integer not null,
  details text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists (select 1 from public.profiles where id=auth.uid() and role='administracion' and not suspended); $$;

create or replace function public.generate_referral_code()
returns text language plpgsql
as $$
declare result text;
begin
  loop
    result := upper('DELI'||substr(replace(gen_random_uuid()::text,'-',''),1,4));
    if not exists (select 1 from public.profiles where referral_code=result) then return result; end if;
  end loop;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
  code text := upper(trim(coalesce(metadata->>'referral_code','')));
  referrer_id uuid;
  profile_id uuid := new.id;
begin
  insert into public.profiles(id,email,first_name,last_name,id_number,phone,referral_code)
  values(profile_id,new.email,
    trim(coalesce(metadata->>'first_name','')),
    trim(coalesce(metadata->>'last_name','')),
    trim(coalesce(metadata->>'id_number','')),
    trim(coalesce(metadata->>'phone','')),
    public.generate_referral_code());

  if code <> '' then
    select id into referrer_id from public.profiles where upper(referral_code)=code and id<>profile_id;
    if referrer_id is not null then
      update public.profiles set referred_by=referrer_id where id=profile_id;
      insert into public.referrals(referrer_id,referred_id) values(referrer_id,profile_id);
      update public.profiles set points_balance=points_balance+100 where id=referrer_id;
      update public.profiles set points_balance=points_balance+100 where id=profile_id;
      update public.profiles set referrals_count=referrals_count+1 where id=referrer_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.record_login()
returns void language plpgsql security definer set search_path=public
as $$
declare ip inet := inet_client_addr(); count_accounts integer; alert_exists boolean;
begin
  insert into public.login_events(profile_id,ip_address) values(auth.uid(),ip);
  select count(distinct profile_id) into count_accounts
  from public.login_events where ip_address=ip and created_at > now()-interval '30 days';
  if ip is not null and count_accounts >= 7 then
    select exists(select 1 from public.security_alerts where ip_address=ip and not resolved) into alert_exists;
    if not alert_exists then
      insert into public.security_alerts(ip_address,accounts_count,details)
      values(ip,count_accounts,'Varias cuentas iniciaron sesión desde esta dirección IP.');
    end if;
  end if;
end;
$$;

create or replace function public.submit_game_score(p_score integer,p_duration_seconds integer)
returns void language plpgsql security definer set search_path=public
as $$
declare award integer; profile_suspended boolean;
begin
  select suspended into profile_suspended from public.profiles where id=auth.uid();
  if profile_suspended then raise exception 'Tu perfil está suspendido'; end if;
  if p_score < 0 or p_score > 5000 or p_duration_seconds < 1 or p_duration_seconds > 3600 then
    raise exception 'Datos de partida inválidos';
  end if;
  if p_duration_seconds * 8 < p_score then raise exception 'Puntuación fuera de rango'; end if;
  award := least(p_score,5000);
  insert into public.game_runs(profile_id,score,duration_seconds) values(auth.uid(),award,p_duration_seconds);
  update public.profiles set points_balance=points_balance+award, ranking_points=ranking_points+award where id=auth.uid();
end;
$$;

create or replace function public.create_redemption_code(p_profile_id uuid)
returns text language plpgsql security definer set search_path=public
as $$
declare generated text;
begin
  if not public.is_admin() then raise exception 'Solo administración puede crear códigos'; end if;
  loop
    generated := lpad(floor(random()*1000000)::text,6,'0');
    exit when not exists (select 1 from public.redemption_codes where code=generated and active and not used);
  end loop;
  insert into public.redemption_codes(profile_id,code,created_by) values(p_profile_id,generated,auth.uid());
  return generated;
end;
$$;

create or replace function public.redeem_prize(p_prize_id uuid,p_code text)
returns void language plpgsql security definer set search_path=public
as $$
declare prize_row public.prizes%rowtype; code_row public.redemption_codes%rowtype; profile_row public.profiles%rowtype;
begin
  select * into profile_row from public.profiles where id=auth.uid();
  if profile_row.suspended then raise exception 'Tu perfil está suspendido'; end if;
  if profile_row.avatar_url is null or btrim(profile_row.avatar_url)='' then raise exception 'Debes subir una foto de perfil para redimir'; end if;
  select * into prize_row from public.prizes where id=p_prize_id and active;
  if not found then raise exception 'Premio no disponible'; end if;
  if profile_row.points_balance < 2000 or profile_row.points_balance < prize_row.points_cost then raise exception 'Saldo insuficiente'; end if;
  select * into code_row from public.redemption_codes where profile_id=auth.uid() and code=p_code and active and not used;
  if not found then raise exception 'Código inválido o no asignado a tu perfil'; end if;
  if prize_row.stock=0 then raise exception 'Premio agotado'; end if;
  update public.profiles set points_balance=points_balance-prize_row.points_cost where id=auth.uid();
  update public.redemption_codes set used=true,active=false where id=code_row.id;
  if prize_row.stock>0 then update public.prizes set stock=stock-1 where id=prize_row.id; end if;
  insert into public.redemptions(profile_id,prize_id,code_id,points_spent) values(auth.uid(),prize_row.id,code_row.id,prize_row.points_cost);
end;
$$;

create or replace function public.reset_ranking()
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Solo administración puede reiniciar el ranking'; end if;
  update public.profiles set ranking_points=0;
end;
$$;

alter table public.profiles enable row level security;
alter table public.prizes enable row level security;
alter table public.redemption_codes enable row level security;
alter table public.redemptions enable row level security;
alter table public.referrals enable row level security;
alter table public.game_runs enable row level security;
alter table public.login_events enable row level security;
alter table public.security_alerts enable row level security;

drop policy if exists profiles_read_own on public.profiles; create policy profiles_read_own on public.profiles for select using(auth.uid()=id or public.is_admin());
drop policy if exists profiles_read_ranking on public.profiles; create policy profiles_read_ranking on public.profiles for select using(auth.uid() is not null);
drop policy if exists profiles_update_own_avatar on public.profiles; create policy profiles_update_own_avatar on public.profiles for update using(auth.uid()=id) with check(auth.uid()=id);
drop policy if exists profiles_admin_update on public.profiles; create policy profiles_admin_update on public.profiles for update using(public.is_admin()) with check(public.is_admin());
drop policy if exists prizes_read on public.prizes; create policy prizes_read on public.prizes for select using(active or public.is_admin());
drop policy if exists prizes_admin on public.prizes; create policy prizes_admin on public.prizes for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists codes_own on public.redemption_codes; create policy codes_own on public.redemption_codes for select using(auth.uid()=profile_id or public.is_admin());
drop policy if exists codes_admin on public.redemption_codes; create policy codes_admin on public.redemption_codes for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists redemptions_own_admin on public.redemptions; create policy redemptions_own_admin on public.redemptions for select using(auth.uid()=profile_id or public.is_admin());
drop policy if exists refs_admin on public.referrals; create policy refs_admin on public.referrals for select using(public.is_admin() or auth.uid()=referred_id or auth.uid()=referrer_id);
drop policy if exists runs_own_admin on public.game_runs; create policy runs_own_admin on public.game_runs for select using(auth.uid()=profile_id or public.is_admin());
drop policy if exists alerts_admin on public.security_alerts; create policy alerts_admin on public.security_alerts for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists login_admin on public.login_events; create policy login_admin on public.login_events for select using(public.is_admin());

insert into storage.buckets(id,name,public) values('avatars','avatars',true) on conflict(id) do update set public=true;
drop policy if exists avatars_upload_own on storage.objects;
create policy avatars_upload_own on storage.objects for insert to authenticated with check(bucket_id='avatars');
drop policy if exists avatars_read on storage.objects; create policy avatars_read on storage.objects for select using(bucket_id='avatars');

-- Ranking público mínimo:
grant select(first_name,last_name,avatar_url,ranking_points,suspended) on public.profiles to authenticated;

create or replace function public.protect_profile_sensitive_fields()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() and auth.uid()=old.id then
    new.points_balance := old.points_balance;
    new.ranking_points := old.ranking_points;
    new.referrals_count := old.referrals_count;
    new.referral_code := old.referral_code;
    new.referred_by := old.referred_by;
    new.role := old.role;
    new.suspended := old.suspended;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_sensitive_fields on public.profiles;
create trigger protect_profile_sensitive_fields before update on public.profiles
for each row execute function public.protect_profile_sensitive_fields();
