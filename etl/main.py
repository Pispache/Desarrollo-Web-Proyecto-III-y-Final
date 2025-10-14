import os
import time
import logging
import pyodbc
import psycopg

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MSSQL_CS = os.getenv("MSSQL_CS", "")
POSTGRES_CS = os.getenv("POSTGRES_CS", "")
INTERVAL = int(os.getenv("ETL_INTERVAL_SECONDS", "120"))

def get_mssql_connection():
    if not MSSQL_CS:
        raise RuntimeError("MSSQL_CS no configurado")
    return pyodbc.connect(MSSQL_CS)

def get_postgres_connection():
    if not POSTGRES_CS:
        raise RuntimeError("POSTGRES_CS no configurado")
    return psycopg.connect(POSTGRES_CS)

def get_checkpoint(pg_conn, key):
    with pg_conn.cursor() as cur:
        cur.execute("SELECT checkpoint_value FROM etl_state WHERE checkpoint_key = %s", (key,))
        row = cur.fetchone()
        return row[0] if row else "0"

def set_checkpoint(pg_conn, key, value):
    with pg_conn.cursor() as cur:
        cur.execute(
            """INSERT INTO etl_state (checkpoint_key, checkpoint_value, updated_at)
               VALUES (%s, %s, NOW())
               ON CONFLICT (checkpoint_key) 
               DO UPDATE SET checkpoint_value = EXCLUDED.checkpoint_value, updated_at = NOW()""",
            (key, value)
        )
    pg_conn.commit()

def sync_teams(mssql_conn, pg_conn):
    start = time.time()
    last_id = int(get_checkpoint(pg_conn, "teams_last_id"))
    
    with mssql_conn.cursor() as ms_cur:
        ms_cur.execute("SELECT TeamId, Name, City, LogoUrl, CreatedAt FROM dbo.Teams WHERE TeamId > ? ORDER BY TeamId", (last_id,))
        rows = ms_cur.fetchall()
    
    if not rows:
        return {"table": "teams", "count": 0, "duration": 0, "last_id": last_id}
    
    with pg_conn.cursor() as pg_cur:
        for row in rows:
            pg_cur.execute(
                """INSERT INTO teams (team_id, name, city, logo_url, created_at)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (team_id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, logo_url = EXCLUDED.logo_url""",
                (row.TeamId, row.Name, row.City, row.LogoUrl, row.CreatedAt)
            )
    
    pg_conn.commit()
    new_last_id = rows[-1].TeamId
    set_checkpoint(pg_conn, "teams_last_id", str(new_last_id))
    
    return {"table": "teams", "count": len(rows), "duration": round(time.time() - start, 2), "last_id": new_last_id}

def sync_players(mssql_conn, pg_conn):
    start = time.time()
    last_id = int(get_checkpoint(pg_conn, "players_last_id"))
    
    with mssql_conn.cursor() as ms_cur:
        ms_cur.execute("SELECT PlayerId, TeamId, Number, Name, Position, Active, CreatedAt FROM dbo.Players WHERE PlayerId > ? ORDER BY PlayerId", (last_id,))
        rows = ms_cur.fetchall()
    
    if not rows:
        return {"table": "players", "count": 0, "duration": 0, "last_id": last_id}
    
    with pg_conn.cursor() as pg_cur:
        for row in rows:
            pg_cur.execute(
                """INSERT INTO players (player_id, team_id, number, name, position, active, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (player_id) DO UPDATE SET team_id = EXCLUDED.team_id, number = EXCLUDED.number, name = EXCLUDED.name, position = EXCLUDED.position, active = EXCLUDED.active""",
                (row.PlayerId, row.TeamId, row.Number, row.Name, row.Position, row.Active, row.CreatedAt)
            )
    
    pg_conn.commit()
    new_last_id = rows[-1].PlayerId
    set_checkpoint(pg_conn, "players_last_id", str(new_last_id))
    
    return {"table": "players", "count": len(rows), "duration": round(time.time() - start, 2), "last_id": new_last_id}

