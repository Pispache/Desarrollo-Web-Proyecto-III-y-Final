IF DB_ID('MarcadorDB') IS NULL
    CREATE DATABASE MarcadorDB;
GO
USE MarcadorDB;
GO

/* =========================
   TEAMS
   ========================= */
IF OBJECT_ID('dbo.Teams') IS NULL
BEGIN
    CREATE TABLE dbo.Teams(
        TeamId    INT IDENTITY(1,1) PRIMARY KEY,
        Name      NVARCHAR(100) NOT NULL UNIQUE,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

/* =========================
   GAMES
   ========================= */
IF OBJECT_ID('dbo.Games') IS NULL
BEGIN
    CREATE TABLE dbo.Games(
        GameId INT IDENTITY(1,1) PRIMARY KEY,
        HomeTeam NVARCHAR(100) NOT NULL,
        AwayTeam NVARCHAR(100) NOT NULL,
        Quarter TINYINT NOT NULL DEFAULT 1,
        HomeScore INT NOT NULL DEFAULT 0,
        AwayScore INT NOT NULL DEFAULT 0,
        Status NVARCHAR(20) NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED/IN_PROGRESS/FINISHED/CANCELLED
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

/* Agregar columnas opcionales para enlazar equipos por ID (para emparejar) */
IF COL_LENGTH('dbo.Games','HomeTeamId') IS NULL
    ALTER TABLE dbo.Games ADD HomeTeamId INT NULL REFERENCES dbo.Teams(TeamId);
IF COL_LENGTH('dbo.Games','AwayTeamId') IS NULL
    ALTER TABLE dbo.Games ADD AwayTeamId INT NULL REFERENCES dbo.Teams(TeamId);
GO

/* =========================
   GAME EVENTS
   ========================= */
IF OBJECT_ID('dbo.GameEvents') IS NULL
BEGIN
    CREATE TABLE dbo.GameEvents(
        EventId INT IDENTITY(1,1) PRIMARY KEY,
        GameId INT NOT NULL,
        Quarter TINYINT NOT NULL,
        Team NVARCHAR(10) NOT NULL,                 -- HOME/AWAY
        EventType NVARCHAR(20) NOT NULL,            -- POINT_1/POINT_2/POINT_3/FOUL/UNDO
        PlayerNumber INT NULL,                      -- dorsal plano (compatibilidad)
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY(GameId) REFERENCES dbo.Games(GameId)
    );
END
GO

-- Add FoulType column if it doesn't exist
IF COL_LENGTH('dbo.GameEvents', 'FoulType') IS NULL
BEGIN
    ALTER TABLE dbo.GameEvents
    ADD FoulType NVARCHAR(20) NULL;   -- 'PERSONAL' | 'TECHNICAL' | 'UNSPORTSMANLIKE' | 'DISQUALIFYING'
END

-- Add PlayerId column if it doesn't exist
IF COL_LENGTH('dbo.GameEvents', 'PlayerId') IS NULL
BEGIN
    -- First add the column as nullable
    ALTER TABLE dbo.GameEvents 
    ADD PlayerId INT NULL;
    
    -- Then add the foreign key constraint
    ALTER TABLE dbo.GameEvents
    ADD CONSTRAINT FK_GameEvents_Players
    FOREIGN KEY (PlayerId) REFERENCES dbo.Players(PlayerId);
END

-- Create index if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GameEvents_Player_Type' AND object_id = OBJECT_ID('dbo.GameEvents'))
BEGIN
    CREATE INDEX IX_GameEvents_Player_Type
    ON dbo.GameEvents (PlayerId, FoulType, Quarter);
END
GO

/* =========================
   GAME CLOCKS
   ========================= */
IF OBJECT_ID('dbo.GameClocks') IS NULL
BEGIN
    CREATE TABLE dbo.GameClocks(
        GameId      INT         NOT NULL,
        Quarter     TINYINT     NOT NULL,
        QuarterMs   INT         NOT NULL DEFAULT 600000,  -- 10 min por cuarto (FIBA)
        RemainingMs INT         NOT NULL DEFAULT 600000,  -- 10 min por cuarto (FIBA)
        Running     BIT         NOT NULL DEFAULT 0,
        StartedAt   DATETIME2   NULL,
        UpdatedAt   DATETIME2   NOT NULL DEFAULT SYSUTCDATETIME(),
        PRIMARY KEY (GameId, Quarter),
        FOREIGN KEY (GameId) REFERENCES dbo.Games(GameId) ON DELETE CASCADE
    );
END
GO

/* =========================
   PLAYERS
   ========================= */
IF OBJECT_ID('dbo.Players') IS NULL
BEGIN
    CREATE TABLE dbo.Players(
        PlayerId   INT IDENTITY(1,1) PRIMARY KEY,
        TeamId     INT NOT NULL
                   REFERENCES dbo.Teams(TeamId) ON DELETE CASCADE,
        Number     TINYINT NULL,              -- dorsal opcional
        Name       NVARCHAR(100) NOT NULL,
        Position   NVARCHAR(20) NULL,         -- opcional (G/F/C)
        Active     BIT NOT NULL DEFAULT 1,
        CreatedAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    /* Un dorsal no puede repetirse dentro del MISMO equipo (permite NULL) */
    CREATE UNIQUE INDEX UX_Players_Team_Number
        ON dbo.Players(TeamId, Number)
        WHERE Number IS NOT NULL;
END
GO

/* FK de GameEvents -> Players (si no existe ya) */
IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_GameEvents_Players'
      AND parent_object_id = OBJECT_ID('dbo.GameEvents')
)
BEGIN
    ALTER TABLE dbo.GameEvents
        WITH NOCHECK
        ADD CONSTRAINT FK_GameEvents_Players
        FOREIGN KEY (PlayerId) REFERENCES dbo.Players(PlayerId);
END
GO

/* =========================
   ÍNDICES
   ========================= */

/* GameEvents: por juego/evento (ya lo tenías) */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_GameEvents_GameId_EventId' 
      AND object_id = OBJECT_ID('dbo.GameEvents')
)
BEGIN
    CREATE INDEX IX_GameEvents_GameId_EventId 
        ON dbo.GameEvents(GameId, EventId DESC);
END
GO

/* Games: por estado (ya lo tenías) */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_Games_Status' 
      AND object_id = OBJECT_ID('dbo.Games')
)
BEGIN
    CREATE INDEX IX_Games_Status 
        ON dbo.Games(Status);
