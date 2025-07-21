-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (standalone authentication)
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(50),
    avatar_url TEXT,
    character_id VARCHAR(50) DEFAULT 'player1',
    elo_rating INTEGER DEFAULT 1200,
    last_login_at TIMESTAMPTZ,
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
    average_game_duration INTEGER DEFAULT 0,
    fastest_goal_seconds INTEGER,
    goals_per_game DECIMAL(4,2) DEFAULT 0.0,
    clean_sheets INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game events table for detailed match tracking
CREATE TABLE public.game_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL, -- goal, start, end, pause, resume
    player_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_data JSONB, -- Additional event-specific data
    timestamp_seconds INTEGER NOT NULL, -- Time in game when event occurred
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT check_valid_event_type CHECK (event_type IN ('goal', 'start', 'end', 'pause', 'resume', 'disconnect', 'reconnect'))
);

-- Active game sessions table for real-time tracking
CREATE TABLE public.active_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    socket_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'online', -- online, in_queue, in_game, disconnected
    current_game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
    queue_position INTEGER,
    last_ping TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT check_valid_session_status CHECK (status IN ('online', 'in_queue', 'in_game', 'disconnected'))
);

-- Tournament system tables
CREATE TABLE public.tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    max_participants INTEGER DEFAULT 8,
    current_participants INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'registration', -- registration, in_progress, completed, cancelled
    prize_pool INTEGER DEFAULT 0,
    entry_fee INTEGER DEFAULT 0,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    winner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT check_valid_tournament_status CHECK (status IN ('registration', 'in_progress', 'completed', 'cancelled'))
);

CREATE TABLE public.tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    seed_position INTEGER,
    current_round INTEGER DEFAULT 1,
    eliminated_at TIMESTAMPTZ,
    prize_won INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tournament_id, user_id)
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
    ps.goals_per_game,
    ps.clean_sheets,
    ps.best_win_streak,
    ps.win_streak,
    ps.fastest_goal_seconds,
    ps.average_game_duration,
    CASE 
        WHEN ps.games_played > 0 
        THEN ROUND((ps.games_won::DECIMAL / ps.games_played) * 100, 2)
        ELSE 0 
    END as win_rate,
    CASE 
        WHEN ps.goals_conceded > 0 
        THEN ROUND((ps.goals_scored::DECIMAL / ps.goals_conceded), 2)
        ELSE ps.goals_scored::DECIMAL
    END as goal_ratio,
    ps.last_played_at,
    ROW_NUMBER() OVER (ORDER BY u.elo_rating DESC) as rank
FROM public.users u
LEFT JOIN public.player_stats ps ON u.id = ps.user_id
ORDER BY u.elo_rating DESC;

-- Online players view for quick access
CREATE OR REPLACE VIEW public.online_players AS
SELECT 
    u.id,
    u.username,
    u.display_name,
    u.character_id,
    u.elo_rating,
    s.status,
    s.current_game_id,
    s.queue_position,
    s.last_ping
FROM public.users u
INNER JOIN public.active_sessions s ON u.id = s.user_id
WHERE s.status IN ('online', 'in_queue', 'in_game')
    AND s.last_ping > NOW() - INTERVAL '5 minutes'
ORDER BY s.last_ping DESC;

-- Indexes for performance
CREATE INDEX idx_games_player1_id ON public.games(player1_id);
CREATE INDEX idx_games_player2_id ON public.games(player2_id);
CREATE INDEX idx_games_status ON public.games(status);
CREATE INDEX idx_games_created_at ON public.games(created_at DESC);
CREATE INDEX idx_games_winner_id ON public.games(winner_id);
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_elo_rating ON public.users(elo_rating DESC);

-- New table indexes
CREATE INDEX idx_game_events_game_id ON public.game_events(game_id);
CREATE INDEX idx_game_events_type ON public.game_events(event_type);
CREATE INDEX idx_game_events_player_id ON public.game_events(player_id);
CREATE INDEX idx_active_sessions_user_id ON public.active_sessions(user_id);
CREATE INDEX idx_active_sessions_status ON public.active_sessions(status);
CREATE INDEX idx_active_sessions_socket_id ON public.active_sessions(socket_id);
CREATE INDEX idx_tournaments_status ON public.tournaments(status);
CREATE INDEX idx_tournaments_start_time ON public.tournaments(start_time);
CREATE INDEX idx_tournament_participants_tournament_id ON public.tournament_participants(tournament_id);
CREATE INDEX idx_tournament_participants_user_id ON public.tournament_participants(user_id);

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
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

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

-- Game events policies
CREATE POLICY "Anyone can view game events" ON public.game_events
    FOR SELECT USING (true);

CREATE POLICY "Service role can manage game events" ON public.game_events
    FOR ALL USING (auth.role() = 'service_role');

-- Active sessions policies
CREATE POLICY "Users can view their own session" ON public.active_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage sessions" ON public.active_sessions
    FOR ALL USING (auth.role() = 'service_role');

-- Tournament policies
CREATE POLICY "Anyone can view tournaments" ON public.tournaments
    FOR SELECT USING (true);

CREATE POLICY "Users can create tournaments" ON public.tournaments
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Service role can manage tournaments" ON public.tournaments
    FOR ALL USING (auth.role() = 'service_role');

-- Tournament participants policies
CREATE POLICY "Anyone can view tournament participants" ON public.tournament_participants
    FOR SELECT USING (true);

CREATE POLICY "Users can join tournaments" ON public.tournament_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage participants" ON public.tournament_participants
    FOR ALL USING (auth.role() = 'service_role');