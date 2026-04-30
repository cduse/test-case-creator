-- ========================================
-- MIGRATION 051: FEATURE KEY FLOW STEPS
-- ========================================
-- Description: Persist feature key-flow steps in Supabase so they survive
--              app reinstalls. Also ensures mobile-app users (authenticated,
--              anon-key JWT) can UPDATE features in their organisation.
-- Date: April 26, 2026
-- Changes:
--   1. Add key_flow_steps JSONB column to features table
--   2. Add RLS UPDATE policy so authenticated users can soft-delete / edit
--      features that belong to their organisation
-- ========================================


-- ========================================
-- 1. ADD key_flow_steps COLUMN
-- ========================================

ALTER TABLE features
  ADD COLUMN IF NOT EXISTS key_flow_steps JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN features.key_flow_steps IS
  'Array of plain-string key flow steps entered in the mobile app. '
  'Added in migration 051.';


-- ========================================
-- 2. RLS UPDATE POLICY FOR FEATURES
-- ========================================
-- The web app writes features via an Edge Function that uses the service-role
-- key (bypasses RLS). The mobile app writes directly with the user JWT (anon
-- key + auth), so it needs an explicit RLS UPDATE policy.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'features'
      AND policyname  = 'mobile_authenticated_update_own_org_features'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY mobile_authenticated_update_own_org_features
      ON features
      FOR UPDATE
      TO authenticated
      USING (
        organization_id = (
          SELECT organization_id FROM users WHERE id = auth.uid()::text
        )
      )
      WITH CHECK (
        organization_id = (
          SELECT organization_id FROM users WHERE id = auth.uid()::text
        )
      )
    $policy$;
    RAISE NOTICE '✅ Migration 051: RLS UPDATE policy created for features';
  ELSE
    RAISE NOTICE 'ℹ️  Migration 051: RLS UPDATE policy already exists, skipped';
  END IF;
END $$;


-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'features'
      AND column_name  = 'key_flow_steps'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✅ Migration 051: features.key_flow_steps column present';
  ELSE
    RAISE EXCEPTION '❌ Migration 051: features.key_flow_steps column NOT found — migration failed';
  END IF;
END $$;