def sync_games(mssql_conn, pg_conn):
    start = time.time()
    last_id = int(get_checkpoint(pg_conn, "games_last_id"))
    
    with mssql_conn.cursor() as ms_cur:
        ms_cur.execute("SELECT GameId, HomeTeam, AwayTeam, HomeTeamId, AwayTeamId, Quarter, HomeScore, AwayScore, Status, CreatedAt FROM dbo.Games WHERE GameId > ? ORDER BY GameId", (last_id,))
        rows = ms_cur.fetchall()
    
    if not rows:
        return {"table": "games", "count": 0, "duration": 0, "last_id": last_id}
    
    with pg_conn.cursor() as pg_cur:
        for row in rows:
            pg_cur.execute(
                """INSERT INTO games (game_id, home_team, away_team, home_team_id, away_team_id, quarter, home_score, away_score, status, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (game_id) DO UPDATE SET home_team = EXCLUDED.home_team, away_team = EXCLUDED.away_team, home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id, quarter = EXCLUDED.quarter, home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, status = EXCLUDED.status""",
                (row.GameId, row.HomeTeam, row.AwayTeam, row.HomeTeamId, row.AwayTeamId, row.Quarter, row.HomeScore, row.AwayScore, row.Status, row.CreatedAt)
            )
    
    pg_conn.commit()
    new_last_id = rows[-1].GameId
    set_checkpoint(pg_conn, "games_last_id", str(new_last_id))
    
    return {"table": "games", "count": len(rows), "duration": round(time.time() - start, 2), "last_id": new_last_id}

def sync_game_events(mssql_conn, pg_conn):
    start = time.time()
    last_id = int(get_checkpoint(pg_conn, "game_events_last_id"))
    
    with mssql_conn.cursor() as ms_cur:
        ms_cur.execute("SELECT EventId, GameId, Quarter, Team, EventType, PlayerNumber, PlayerId, FoulType, CreatedAt FROM dbo.GameEvents WHERE EventId > ? ORDER BY EventId", (last_id,))
        rows = ms_cur.fetchall()
    
    if not rows:
        return {"table": "game_events", "count": 0, "duration": 0, "last_id": last_id}
    
    with pg_conn.cursor() as pg_cur:
        for row in rows:
            pg_cur.execute(
                """INSERT INTO game_events (event_id, game_id, quarter, team, event_type, player_number, player_id, foul_type, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (event_id) DO UPDATE SET game_id = EXCLUDED.game_id, quarter = EXCLUDED.quarter, team = EXCLUDED.team, event_type = EXCLUDED.event_type, player_number = EXCLUDED.player_number, player_id = EXCLUDED.player_id, foul_type = EXCLUDED.foul_type""",
                (row.EventId, row.GameId, row.Quarter, row.Team, row.EventType, row.PlayerNumber, row.PlayerId, row.FoulType, row.CreatedAt)
            )
    
    pg_conn.commit()
    new_last_id = rows[-1].EventId
    set_checkpoint(pg_conn, "game_events_last_id", str(new_last_id))
    
    return {"table": "game_events", "count": len(rows), "duration": round(time.time() - start, 2), "last_id": new_last_id}

def run_once():
    logger.info("Iniciando sincronizacion ETL...")
    try:
        mssql_conn = get_mssql_connection()
        pg_conn = get_postgres_connection()
        
        results = []
        results.append(sync_teams(mssql_conn, pg_conn))
        results.append(sync_players(mssql_conn, pg_conn))
        results.append(sync_games(mssql_conn, pg_conn))
        results.append(sync_game_events(mssql_conn, pg_conn))
        
        total = sum(r["count"] for r in results)
        duration = sum(r["duration"] for r in results)
        
        for r in results:
            if r["count"] > 0:
                logger.info(f"{r['table']:15} | {r['count']:5} registros | {r['duration']:.2f}s | ID: {r['last_id']}")
        
        logger.info(f"Total: {total} registros en {duration:.2f}s")
        
        mssql_conn.close()
        pg_conn.close()
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    logger.info(f"ETL iniciado (intervalo: {INTERVAL}s)")
    if not MSSQL_CS or not POSTGRES_CS:
        logger.error("Faltan variables de entorno")
    else:
        while True:
            try:
                run_once()
                time.sleep(INTERVAL)
            except KeyboardInterrupt:
                logger.info("ETL detenido")
                break