END
GO

/* GameEvents: búsquedas por jugador */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_GameEvents_PlayerId'
      AND object_id = OBJECT_ID('dbo.GameEvents')
)
BEGIN
    CREATE INDEX IX_GameEvents_PlayerId
        ON dbo.GameEvents(PlayerId);
END
GO

/* Games: lecturas por equipos emparejados */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name='IX_Games_TeamIds' 
    AND object_id=OBJECT_ID('dbo.Games')
)
BEGIN
  CREATE INDEX IX_Games_TeamIds ON dbo.Games(HomeTeamId, AwayTeamId);
END
GO

/* GameEvents: conteo rápido de faltas por cuarto/equipo (incluye PlayerId) */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes 
  WHERE name='IX_GameEvents_FoulsFast' 
    AND object_id=OBJECT_ID('dbo.GameEvents')
)
BEGIN
  CREATE INDEX IX_GameEvents_FoulsFast
    ON dbo.GameEvents(GameId, Quarter, Team, EventType) INCLUDE(PlayerId);
END
GO

/* =========================
   ADMIN USERS (para autenticación)
   ========================= */
IF OBJECT_ID('dbo.AdminUsers') IS NULL
BEGIN
    CREATE TABLE dbo.AdminUsers (
        UserId       INT IDENTITY(1,1) PRIMARY KEY,
        Username     NVARCHAR(50) NOT NULL UNIQUE,
        PasswordHash VARBINARY(256) NOT NULL,
        PasswordSalt VARBINARY(128) NOT NULL,
        Role         NVARCHAR(20) NOT NULL DEFAULT 'ADMIN',
        Active       BIT NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
