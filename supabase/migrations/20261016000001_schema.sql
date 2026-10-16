-- =============================================================================
-- VÉRTICE AUTOMOTIVE — Schema principal
-- Lume Studio®
--
-- Modelo de instância única (uma oficina por projeto Supabase).
-- NÃO é multiempresa: para atender várias oficinas no mesmo banco seria
-- necessário adicionar `workshop_id` em todas as tabelas e políticas RLS
-- que isolem cada oficina. Veja o README (Personalizando para outra oficina).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema privado (não exposto pela API)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_secrets (
  key   text primary key,
  value text not null
);
revoke all on private.app_secrets from public, anon, authenticated;

-- Sal aleatório usado para anonimizar IPs no controle de abuso.
insert into private.app_secrets (key, value)
values ('ip_salt', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.quote_status as enum (
  'novo',
  'em_contato',
  'em_avaliacao',
  'aguardando_aprovacao',
  'aprovado',
  'em_execucao',
  'concluido',
  'cancelado'
);

create type public.contact_preference as enum ('whatsapp', 'ligacao');
create type public.day_period as enum ('manha', 'tarde');

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfis administrativos
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (char_length(full_name) <= 120),
  role       text not null default 'admin' check (role in ('admin')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Verdadeiro somente para usuários autenticados com perfil admin ativo.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.active
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.profiles enable row level security;

create policy "profiles: usuário lê o próprio perfil"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: admin atualiza o próprio nome"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_admin()))
  with check (id = (select auth.uid()));

-- Apenas o nome pode ser alterado pela API; papel e status só via SQL/servidor.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- -----------------------------------------------------------------------------
-- Configurações e conteúdo do site (linha única)
-- -----------------------------------------------------------------------------
create table public.site_settings (
  id         smallint primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

-- Conteúdo público do site: qualquer visitante pode ler.
-- Atenção: não guarde dados sigilosos nesta tabela.
create policy "site_settings: leitura pública"
  on public.site_settings for select to anon, authenticated
  using (true);

create policy "site_settings: admin atualiza"
  on public.site_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "site_settings: admin insere"
  on public.site_settings for insert to authenticated
  with check ((select public.is_admin()));

revoke insert, update, delete, truncate on public.site_settings from anon;

-- -----------------------------------------------------------------------------
-- Serviços
-- -----------------------------------------------------------------------------
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 600),
  category    text not null default 'Geral' check (char_length(category) between 1 and 60),
  icon        text not null default 'wrench' check (char_length(icon) between 1 and 40),
  price_cents integer check (price_cents is null or price_cents between 0 and 100000000),
  price_note  text check (price_note is null or char_length(price_note) <= 60),
  image_url   text check (image_url is null or char_length(image_url) <= 600),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index services_sort_idx on public.services (sort_order, name);

create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;

create policy "services: leitura pública dos ativos"
  on public.services for select to anon, authenticated
  using (is_active or (select public.is_admin()));

create policy "services: admin insere"
  on public.services for insert to authenticated
  with check ((select public.is_admin()));

create policy "services: admin atualiza"
  on public.services for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "services: admin exclui"
  on public.services for delete to authenticated
  using ((select public.is_admin()));

revoke insert, update, delete, truncate on public.services from anon;

-- -----------------------------------------------------------------------------
-- Clientes (privado)
-- -----------------------------------------------------------------------------
create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 2 and 120),
  phone            text not null check (char_length(phone) <= 30),
  phone_normalized text not null unique check (phone_normalized ~ '^[0-9]{10,13}$'),
  email            text check (email is null or char_length(email) <= 160),
  last_request_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy "customers: admin lê"
  on public.customers for select to authenticated
  using ((select public.is_admin()));

create policy "customers: admin atualiza"
  on public.customers for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "customers: admin exclui"
  on public.customers for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.customers from anon;
revoke insert on public.customers from authenticated;

-- -----------------------------------------------------------------------------
-- Solicitações de orçamento (privado)
-- -----------------------------------------------------------------------------
create table public.quote_requests (
  id                 uuid primary key default gen_random_uuid(),
  number             bigint generated always as identity unique,
  customer_id        uuid references public.customers (id) on delete set null,
  customer_name      text not null check (char_length(customer_name) between 2 and 120),
  phone              text not null check (char_length(phone) <= 30),
  phone_normalized   text not null check (phone_normalized ~ '^[0-9]{10,13}$'),
  vehicle_brand      text not null check (char_length(vehicle_brand) between 1 and 60),
  vehicle_model      text not null check (char_length(vehicle_model) between 1 and 80),
  vehicle_year       smallint check (vehicle_year is null or vehicle_year between 1900 and 2100),
  vehicle_mileage    integer check (vehicle_mileage is null or vehicle_mileage between 0 and 5000000),
  -- O serviço pode ser excluído depois; o nome fica preservado no histórico.
  service_id         uuid references public.services (id) on delete set null,
  service_name       text not null check (char_length(service_name) between 1 and 120),
  description        text not null check (char_length(description) between 10 and 2000),
  contact_preference public.contact_preference not null default 'whatsapp',
  preferred_date     date,
  preferred_period   public.day_period,
  photo_paths        text[] not null default '{}' check (cardinality(photo_paths) <= 5),
  status             public.quote_status not null default 'novo',
  ip_hash            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index quote_requests_created_idx on public.quote_requests (created_at desc);
create index quote_requests_status_idx on public.quote_requests (status);
create index quote_requests_customer_idx on public.quote_requests (customer_id);
create index quote_requests_phone_idx on public.quote_requests (phone_normalized, created_at desc);
create index quote_requests_ip_idx on public.quote_requests (ip_hash, created_at desc);

create trigger quote_requests_updated_at before update on public.quote_requests
  for each row execute function public.set_updated_at();

alter table public.quote_requests enable row level security;

create policy "quote_requests: admin lê"
  on public.quote_requests for select to authenticated
  using ((select public.is_admin()));

create policy "quote_requests: admin atualiza"
  on public.quote_requests for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "quote_requests: admin exclui"
  on public.quote_requests for delete to authenticated
  using ((select public.is_admin()));

-- Nenhum acesso direto para visitantes. Pedidos públicos entram somente pela
-- função submit_quote_request(), que valida os dados.
revoke all on public.quote_requests from anon;
revoke insert, update on public.quote_requests from authenticated;
-- O painel altera somente o status do pedido.
grant update (status) on public.quote_requests to authenticated;

-- Transições de status permitidas (espelhadas em src/lib/status.ts).
create or replace function public.quote_status_transition_allowed(
  from_status public.quote_status,
  to_status public.quote_status
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select from_status = to_status or case from_status
    when 'novo'                 then to_status in ('em_contato', 'em_avaliacao', 'cancelado')
    when 'em_contato'           then to_status in ('novo', 'em_avaliacao', 'aguardando_aprovacao', 'cancelado')
    when 'em_avaliacao'         then to_status in ('em_contato', 'aguardando_aprovacao', 'cancelado')
    when 'aguardando_aprovacao' then to_status in ('em_contato', 'em_avaliacao', 'aprovado', 'cancelado')
    when 'aprovado'             then to_status in ('aguardando_aprovacao', 'em_execucao', 'cancelado')
    when 'em_execucao'          then to_status in ('aprovado', 'concluido', 'cancelado')
    when 'concluido'            then to_status in ('em_execucao')
    when 'cancelado'            then to_status in ('novo', 'em_contato')
    else false
  end;
$$;

-- -----------------------------------------------------------------------------
-- Histórico de status (privado)
-- -----------------------------------------------------------------------------
create table public.quote_status_history (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.quote_requests (id) on delete cascade,
  from_status public.quote_status,
  to_status   public.quote_status not null,
  changed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index quote_status_history_request_idx on public.quote_status_history (request_id, created_at);

alter table public.quote_status_history enable row level security;

create policy "quote_status_history: admin lê"
  on public.quote_status_history for select to authenticated
  using ((select public.is_admin()));

revoke all on public.quote_status_history from anon;
revoke insert, update, delete, truncate on public.quote_status_history from authenticated;

create or replace function public.quote_requests_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.quote_status_history (request_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.quote_status_transition_allowed(old.status, new.status) then
      raise exception 'Transição de status não permitida: % → %', old.status, new.status
        using errcode = 'check_violation';
    end if;
    insert into public.quote_status_history (request_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function public.quote_requests_status_guard() from public, anon, authenticated;

create trigger quote_requests_status_insert after insert on public.quote_requests
  for each row execute function public.quote_requests_status_guard();

create trigger quote_requests_status_update before update of status on public.quote_requests
  for each row execute function public.quote_requests_status_guard();

-- -----------------------------------------------------------------------------
-- Observações internas (privado — nunca exibidas ao cliente)
-- -----------------------------------------------------------------------------
create table public.quote_notes (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.quote_requests (id) on delete cascade,
  author_id   uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text check (author_name is null or char_length(author_name) <= 120),
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index quote_notes_request_idx on public.quote_notes (request_id, created_at);

alter table public.quote_notes enable row level security;

create policy "quote_notes: admin lê"
  on public.quote_notes for select to authenticated
  using ((select public.is_admin()));

create policy "quote_notes: admin cria"
  on public.quote_notes for insert to authenticated
  with check ((select public.is_admin()) and author_id = (select auth.uid()));

create policy "quote_notes: admin exclui"
  on public.quote_notes for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.quote_notes from anon;
revoke update on public.quote_notes from authenticated;

-- -----------------------------------------------------------------------------
-- Galeria
-- -----------------------------------------------------------------------------
create table public.gallery_images (
  id           uuid primary key default gen_random_uuid(),
  image_url    text not null check (char_length(image_url) <= 600),
  storage_path text check (storage_path is null or char_length(storage_path) <= 300),
  caption      text check (caption is null or char_length(caption) <= 160),
  alt_text     text check (alt_text is null or char_length(alt_text) <= 200),
  category     text not null default 'oficina'
               check (category in ('oficina', 'servicos', 'detalhes', 'estrutura')),
  is_visible   boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index gallery_images_sort_idx on public.gallery_images (sort_order, created_at);

create trigger gallery_images_updated_at before update on public.gallery_images
  for each row execute function public.set_updated_at();

alter table public.gallery_images enable row level security;

create policy "gallery: leitura pública das visíveis"
  on public.gallery_images for select to anon, authenticated
  using (is_visible or (select public.is_admin()));

create policy "gallery: admin insere"
  on public.gallery_images for insert to authenticated
  with check ((select public.is_admin()));

create policy "gallery: admin atualiza"
  on public.gallery_images for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "gallery: admin exclui"
  on public.gallery_images for delete to authenticated
  using ((select public.is_admin()));

revoke insert, update, delete, truncate on public.gallery_images from anon;

-- -----------------------------------------------------------------------------
-- Avaliações
-- -----------------------------------------------------------------------------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(btrim(author_name)) between 2 and 80),
  rating      smallint not null check (rating between 1 and 5),
  comment     text not null check (char_length(btrim(comment)) between 2 and 1000),
  review_date date,
  source      text check (source is null or char_length(source) <= 60),
  -- Conteúdo de demonstração é sempre sinalizado como tal no site público.
  is_demo     boolean not null default false,
  is_visible  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

create policy "reviews: leitura pública das visíveis"
  on public.reviews for select to anon, authenticated
  using (is_visible or (select public.is_admin()));

create policy "reviews: admin insere"
  on public.reviews for insert to authenticated
  with check ((select public.is_admin()));

create policy "reviews: admin atualiza"
  on public.reviews for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "reviews: admin exclui"
  on public.reviews for delete to authenticated
  using ((select public.is_admin()));

revoke insert, update, delete, truncate on public.reviews from anon;

-- -----------------------------------------------------------------------------
-- Perguntas frequentes
-- -----------------------------------------------------------------------------
create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null check (char_length(btrim(question)) between 3 and 200),
  answer     text not null check (char_length(btrim(answer)) between 2 and 2000),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger faqs_updated_at before update on public.faqs
  for each row execute function public.set_updated_at();

alter table public.faqs enable row level security;

create policy "faqs: leitura pública das ativas"
  on public.faqs for select to anon, authenticated
  using (is_active or (select public.is_admin()));

create policy "faqs: admin insere"
  on public.faqs for insert to authenticated
  with check ((select public.is_admin()));

create policy "faqs: admin atualiza"
  on public.faqs for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "faqs: admin exclui"
  on public.faqs for delete to authenticated
  using ((select public.is_admin()));

revoke insert, update, delete, truncate on public.faqs from anon;

-- -----------------------------------------------------------------------------
-- Envio público de solicitação de orçamento
--
-- Único caminho pelo qual um visitante grava dados. Valida tudo no servidor,
-- aplica limites contra abuso e devolve apenas o número do pedido.
-- -----------------------------------------------------------------------------
create or replace function public.submit_quote_request(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name        text := btrim(coalesce(payload ->> 'customer_name', ''));
  v_phone       text := btrim(coalesce(payload ->> 'phone', ''));
  v_phone_norm  text;
  v_brand       text := btrim(coalesce(payload ->> 'vehicle_brand', ''));
  v_model       text := btrim(coalesce(payload ->> 'vehicle_model', ''));
  v_year_txt    text := nullif(btrim(coalesce(payload ->> 'vehicle_year', '')), '');
  v_km_txt      text := nullif(regexp_replace(coalesce(payload ->> 'vehicle_mileage', ''), '[^0-9]', '', 'g'), '');
  v_year        smallint;
  v_km          integer;
  v_service_txt text := nullif(btrim(coalesce(payload ->> 'service_id', '')), '');
  v_service_id  uuid;
  v_service     text;
  v_desc        text := btrim(coalesce(payload ->> 'description', ''));
  v_pref_txt    text := coalesce(nullif(payload ->> 'contact_preference', ''), 'whatsapp');
  v_date_txt    text := nullif(btrim(coalesce(payload ->> 'preferred_date', '')), '');
  v_date        date;
  v_period_txt  text := nullif(btrim(coalesce(payload ->> 'preferred_period', '')), '');
  v_photos      text[] := '{}'::text[];
  v_photo       text;
  v_headers     json;
  v_ip          text;
  v_ip_hash     text;
  v_customer_id uuid;
  v_request     public.quote_requests;
begin
  -- Campo armadilha contra robôs (deve chegar vazio).
  if coalesce(payload ->> 'website', '') <> '' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  v_phone_norm := regexp_replace(v_phone, '[^0-9]', '', 'g');
  if v_phone_norm !~ '^[0-9]{10,13}$' or char_length(v_phone) > 30 then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  -- Normaliza para o formato com DDI 55 quando vier só DDD + número.
  if char_length(v_phone_norm) in (10, 11) then
    v_phone_norm := '55' || v_phone_norm;
  end if;

  if char_length(v_brand) < 1 or char_length(v_brand) > 60 then
    raise exception 'invalid_vehicle_brand' using errcode = 'P0001';
  end if;
  if char_length(v_model) < 1 or char_length(v_model) > 80 then
    raise exception 'invalid_vehicle_model' using errcode = 'P0001';
  end if;

  if v_year_txt is not null then
    if v_year_txt !~ '^[0-9]{4}$' then
      raise exception 'invalid_vehicle_year' using errcode = 'P0001';
    end if;
    v_year := v_year_txt::smallint;
    if v_year < 1900 or v_year > extract(year from now())::int + 1 then
      raise exception 'invalid_vehicle_year' using errcode = 'P0001';
    end if;
  end if;

  if v_km_txt is not null then
    if char_length(v_km_txt) > 7 then
      raise exception 'invalid_vehicle_mileage' using errcode = 'P0001';
    end if;
    v_km := v_km_txt::integer;
  end if;

  if v_service_txt is not null then
    if v_service_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_service' using errcode = 'P0001';
    end if;
    select s.id, s.name into v_service_id, v_service
    from public.services s
    where s.id = v_service_txt::uuid and s.is_active;
    if v_service_id is null then
      raise exception 'invalid_service' using errcode = 'P0001';
    end if;
  else
    v_service := 'Não sei informar / preciso de diagnóstico';
  end if;

  if char_length(v_desc) < 10 or char_length(v_desc) > 2000 then
    raise exception 'invalid_description' using errcode = 'P0001';
  end if;

  if v_pref_txt not in ('whatsapp', 'ligacao') then
    raise exception 'invalid_contact_preference' using errcode = 'P0001';
  end if;

  if v_date_txt is not null then
    begin
      v_date := v_date_txt::date;
    exception when others then
      raise exception 'invalid_preferred_date' using errcode = 'P0001';
    end;
    if v_date < current_date or v_date > current_date + 180 then
      raise exception 'invalid_preferred_date' using errcode = 'P0001';
    end if;
  end if;

  if v_period_txt is not null and v_period_txt not in ('manha', 'tarde') then
    raise exception 'invalid_preferred_period' using errcode = 'P0001';
  end if;

  -- Fotos: somente caminhos já enviados ao bucket privado, na pasta pending/.
  if payload ? 'photo_paths' and jsonb_typeof(payload -> 'photo_paths') = 'array' then
    if jsonb_array_length(payload -> 'photo_paths') > 5 then
      raise exception 'too_many_photos' using errcode = 'P0001';
    end if;
    for v_photo in select jsonb_array_elements_text(payload -> 'photo_paths') loop
      if v_photo !~ '^pending/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' then
        raise exception 'invalid_photo' using errcode = 'P0001';
      end if;
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'quote-photos' and o.name = v_photo
      ) then
        raise exception 'invalid_photo' using errcode = 'P0001';
      end if;
      v_photos := array_append(v_photos, v_photo);
    end loop;
  end if;

  -- Controle de abuso -------------------------------------------------------
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(
    v_headers ->> 'cf-connecting-ip',
    split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
    v_headers ->> 'x-real-ip'
  );
  v_ip := nullif(btrim(v_ip), '');
  if v_ip is not null then
    select encode(extensions.digest(v_ip || s.value, 'sha256'), 'hex')
      into v_ip_hash
    from private.app_secrets s where s.key = 'ip_salt';
  end if;

  if (
    select count(*) from public.quote_requests q
    where q.phone_normalized = v_phone_norm
      and q.created_at > now() - interval '30 minutes'
  ) >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if v_ip_hash is not null and (
    select count(*) from public.quote_requests q
    where q.ip_hash = v_ip_hash
      and q.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.quote_requests q
    where q.created_at > now() - interval '10 minutes'
  ) >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Cliente: um registro por telefone ---------------------------------------
  insert into public.customers as c (name, phone, phone_normalized, last_request_at)
  values (v_name, v_phone, v_phone_norm, now())
  on conflict (phone_normalized) do update
    set name = excluded.name,
        phone = excluded.phone,
        last_request_at = now()
  returning c.id into v_customer_id;

  insert into public.quote_requests (
    customer_id, customer_name, phone, phone_normalized,
    vehicle_brand, vehicle_model, vehicle_year, vehicle_mileage,
    service_id, service_name, description, contact_preference,
    preferred_date, preferred_period, photo_paths, ip_hash
  ) values (
    v_customer_id, v_name, v_phone, v_phone_norm,
    v_brand, v_model, v_year, v_km,
    v_service_id, v_service, v_desc, v_pref_txt::public.contact_preference,
    v_date, v_period_txt::public.day_period, v_photos, v_ip_hash
  )
  returning * into v_request;

  return jsonb_build_object('id', v_request.id, 'number', v_request.number);
end;
$$;

revoke execute on function public.submit_quote_request(jsonb) from public;
grant execute on function public.submit_quote_request(jsonb) to anon, authenticated;

-- Funções internas não devem ser chamadas pela API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.quote_status_transition_allowed(public.quote_status, public.quote_status) from public, anon;
grant execute on function public.quote_status_transition_allowed(public.quote_status, public.quote_status) to authenticated;

-- -----------------------------------------------------------------------------
-- Indicadores do painel (calculados no banco a partir dos registros reais)
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats(days integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(days, 30), 7), 365);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total',        (select count(*) from public.quote_requests),
    'by_status',    coalesce((
                      select jsonb_object_agg(status, n)
                      from (select status, count(*) n from public.quote_requests group by status) s
                    ), '{}'::jsonb),
    'approved_ever', (
                      select count(distinct h.request_id)
                      from public.quote_status_history h where h.to_status = 'aprovado'
                    ),
    'top_services', coalesce((
                      select jsonb_agg(jsonb_build_object('name', service_name, 'count', n) order by n desc)
                      from (
                        select service_name, count(*) n from public.quote_requests
                        group by service_name order by n desc limit 6
                      ) t
                    ), '[]'::jsonb),
    'per_day',      coalesce((
                      select jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c.n, 0)) order by d)
                      from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d
                      left join (
                        select (created_at at time zone 'America/Sao_Paulo')::date dia, count(*) n
                        from public.quote_requests
                        where (created_at at time zone 'America/Sao_Paulo')::date > v_today - v_days
                        group by 1
                      ) c on c.dia = d::date
                    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_dashboard_stats(integer) from public, anon;
grant execute on function public.admin_dashboard_stats(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------
-- media: imagens públicas do site (galeria, logotipo, fotos institucionais).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- quote-photos: fotos enviadas por clientes (privado).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-photos', 'quote-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "media: admin lê"
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admin envia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admin atualiza"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()))
  with check (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admin exclui"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

-- Visitantes podem apenas ENVIAR fotos para pending/<uuid>/arquivo.
-- Não podem listar, ler, substituir ou apagar nada.
create policy "quote-photos: visitante envia"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'quote-photos'
    and (storage.foldername(name))[1] = 'pending'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  );

create policy "quote-photos: admin lê"
  on storage.objects for select to authenticated
  using (bucket_id = 'quote-photos' and (select public.is_admin()));

create policy "quote-photos: admin exclui"
  on storage.objects for delete to authenticated
  using (bucket_id = 'quote-photos' and (select public.is_admin()));
