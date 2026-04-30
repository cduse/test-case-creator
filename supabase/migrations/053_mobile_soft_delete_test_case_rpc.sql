-- ========================================
-- MIGRATION 053: MOBILE SOFT-DELETE TEST CASE RPC
-- ========================================
-- Description: SECURITY DEFINER function to soft-delete a single test case
--              from the mobile app, bypassing the RLS WITH CHECK conflict
--              that blocks direct UPDATE calls (same pattern as migration 052
--              for features).
-- Date: April 26, 2026
-- ========================================

CREATE OR REPLACE FUNCTION mobile_soft_delete_test_case(
  p_test_case_id TEXT,
  p_user_id      TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id TEXT;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = auth.uid()::text;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'mobile_soft_delete_test_case: caller not found in users table';
  END IF;

  UPDATE test_cases
  SET deleted_at = NOW(),
      deleted_by = p_user_id
  WHERE id = p_test_case_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION mobile_soft_delete_test_case(TEXT, TEXT) TO authenticated;


-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mobile_soft_delete_test_case') THEN
    RAISE NOTICE '✅ Migration 053: mobile_soft_delete_test_case function created';
  ELSE
    RAISE EXCEPTION '❌ Migration 053: function not found — migration failed';
  END IF;
END $$;
