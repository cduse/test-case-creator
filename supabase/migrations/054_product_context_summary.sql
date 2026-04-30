-- Add AI context columns to products table so context survives logout/reinstall
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS context_summary TEXT,
  ADD COLUMN IF NOT EXISTS context_generated_at TIMESTAMPTZ;
