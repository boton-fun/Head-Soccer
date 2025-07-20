-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(20) UNIQUE NOT NULL,
    display_name VARCHAR(50),
    avatar_url TEXT,
    character_id VARCHAR(50) DEFAULT 'player1',
    elo_rating INTEGER DEFAULT 1200,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games table for match history
CREATE TABLE public.games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    player2_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    player1_score INTEGER NOT NULL DEFAULT 0,
    player2_score INTEGER NOT NULL DEFAULT 0,
    winner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- in_progress, completed, abandoned
    game_mode VARCHAR(20) DEFAULT 'ranked', -- ranked, casual, tournament
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    CONSTRAINT check_different_players CHECK (player1_id != player2_id),
    CONSTRAINT check_valid_status CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    CONSTRAINT check_valid_mode CHECK (game_mode IN ('ranked', 'casual', 'tournament'))
);

-- Player statistics table
CREATE TABLE public.player_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    games_drawn INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    win_streak INTEGER DEFAULT 0,
    best_win_streak INTEGER DEFAULT 0,
    total_play_time_seconds INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard view for easy querying
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT 
    u.id,
    u.username,
    u.display_name,
    u.avatar_url,
    u.character_id,
    u.elo_rating,
    ps.games_played,
    ps.games_won,
    ps.games_lost,
    ps.games_drawn,
    ps.goals_scored,
    ps.goals_conceded,
    CASE 
        WHEN ps.games_played > 0 
        THEN ROUND((ps.games_won::DECIMAL / ps.games_played) * 100, 2)
        ELSE 0 
    END as win_rate,
    ps.best_win_streak
FROM public.users u
LEFT JOIN public.player_stats ps ON u.id = ps.user_id
ORDER BY u.elo_rating DESC;

-- Indexes for performance
CREATE INDEX idx_games_player1_id ON public.games(player1_id);
CREATE INDEX idx_games_player2_id ON public.games(player2_id);
CREATE INDEX idx_games_status ON public.games(status);
CREATE INDEX idx_games_created_at ON public.games(created_at DESC);
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_elo_rating ON public.users(elo_rating DESC);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON public.player_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create player_stats when user is created
CREATE OR REPLACE FUNCTION create_player_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.player_stats (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_player_stats_on_user_create
    AFTER INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION create_player_stats();

-- Row Level Security (RLS) Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

-- Users can read all user profiles
CREATE POLICY "Users can view all profiles" ON public.users
    FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Anyone can view games
CREATE POLICY "Anyone can view games" ON public.games
    FOR SELECT USING (true);

-- Only server can insert/update games (using service role key)
CREATE POLICY "Service role can manage games" ON public.games
    FOR ALL USING (auth.role() = 'service_role');

-- Anyone can view stats
CREATE POLICY "Anyone can view stats" ON public.player_stats
    FOR SELECT USING (true);

-- Only server can update stats
CREATE POLICY "Service role can manage stats" ON public.player_stats
    FOR ALL USING (auth.role() = 'service_role');