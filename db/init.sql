IF DB_ID('MarcadorDB') IS NULL
    CREATE DATABASE MarcadorDB;
GO
USE MarcadorDB;
GO

-- Tabla de partidos
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

-- Tabla de eventos por cuarto (puntos, faltas, etc.)
IF OBJECT_ID('dbo.GameEvents') IS NULL
BEGIN
    CREATE TABLE dbo.GameEvents(
        EventId INT IDENTITY(1,1) PRIMARY KEY,
        GameId INT NOT NULL,
        Quarter TINYINT NOT NULL,
        Team NVARCHAR(10) NOT NULL, -- HOME/AWAY
        EventType NVARCHAR(20) NOT NULL, -- POINT_1/POINT_2/POINT_3/FOUL/UNDO
        PlayerNumber INT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FOREIGN KEY(GameId) REFERENCES dbo.Games(GameId)
    );
END
GO
