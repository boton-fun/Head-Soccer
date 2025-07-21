-- Fix player_stats table by adding missing created_at column
-- This resolves the error: "Could not find the 'created_at' column of 'player_stats' in the schema cache"

-- Add created_at column to player_stats table
ALTER TABLE public.player_stats 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing records to have created_at values
UPDATE public.player_stats 
SET created_at = updated_at 
WHERE created_at IS NULL;

-- Make created_at NOT NULL after populating existing records
ALTER TABLE public.player_stats 
ALTER COLUMN created_at SET NOT NULL;

-- Ensure the trigger for updated_at is working
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recreate the trigger to ensure it's active
DROP TRIGGER IF EXISTS update_player_stats_updated_at ON public.player_stats;
CREATE TRIGGER update_player_stats_updated_at 
    BEFORE UPDATE ON public.player_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();