-- Migración 001: Creación del esquema inicial
-- Creado: 3 de noviembre, 2025
--
-- Este archivo crea toda la estructura base de la base de datos de reportes.
-- Incluye las tablas principales, índices para mejorar el rendimiento,
-- y los roles de usuario con sus permisos correspondientes.

-- Esta tabla lleva el registro de qué migraciones ya se han aplicado
-- Nos ayuda a no aplicar dos veces la misma migración por error
CREATE TABLE IF NOT EXISTS schema_migrations (
    version         INTEGER PRIMARY KEY,
    description     VARCHAR(255) NOT NULL,
    applied_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    execution_time  INTERVAL
);

-- Creamos dos roles de usuario para mantener la seguridad:
-- 1. report_ro: Solo puede leer datos (para reportes)
-- 2. etl_writer: Puede leer y escribir (para el proceso ETL)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'report_ro') THEN
        CREATE ROLE report_ro WITH LOGIN PASSWORD 'report_ro_pwd_2025';
        RAISE NOTICE 'Se creó el rol report_ro (solo lectura)';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'etl_writer') THEN
        CREATE ROLE etl_writer WITH LOGIN PASSWORD 'etl_writer_pwd_2025';
        RAISE NOTICE 'Se creó el rol etl_writer (lectura/escritura)';
    END IF;
END
$$;

-- Equipos de baloncesto
-- Aquí guardamos la info básica de cada equipo
CREATE TABLE IF NOT EXISTS teams (
    team_id     INTEGER PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    city        VARCHAR(100),
    logo_url    VARCHAR(256),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Jugadores
-- Cada jugador pertenece a un equipo y tiene su número de camiseta
CREATE TABLE IF NOT EXISTS players (
    player_id   INTEGER PRIMARY KEY,
    team_id     INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    number      SMALLINT,
    name        VARCHAR(100) NOT NULL,
    position    VARCHAR(20),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Partidos
-- Registra todos los juegos, con el marcador y el estado actual
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

-- Eventos del partido
-- Cada cosa que pasa en el juego se registra aquí:
-- puntos anotados, faltas, tiempos fuera, etc.
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

-- Plantilla del partido
-- Qué jugadores participaron en cada juego
CREATE TABLE IF NOT EXISTS game_roster_entries (
    roster_id   SERIAL PRIMARY KEY,
    game_id     INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id   INTEGER NOT NULL REFERENCES players(player_id),
    team_side   VARCHAR(10) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, player_id)
);

-- Checkpoints del ETL
-- Guardamos hasta dónde llegó la última sincronización
-- para no procesar los mismos datos dos veces
CREATE TABLE IF NOT EXISTS etl_state (
    checkpoint_key      VARCHAR(100) PRIMARY KEY,
    checkpoint_value    TEXT NOT NULL,
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices de equipos
-- Hacen más rápidas las búsquedas por nombre
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

-- Índices de jugadores
-- Optimizan las consultas por equipo, estado activo y número de camiseta
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_active ON players(active) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_team_number ON players(team_id, number) WHERE number IS NOT NULL;

-- Índices de partidos
-- Mejoran el rendimiento al filtrar por estado, fecha o equipos
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_status_created ON games(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_team_ids ON games(home_team_id, away_team_id);

-- Índices de eventos
-- Aceleran las consultas de estadísticas y faltas
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_event_type ON game_events(event_type);
CREATE INDEX IF NOT EXISTS idx_game_events_player_id ON game_events(player_id);
CREATE INDEX IF NOT EXISTS idx_game_events_game_type ON game_events(game_id, event_type);
CREATE INDEX IF NOT EXISTS idx_game_events_fouls ON game_events(game_id, quarter, team, event_type) WHERE event_type = 'FOUL';

-- Índices de plantillas
-- Para buscar rápido qué jugadores estuvieron en un partido
CREATE INDEX IF NOT EXISTS idx_roster_game_id ON game_roster_entries(game_id);
CREATE INDEX IF NOT EXISTS idx_roster_player_id ON game_roster_entries(player_id);

-- Damos permisos de solo lectura al rol de reportes
-- Puede ver todo pero no modificar nada
GRANT USAGE ON SCHEMA public TO report_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO report_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO report_ro;

-- El rol ETL necesita poder leer y escribir
-- porque es el que sincroniza los datos desde SQL Server
GRANT USAGE ON SCHEMA public TO etl_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO etl_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO etl_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO etl_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO etl_writer;

-- Inicializamos los checkpoints en 0
-- La primera vez que corra el ETL empezará desde aquí
INSERT INTO etl_state (checkpoint_key, checkpoint_value, updated_at)
VALUES 
    ('teams_last_id', '0', NOW()),
    ('players_last_id', '0', NOW()),
    ('games_last_id', '0', NOW()),
    ('game_events_last_id', '0', NOW())
ON CONFLICT (checkpoint_key) DO NOTHING;

-- Marcamos esta migración como aplicada
INSERT INTO schema_migrations (version, description, applied_at)
VALUES (1, 'Esquema inicial con tablas base', NOW())
ON CONFLICT (version) DO NOTHING;
