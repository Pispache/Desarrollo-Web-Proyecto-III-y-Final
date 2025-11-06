-- Init script para Postgres
-- Se ejecuta automaticamente al crear el contenedor

\echo 'Inicializando DB de reportes...'

-- Roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'report_ro') THEN
        CREATE ROLE report_ro WITH LOGIN PASSWORD 'report_ro_pwd_2025';
        RAISE NOTICE 'Rol report_ro creado';
    ELSE
        RAISE NOTICE 'Rol report_ro ya existe';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'etl_writer') THEN
        CREATE ROLE etl_writer WITH LOGIN PASSWORD 'etl_writer_pwd_2025';
        RAISE NOTICE 'Rol etl_writer creado';
    ELSE
        RAISE NOTICE 'Rol etl_writer ya existe';
    END IF;
END
$$;

-- Tablas

CREATE TABLE IF NOT EXISTS teams (
    team_id     INTEGER PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    city        VARCHAR(100),
    logo_url    VARCHAR(256),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
    player_id   INTEGER PRIMARY KEY,
    team_id     INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    number      SMALLINT,
    name        VARCHAR(100) NOT NULL,
    position    VARCHAR(20),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
    game_id         INTEGER PRIMARY KEY,
    home_team       VARCHAR(100) NOT NULL,
    away_team       VARCHAR(100) NOT NULL,
    home_team_id    INTEGER REFERENCES teams(team_id),
    away_team_id    INTEGER REFERENCES teams(team_id),
    quarter         SMALLINT NOT NULL DEFAULT 1,
    home_score      INTEGER NOT NULL DEFAULT 0,
    away_score      INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_events (
    event_id        INTEGER PRIMARY KEY,
    game_id         INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    quarter         SMALLINT NOT NULL,
    team            VARCHAR(10) NOT NULL,
    event_type      VARCHAR(20) NOT NULL,
    player_number   INTEGER,
    player_id       INTEGER REFERENCES players(player_id),
    foul_type       VARCHAR(20),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_roster_entries (
    roster_id   SERIAL PRIMARY KEY,
    game_id     INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id   INTEGER NOT NULL REFERENCES players(player_id),
    team_side   VARCHAR(10) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, player_id)
);

CREATE TABLE IF NOT EXISTS etl_state (
    checkpoint_key      VARCHAR(100) PRIMARY KEY,
    checkpoint_value    TEXT NOT NULL,
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indices

CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_active ON players(active) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_team_number ON players(team_id, number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_status_created ON games(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_team_ids ON games(home_team_id, away_team_id);
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_event_type ON game_events(event_type);
CREATE INDEX IF NOT EXISTS idx_game_events_player_id ON game_events(player_id);
CREATE INDEX IF NOT EXISTS idx_game_events_game_type ON game_events(game_id, event_type);
CREATE INDEX IF NOT EXISTS idx_game_events_fouls ON game_events(game_id, quarter, team, event_type) WHERE event_type = 'FOUL';
CREATE INDEX IF NOT EXISTS idx_roster_game_id ON game_roster_entries(game_id);
CREATE INDEX IF NOT EXISTS idx_roster_player_id ON game_roster_entries(player_id);

-- Permisos

GRANT USAGE ON SCHEMA public TO report_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO report_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO report_ro;

GRANT USAGE ON SCHEMA public TO etl_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO etl_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO etl_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO etl_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO etl_writer;

-- Checkpoints iniciales
INSERT INTO etl_state (checkpoint_key, checkpoint_value, updated_at)
VALUES 
    ('teams_last_id', '0', NOW()),
    ('players_last_id', '0', NOW()),
    ('games_last_id', '0', NOW()),
    ('game_events_last_id', '0', NOW())
ON CONFLICT (checkpoint_key) DO NOTHING;

\echo 'DB inicializada correctamente'
