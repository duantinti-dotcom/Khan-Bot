-- Migração 003 (aditiva):
-- 1. Estimativas informadas pela pessoa por categoria (ex.: "3 viagens × R$ 18"), usadas quando há pouco histórico.
-- 2. Estilo de divisão preferido (equilibrado, mais para viver, guardar mais).
-- 3. Novo visual: o tema padrão passa a ser o claro (marfim). Quem estava no padrão escuro passa ao novo padrão;
--    o tema escuro continua disponível em "Meus dados".
ALTER TABLE fin.categories ADD COLUMN IF NOT EXISTS estimate_weekly_cents BIGINT CHECK (estimate_weekly_cents >= 0);
ALTER TABLE fin.categories ADD COLUMN IF NOT EXISTS estimate_note TEXT CHECK (length(estimate_note) <= 80);
ALTER TABLE fin.profiles ADD COLUMN IF NOT EXISTS budget_style TEXT NOT NULL DEFAULT 'equilibrado'
  CHECK (budget_style IN ('equilibrado', 'lazer', 'guardar'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                 WHERE d.adrelid = 'fin.profiles'::regclass AND a.attname = 'theme' AND pg_get_expr(d.adbin, d.adrelid) LIKE '%claro%') THEN
    ALTER TABLE fin.profiles ALTER COLUMN theme SET DEFAULT 'claro';
    UPDATE fin.profiles SET theme = 'claro' WHERE theme = 'escuro';
  END IF;
END $$;
