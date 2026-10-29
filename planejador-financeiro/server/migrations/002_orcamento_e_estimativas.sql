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
