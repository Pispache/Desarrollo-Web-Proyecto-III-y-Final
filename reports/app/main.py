import os
from typing import Optional
from datetime import datetime
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from .auth import require_admin
from .db import get_connection

# /// <summary>
# /// Punto de entrada del microservicio de reportes.
# /// </summary>
# /// <remarks>
# /// - Inicializa FastAPI y expone el endpoint de salud `/health`.
# /// - Forma parte de la Fase 2: se añadió CORS, router `/v1/reports` y endpoints protegidos.
# /// - Fase 3: se agregaron endpoints JSON para equipos, jugadores por equipo y partidos (sin paginación).
# /// </remarks>
app = FastAPI(title="Report Service", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok"}

# /// <summary>
# /// CORS para permitir solicitudes desde la UI local.
# /// </summary>
# /// <remarks>
# /// - Habilita orígenes `http://localhost:4200` y `http://127.0.0.1:4200`.
# /// - Necesario para que Angular consuma el microservicio durante desarrollo.
# /// </remarks>
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)

# /// <summary>
# /// Router de la API de reportes.
# /// </summary>
# /// <remarks>
# /// - Prefijo: `/v1/reports`.
# /// - Todos los endpoints usan `require_admin` (JWT con rol ADMIN) como guardia.
# /// </remarks>
router = APIRouter(prefix="/v1/reports")

# /// <summary>
# /// Verificación de autenticación/autorización para ADMIN.
# /// </summary>
# /// <remarks>
# /// - Retorna `{ ok: true }` con un token válido y rol ADMIN.
# /// - Respuestas esperadas: 401 (sin token), 403 (rol incorrecto), 200 (OK).
# /// </remarks>
@router.get("/ping")
def ping(_=Depends(require_admin)):
    return {"ok": True}

# /// <summary>
# /// Verificación de conectividad a la base de datos de reportes (Postgres).
# /// </summary>
# /// <remarks>
# /// - Ejecuta `SELECT 1` usando la cadena `POSTGRES_CS`.
# /// - Respuestas: `{ db: "ok" }` o 500 con detalle en caso de error.
# /// </remarks>
@router.get("/ping-db")
def ping_db(_=Depends(require_admin)):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return {"db": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Lista de equipos para reportes.
# /// </summary>
# /// <remarks>
# /// - Filtros: `q` (nombre) y `city`.
# /// - Seguridad: requiere JWT con rol ADMIN.
# /// </remarks>
@router.get("/teams")
def list_teams(
    q: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    _=Depends(require_admin)
):
    try:
        where = []
        params = []
        if q:
            where.append("(name ILIKE %s)")
            params.append(f"%{q}%")
        if city:
            where.append("(city ILIKE %s)")
            params.append(f"%{city}%")
        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT team_id, name, city, logo_url, created_at FROM teams{where_sql} ORDER BY name ASC",
                    params,
                )
                rows = [
                    {
                        "team_id": r[0],
                        "name": r[1],
                        "city": r[2],
                        "logo_url": r[3],
                        "created_at": r[4].isoformat() if r[4] else None,
                    }
                    for r in cur.fetchall()
                ]
        return {"items": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Lista de jugadores por equipo.
# /// </summary>
# /// <remarks>
# /// - Seguridad: requiere JWT con rol ADMIN.
# /// </remarks>
@router.get("/teams/{teamId}/players")
def list_players_by_team(
    teamId: int,
    _=Depends(require_admin)
):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT player_id, team_id, number, name, position, active, created_at FROM players WHERE team_id = %s ORDER BY number NULLS LAST, name ASC",
                    (teamId,),
                )
                rows = [
                    {
                        "player_id": r[0],
                        "team_id": r[1],
                        "number": r[2],
                        "name": r[3],
                        "position": r[4],
                        "active": r[5],
                        "created_at": r[6].isoformat() if r[6] else None,
                    }
                    for r in cur.fetchall()
                ]
        if not rows:
            raise HTTPException(status_code=404, detail="Team not found or no players")
        return {"items": rows}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Lista de partidos con filtros por fecha y estado.
# /// </summary>
# /// <remarks>
# /// - 400 si las fechas no cumplen un formato válido.
# /// </remarks>
@router.get("/games")
def list_games(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    _=Depends(require_admin)
):
    try:
        where = []
        params = []
        if status:
            where.append("status = %s")
            params.append(status)
        def parse_dt(s: Optional[str]) -> Optional[datetime]:
            if not s:
                return None
            return datetime.fromisoformat(s)
        dt_from = parse_dt(from_)
        dt_to = parse_dt(to)
        if dt_from:
            where.append("created_at >= %s")
            params.append(dt_from)
        if dt_to:
            where.append("created_at <= %s")
            params.append(dt_to)
        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT game_id, home_team, away_team, home_team_id, away_team_id, quarter, home_score, away_score, status, created_at FROM games{where_sql} ORDER BY created_at DESC",
                    params,
                )
                rows = [
                    {
                        "game_id": r[0],
                        "home_team": r[1],
                        "away_team": r[2],
                        "home_team_id": r[3],
                        "away_team_id": r[4],
                        "quarter": r[5],
                        "home_score": r[6],
                        "away_score": r[7],
                        "status": r[8],
                        "created_at": r[9].isoformat() if r[9] else None,
                    }
                    for r in cur.fetchall()
                ]
        return {"items": rows}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format; use ISO 8601 (YYYY-MM-DD or full ISO)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(router)
