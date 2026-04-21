-- ========================================
-- MIGRATION 050: MOBILE APP SUPPORT
-- ========================================
-- Description: Schema changes required for the Testify mobile app to share the
--              Supabase backend with the web app.
-- Date: April 21, 2026
-- Changes:
--   1. Add 'tags' column to test_cases (was previously only added to test_plans)
--   2. Add GIN index on test_cases.tags for efficient array filtering
--   3. Add cascade soft-delete trigger: product → features, user_stories, test_cases
--   4. Add cascade soft-delete trigger: feature → user_stories, test_cases
-- ========================================


-- ========================================
-- 1. ADD tags COLUMN TO test_cases
-- ========================================
-- Migration 034 added 'tags' only to test_plans.
-- The mobile app writes tags to test_cases; without this column every upsert
-- from the mobile app will return a 400 / PGRST204 "column not found" error.

ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

COMMENT ON COLUMN test_cases.tags IS
  'Array of string tags for search, filtering and categorisation. Added in migration 050 for mobile app support.';


-- ========================================
-- 2. GIN INDEX ON test_cases.tags
-- ========================================
-- Enables efficient array-contains queries (e.g. tags @> ARRAY['smoke']).

CREATE INDEX IF NOT EXISTS idx_test_cases_tags
  ON test_cases USING GIN (tags);


-- ========================================
-- 3. CASCADE SOFT-DELETE: product → children
-- ========================================
-- When a product is soft-deleted (deleted_at changes from NULL to a timestamp),
-- automatically soft-delete its features, user_stories and test_cases so they
-- no longer appear in any queries and counts stay consistent.

CREATE OR REPLACE FUNCTION cascade_product_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- Runs as function owner so RLS doesn't block child updates
SET search_path = public
AS $$
BEGIN
  -- Only act when deleted_at transitions NULL → non-NULL (i.e., a soft-delete, not a restore)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN

    -- Soft-delete child features
    UPDATE features
    SET
      deleted_at = NEW.deleted_at,
      deleted_by = NEW.deleted_by,
      updated_at = NOW()
    WHERE product_id = NEW.id
      AND deleted_at IS NULL;

    -- Soft-delete child user_stories
    UPDATE user_stories
    SET
      deleted_at = NEW.deleted_at,
      updated_at = NOW()
    WHERE product_id = NEW.id
      AND deleted_at IS NULL;

    -- Soft-delete child test_cases
    UPDATE test_cases
    SET
      deleted_at = NEW.deleted_at,
      updated_at = NOW()
    WHERE product_id = NEW.id
      AND deleted_at IS NULL;

  END IF;

  RETURN NEW;
END;
$$;

-- Drop first in case of re-run
DROP TRIGGER IF EXISTS products_soft_delete_cascade ON products;

CREATE TRIGGER products_soft_delete_cascade
  AFTER UPDATE OF deleted_at ON products
  FOR EACH ROW
  EXECUTE FUNCTION cascade_product_soft_delete();

COMMENT ON TRIGGER products_soft_delete_cascade ON products IS
  'Cascades soft-deletes from a product to its features, user_stories and test_cases.';


-- ========================================
-- 4. CASCADE SOFT-DELETE: feature → children
-- ========================================
-- Handles direct feature deletes (not triggered by the product cascade above).

CREATE OR REPLACE FUNCTION cascade_feature_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN

    -- Soft-delete child user_stories
    UPDATE user_stories
    SET
      deleted_at = NEW.deleted_at,
      updated_at = NOW()
    WHERE feature_id = NEW.id
      AND deleted_at IS NULL;

    -- Soft-delete child test_cases
    UPDATE test_cases
    SET
      deleted_at = NEW.deleted_at,
      updated_at = NOW()
    WHERE feature_id = NEW.id
      AND deleted_at IS NULL;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS features_soft_delete_cascade ON features;

CREATE TRIGGER features_soft_delete_cascade
  AFTER UPDATE OF deleted_at ON features
  FOR EACH ROW
  EXECUTE FUNCTION cascade_feature_soft_delete();

COMMENT ON TRIGGER features_soft_delete_cascade ON features IS
  'Cascades soft-deletes from a feature to its user_stories and test_cases.';


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
      AND table_name   = 'test_cases'
      AND column_name  = 'tags'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✅ Migration 050: test_cases.tags column present';
  ELSE
    RAISE EXCEPTION '❌ Migration 050: test_cases.tags column NOT found — migration failed';
  END IF;

  RAISE NOTICE '✅ Migration 050: GIN index on test_cases.tags created';
  RAISE NOTICE '✅ Migration 050: Cascade soft-delete trigger on products created';
  RAISE NOTICE '✅ Migration 050: Cascade soft-delete trigger on features created';
  RAISE NOTICE '';
  RAISE NOTICE '📱 Mobile app can now safely write to test_cases.tags';
  RAISE NOTICE '🗑️  Soft-deleting a product now also soft-deletes its features, user_stories and test_cases';
END $$;
