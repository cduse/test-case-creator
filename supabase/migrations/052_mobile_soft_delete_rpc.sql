-- ========================================
-- MIGRATION 052: MOBILE SOFT-DELETE RPC
-- ========================================
-- Description: Replace the RLS UPDATE policy (migration 051) with a
--              SECURITY DEFINER function so the mobile app can soft-delete
--              features without triggering conflicting WITH CHECK constraints.
--              This mirrors the web app's pattern: the edge function uses the
--              service-role key (bypasses RLS) but still validates org
--              membership; here we do the same inside the function body.
-- Date: April 26, 2026
-- ========================================


-- ========================================
-- 1. DROP THE PROBLEMATIC UPDATE POLICY
-- ========================================

DROP POLICY IF EXISTS mobile_authenticated_update_own_org_features ON features;


-- ========================================
-- 2. SECURITY DEFINER SOFT-DELETE FUNCTION
-- ========================================
-- Runs as the function owner (bypasses RLS), but validates that the calling
-- user belongs to the same organisation as the features being deleted.

CREATE OR REPLACE FUNCTION mobile_soft_delete_features(
  p_feature_ids TEXT[],
  p_user_id     TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
BEGIN
  -- Resolve the caller's organisation
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = auth.uid()::text;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'mobile_soft_delete_features: caller not found in users table';
  END IF;

  -- Soft-delete only features that belong to the caller's org and are not
  -- already deleted
  UPDATE features
  SET deleted_at = NOW(),
      deleted_by = p_user_id
  WHERE id = ANY(p_feature_ids)
    AND organization_id = v_org_id
    AND deleted_at IS NULL;
END;
$$;

-- Allow any authenticated user to call this function
GRANT EXECUTE ON FUNCTION mobile_soft_delete_features(TEXT[], TEXT) TO authenticated;


-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'mobile_soft_delete_features'
  ) THEN
    RAISE NOTICE '✅ Migration 052: mobile_soft_delete_features function created';
  ELSE
    RAISE EXCEPTION '❌ Migration 052: function not found — migration failed';
  END IF;
END $$;
