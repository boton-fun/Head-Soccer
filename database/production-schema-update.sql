-- Production Database Schema Update
-- Run this in the production Supabase SQL Editor

-- 1. Add password_hash column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';

-- 2. Remove foreign key constraint to auth.users (if it exists)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- 3. Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;