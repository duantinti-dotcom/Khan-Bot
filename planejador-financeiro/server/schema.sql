-- Gerado pela concatenação de server/migrations/*.sql, em ordem. Para bancos existentes, aplique só as migrações novas.
-- Esquema isolado do planejador financeiro. Valores monetários em centavos (BIGINT).
-- Toda tabela de dados tem user_id, e as chaves estrangeiras compostas (user_id, id)
-- garantem no próprio banco que um registro só referencia dados do mesmo usuário.

CREATE SCHEMA IF NOT EXISTS fin;

CREATE TABLE IF NOT EXISTS fin.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (username_lower = lower(username))
);

CREATE TABLE IF NOT EXISTS fin.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON fin.sessions(user_id);

CREATE TABLE IF NOT EXISTS fin.recovery_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS recovery_user_idx ON fin.recovery_codes(user_id);

-- Tentativas de autenticação para limitar força bruta (por usuário e por IP).
CREATE TABLE IF NOT EXISTS fin.auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_key_idx ON fin.auth_attempts(key, at);

CREATE TABLE IF NOT EXISTS fin.profiles (
  user_id UUID PRIMARY KEY REFERENCES fin.users(id) ON DELETE CASCADE,
  display_name TEXT,
  birth_date DATE,
  onboarding_done BOOLEAN NOT NULL DEFAULT false,
  budget_mode TEXT NOT NULL DEFAULT 'proxima_renda' CHECK (budget_mode IN ('proxima_renda', 'fim_do_mes')),
  include_planned_contributions BOOLEAN NOT NULL DEFAULT true,
  has_variable_income BOOLEAN,                 -- NULL = não informado
  variable_income_estimate_cents BIGINT CHECK (variable_income_estimate_cents >= 0),
  risk_tolerance TEXT CHECK (risk_tolerance IN ('baixa', 'media', 'alta')),
  theme TEXT NOT NULL DEFAULT 'escuro' CHECK (theme IN ('escuro', 'claro', 'sistema')),
  sim_yield_annual NUMERIC(7,4),               -- premissas de simulação, editáveis
  sim_inflation_annual NUMERIC(7,4),
  created_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  kind TEXT NOT NULL CHECK (kind IN ('corrente', 'dinheiro', 'caixinha', 'poupanca', 'tesouro', 'cdb', 'outros')),
  institution TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('gastar', 'reservado', 'investido')),
  liquidity TEXT NOT NULL CHECK (liquidity IN ('imediata', 'curta', 'bloqueada')),
  maturity_date DATE,
  est_yield_note TEXT,
  initial_cents BIGINT NOT NULL DEFAULT 0,
  balance_known BOOLEAN NOT NULL DEFAULT true,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS fin.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  color TEXT NOT NULL DEFAULT '#22d3ee',
  icon TEXT,
  monthly_limit_cents BIGINT CHECK (monthly_limit_cents >= 0),
  essential BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  sort INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS fin.recurrences (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('receita', 'despesa')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  account_id UUID,
  category_id UUID,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 80),
  frequency TEXT NOT NULL CHECK (frequency IN ('semanal', 'quinzenal', 'mensal', 'anual')),
  day_of_month INT CHECK (day_of_month BETWEEN 1 AND 31),
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  is_main_income BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, account_id) REFERENCES fin.accounts(user_id, id) ON DELETE SET NULL (account_id),
  FOREIGN KEY (user_id, category_id) REFERENCES fin.categories(user_id, id) ON DELETE SET NULL (category_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS fin.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('receita', 'despesa', 'transferencia', 'ajuste', 'reembolso')),
  amount_cents BIGINT NOT NULL,
  date DATE NOT NULL,
  account_id UUID,
  to_account_id UUID,
  category_id UUID,
  description TEXT CHECK (length(description) <= 80),
  status TEXT NOT NULL CHECK (status IN ('realizado', 'previsto', 'cancelado')),
  recurrence_id UUID,
  occurrence_date DATE,
  installment_group UUID,
  installment_no INT,
  installment_total INT,
  refund_of UUID,
  note TEXT CHECK (length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, account_id) REFERENCES fin.accounts(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, to_account_id) REFERENCES fin.accounts(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, category_id) REFERENCES fin.categories(user_id, id) ON DELETE SET NULL (category_id),
  FOREIGN KEY (user_id, recurrence_id) REFERENCES fin.recurrences(user_id, id) ON DELETE SET NULL (recurrence_id),
  -- Uma ocorrência de recorrência só pode existir uma vez: impede duplicação.
  UNIQUE (recurrence_id, occurrence_date),
  CHECK (kind = 'ajuste' OR amount_cents > 0),
  CHECK (kind <> 'transferencia' OR (to_account_id IS NOT NULL AND to_account_id <> account_id)),
  CHECK (kind = 'transferencia' OR to_account_id IS NULL),
  CHECK (account_id IS NOT NULL OR status <> 'realizado')
);
CREATE INDEX IF NOT EXISTS tx_user_date_idx ON fin.transactions(user_id, date);

CREATE TABLE IF NOT EXISTS fin.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'meta' CHECK (kind IN ('meta', 'reserva')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  target_cents BIGINT NOT NULL CHECK (target_cents > 0),
  priority INT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  target_type TEXT NOT NULL CHECK (target_type IN ('idade', 'data')),
  target_age INT CHECK (target_age BETWEEN 1 AND 120),
  target_date DATE,
  real_terms BOOLEAN NOT NULL DEFAULT false,
  plan_amount_cents BIGINT CHECK (plan_amount_cents > 0),
  plan_frequency TEXT CHECK (plan_frequency IN ('semanal', 'quinzenal', 'mensal')),
  plan_day INT CHECK (plan_day BETWEEN 1 AND 31),
  place_account_id UUID,
  place_note TEXT,
  note TEXT,
  baseline_cents BIGINT NOT NULL DEFAULT 0,
  created_on DATE NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, place_account_id) REFERENCES fin.accounts(user_id, id) ON DELETE SET NULL (place_account_id),
  CHECK ((target_type = 'idade' AND target_age IS NOT NULL) OR (target_type = 'data' AND target_date IS NOT NULL))
);

-- Aportes e resgates: cada linha liga um valor a exatamente uma meta e uma conta.
CREATE TABLE IF NOT EXISTS fin.contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL,
  account_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'aporte' CHECK (source IN ('inicial', 'aporte', 'divisao', 'resgate', 'ajuste')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (user_id, goal_id) REFERENCES fin.goals(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, account_id) REFERENCES fin.accounts(user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS contrib_user_idx ON fin.contributions(user_id);

-- Nada deste esquema é exposto pela API pública do Supabase: só a função do servidor acessa.
ALTER TABLE fin.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.recurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin.contributions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA fin FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA fin FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA fin FROM anon, authenticated';
  END IF;
END $$;
-- Migração 002 (aditiva, não apaga nem altera dados existentes):
-- 1. Despesas/rendas recorrentes podem ser marcadas como valor estimado.
-- 2. Planos de distribuição do dinheiro ("Organizar meu dinheiro"). Um plano é só planejamento:
--    não desconta saldo nem conta como despesa.
ALTER TABLE fin.recurrences ADD COLUMN IF NOT EXISTS estimated BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS fin.budget_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  available_cents BIGINT NOT NULL,
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS budget_plans_user_idx ON fin.budget_plans(user_id, created_at DESC);
ALTER TABLE fin.budget_plans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON fin.budget_plans FROM anon, authenticated';
  END IF;
END $$;
