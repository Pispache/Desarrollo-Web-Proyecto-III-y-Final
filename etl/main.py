import os
import time
import logging
import pyodbc
import psycopg
from datetime import datetime
from typing import Dict, Optional, Tuple
import sys

# Configuración de logging mejorada
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/var/log/etl/etl.log') if os.path.exists('/var/log/etl') else logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Variables de entorno
MSSQL_CS = os.getenv("MSSQL_CS", "")
POSTGRES_CS = os.getenv("POSTGRES_CS", "")
INTERVAL = int(os.getenv("ETL_INTERVAL_SECONDS", "120"))
MAX_RETRIES = int(os.getenv("ETL_MAX_RETRIES", "3"))
RETRY_DELAY = int(os.getenv("ETL_RETRY_DELAY_SECONDS", "5"))

def get_mssql_connection(retry_count: int = 0):
    """Conecta a SQL Server con reintentos automáticos"""
    if not MSSQL_CS:
        raise RuntimeError("MSSQL_CS no configurado")
    
    for attempt in range(MAX_RETRIES):
        try:
            conn = pyodbc.connect(MSSQL_CS, timeout=30)
            logger.info(f"Conexión a SQL Server establecida (intento {attempt + 1})")
            return conn
        except Exception as e:
            logger.warning(f"Error conectando a SQL Server (intento {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
            else:
                logger.error("No se pudo conectar a SQL Server después de todos los reintentos")
                raise

def get_postgres_connection(retry_count: int = 0):
    """Conecta a PostgreSQL con reintentos automáticos"""
    if not POSTGRES_CS:
        raise RuntimeError("POSTGRES_CS no configurado")
    
    for attempt in range(MAX_RETRIES):
        try:
            conn = psycopg.connect(POSTGRES_CS, connect_timeout=30)
            logger.info(f"Conexión a PostgreSQL establecida (intento {attempt + 1})")
            return conn
        except Exception as e:
            logger.warning(f"Error conectando a PostgreSQL (intento {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
            else:
                logger.error("No se pudo conectar a PostgreSQL después de todos los reintentos")
                raise

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

def log_etl_run(pg_conn, table_name: str, status: str, records_processed: int, 
                duration: float, error_message: Optional[str] = None):
    """Registra la ejecución del ETL en la tabla de logs"""
    try:
        with pg_conn.cursor() as cur:
            cur.execute(
                """INSERT INTO etl_logs (table_name, status, records_processed, duration_seconds, error_message, executed_at)
                   VALUES (%s, %s, %s, %s, %s, NOW())""",
                (table_name, status, records_processed, duration, error_message)
            )
        pg_conn.commit()
        logger.debug(f"Log ETL registrado para {table_name}: {status}")
    except Exception as e:
        logger.error(f"Error registrando log ETL: {e}")
        # No fallar el ETL por un error de logging

def validate_counts(mssql_conn, pg_conn) -> Dict[str, Tuple[int, int, bool]]:
    """Valida que los conteos entre SQL Server y PostgreSQL coincidan"""
    tables = {
        'teams': ('dbo.Teams', 'teams', 'TeamId', 'team_id'),
        'players': ('dbo.Players', 'players', 'PlayerId', 'player_id'),
        'games': ('dbo.Games', 'games', 'GameId', 'game_id'),
        'game_events': ('dbo.GameEvents', 'game_events', 'EventId', 'event_id')
    }
    
    results = {}
    logger.info("=== Validación de Conteos ===")
    
    for name, (mssql_table, pg_table, mssql_id, pg_id) in tables.items():
        try:
            # Contar en SQL Server
            with mssql_conn.cursor() as ms_cur:
                ms_cur.execute(f"SELECT COUNT(*) FROM {mssql_table}")
                mssql_count = ms_cur.fetchone()[0]
            
            # Contar en PostgreSQL
            with pg_conn.cursor() as pg_cur:
                pg_cur.execute(f"SELECT COUNT(*) FROM {pg_table}")
                pg_count = pg_cur.fetchone()[0]
            
            match = mssql_count == pg_count
            results[name] = (mssql_count, pg_count, match)
            
            status = "✓" if match else "✗"
            logger.info(f"{status} {name:15} | SQL Server: {mssql_count:6} | PostgreSQL: {pg_count:6}")
            
        except Exception as e:
            logger.error(f"Error validando {name}: {e}")
            results[name] = (0, 0, False)
    
    return results

def sync_teams(mssql_conn, pg_conn):
    """Sincroniza equipos desde SQL Server a PostgreSQL"""
    start = time.time()
    table_name = "teams"
    
    try:
        last_id = int(get_checkpoint(pg_conn, "teams_last_id"))
        logger.debug(f"Sincronizando {table_name} desde ID > {last_id}")
        
        with mssql_conn.cursor() as ms_cur:
            ms_cur.execute("SELECT TeamId, Name, City, LogoUrl, CreatedAt FROM dbo.Teams WHERE TeamId > ? ORDER BY TeamId", (last_id,))
            rows = ms_cur.fetchall()
        
        if not rows:
            log_etl_run(pg_conn, table_name, "SUCCESS", 0, round(time.time() - start, 2))
            return {"table": table_name, "count": 0, "duration": 0, "last_id": last_id, "status": "SUCCESS"}
        
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
        
        duration = round(time.time() - start, 2)
        log_etl_run(pg_conn, table_name, "SUCCESS", len(rows), duration)
        
        return {"table": table_name, "count": len(rows), "duration": duration, "last_id": new_last_id, "status": "SUCCESS"}
        
    except Exception as e:
        duration = round(time.time() - start, 2)
        error_msg = str(e)
        logger.error(f"Error sincronizando {table_name}: {error_msg}")
        log_etl_run(pg_conn, table_name, "ERROR", 0, duration, error_msg)
        return {"table": table_name, "count": 0, "duration": duration, "last_id": last_id, "status": "ERROR", "error": error_msg}

def sync_players(mssql_conn, pg_conn):
    """Sincroniza jugadores desde SQL Server a PostgreSQL"""
    start = time.time()
    table_name = "players"
    
    try:
        last_id = int(get_checkpoint(pg_conn, "players_last_id"))
        logger.debug(f"Sincronizando {table_name} desde ID > {last_id}")
        
        with mssql_conn.cursor() as ms_cur:
            ms_cur.execute("SELECT PlayerId, TeamId, Number, Name, Position, Active, CreatedAt FROM dbo.Players WHERE PlayerId > ? ORDER BY PlayerId", (last_id,))
            rows = ms_cur.fetchall()
        
        if not rows:
            log_etl_run(pg_conn, table_name, "SUCCESS", 0, round(time.time() - start, 2))
            return {"table": table_name, "count": 0, "duration": 0, "last_id": last_id, "status": "SUCCESS"}
        
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
        
        duration = round(time.time() - start, 2)
        log_etl_run(pg_conn, table_name, "SUCCESS", len(rows), duration)
        
        return {"table": table_name, "count": len(rows), "duration": duration, "last_id": new_last_id, "status": "SUCCESS"}
        
    except Exception as e:
        duration = round(time.time() - start, 2)
        error_msg = str(e)
        logger.error(f"Error sincronizando {table_name}: {error_msg}")
        log_etl_run(pg_conn, table_name, "ERROR", 0, duration, error_msg)
        return {"table": table_name, "count": 0, "duration": duration, "last_id": last_id, "status": "ERROR", "error": error_msg}

def sync_games(mssql_conn, pg_conn):
    """Sincroniza juegos desde SQL Server a PostgreSQL"""
    start = time.time()
    table_name = "games"
    
    try:
        last_id = int(get_checkpoint(pg_conn, "games_last_id"))
        logger.debug(f"Sincronizando {table_name} desde ID > {last_id}")
        
        with mssql_conn.cursor() as ms_cur:
            ms_cur.execute("SELECT GameId, HomeTeam, AwayTeam, HomeTeamId, AwayTeamId, Quarter, HomeScore, AwayScore, Status, CreatedAt FROM dbo.Games WHERE GameId > ? ORDER BY GameId", (last_id,))
            rows = ms_cur.fetchall()
        
        if not rows:
            log_etl_run(pg_conn, table_name, "SUCCESS", 0, round(time.time() - start, 2))
            return {"table": table_name, "count": 0, "duration": 0, "last_id": last_id, "status": "SUCCESS"}
        
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
        
        duration = round(time.time() - start, 2)
        log_etl_run(pg_conn, table_name, "SUCCESS", len(rows), duration)
        
        return {"table": table_name, "count": len(rows), "duration": duration, "last_id": new_last_id, "status": "SUCCESS"}
        
    except Exception as e:
        duration = round(time.time() - start, 2)
        error_msg = str(e)
        logger.error(f"Error sincronizando {table_name}: {error_msg}")
        log_etl_run(pg_conn, table_name, "ERROR", 0, duration, error_msg)
        return {"table": table_name, "count": 0, "duration": duration, "last_id": last_id, "status": "ERROR", "error": error_msg}

def sync_game_events(mssql_conn, pg_conn):
    """Sincroniza eventos de juegos desde SQL Server a PostgreSQL"""
    start = time.time()
    table_name = "game_events"
    
    try:
        last_id = int(get_checkpoint(pg_conn, "game_events_last_id"))
        logger.debug(f"Sincronizando {table_name} desde ID > {last_id}")
        
        with mssql_conn.cursor() as ms_cur:
            ms_cur.execute("SELECT EventId, GameId, Quarter, Team, EventType, PlayerNumber, PlayerId, FoulType, CreatedAt FROM dbo.GameEvents WHERE EventId > ? ORDER BY EventId", (last_id,))
            rows = ms_cur.fetchall()
        
        if not rows:
            log_etl_run(pg_conn, table_name, "SUCCESS", 0, round(time.time() - start, 2))
            return {"table": table_name, "count": 0, "duration": 0, "last_id": last_id, "status": "SUCCESS"}
        
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
        
        duration = round(time.time() - start, 2)
        log_etl_run(pg_conn, table_name, "SUCCESS", len(rows), duration)
        
        return {"table": table_name, "count": len(rows), "duration": duration, "last_id": new_last_id, "status": "SUCCESS"}
        
    except Exception as e:
        duration = round(time.time() - start, 2)
        error_msg = str(e)
        logger.error(f"Error sincronizando {table_name}: {error_msg}")
        log_etl_run(pg_conn, table_name, "ERROR", 0, duration, error_msg)
        return {"table": table_name, "count": 0, "duration": duration, "last_id": last_id, "status": "ERROR", "error": error_msg}

def run_once():
    """Ejecuta un ciclo completo de sincronización ETL"""
    start_time = datetime.now()
    logger.info(f"{'='*60}")
    logger.info(f"Iniciando sincronización ETL - {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"{'='*60}")
    
    mssql_conn = None
    pg_conn = None
    
    try:
        # Establecer conexiones
        mssql_conn = get_mssql_connection()
        pg_conn = get_postgres_connection()
        
        # Sincronizar tablas
        results = []
        results.append(sync_teams(mssql_conn, pg_conn))
        results.append(sync_players(mssql_conn, pg_conn))
        results.append(sync_games(mssql_conn, pg_conn))
        results.append(sync_game_events(mssql_conn, pg_conn))
        
        # Resumen de sincronización
        total = sum(r["count"] for r in results)
        duration = sum(r["duration"] for r in results)
        errors = [r for r in results if r.get("status") == "ERROR"]
        
        logger.info(f"\n{'='*60}")
        logger.info("Resumen de Sincronización:")
        logger.info(f"{'='*60}")
        
        for r in results:
            status_icon = "✓" if r.get("status") == "SUCCESS" else "✗"
            if r["count"] > 0 or r.get("status") == "ERROR":
                logger.info(f"{status_icon} {r['table']:15} | {r['count']:5} registros | {r['duration']:.2f}s | ID: {r['last_id']}")
                if r.get("error"):
                    logger.error(f"  └─ Error: {r['error']}")
        
        logger.info(f"{'='*60}")
        logger.info(f"Total: {total} registros en {duration:.2f}s")
        
        # Validar conteos si hubo sincronización
        if total > 0:
            logger.info(f"\n{'='*60}")
            validation_results = validate_counts(mssql_conn, pg_conn)
            logger.info(f"{'='*60}")
            
            # Verificar si hay discrepancias
            mismatches = [k for k, v in validation_results.items() if not v[2]]
            if mismatches:
                logger.warning(f"⚠️  Discrepancias encontradas en: {', '.join(mismatches)}")
        
        # Reportar errores si los hay
        if errors:
            logger.error(f"\n⚠️  {len(errors)} tabla(s) con errores")
            return False
        
        logger.info(f"\n✓ Sincronización completada exitosamente")
        return True
        
    except Exception as e:
        logger.error(f"Error crítico en ETL: {e}", exc_info=True)
        return False
        
    finally:
        # Cerrar conexiones
        if mssql_conn:
            try:
                mssql_conn.close()
                logger.debug("Conexión SQL Server cerrada")
            except:
                pass
        if pg_conn:
            try:
                pg_conn.close()
                logger.debug("Conexión PostgreSQL cerrada")
            except:
                pass
        
        end_time = datetime.now()
        elapsed = (end_time - start_time).total_seconds()
        logger.info(f"Tiempo total de ejecución: {elapsed:.2f}s\n")

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
