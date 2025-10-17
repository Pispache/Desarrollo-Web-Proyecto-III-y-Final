"""
@summary Microservicio de Reportes (FastAPI).
@remarks
- Expone endpoints JSON y PDF bajo el prefijo `/v1/reports`.\
- Protege rutas sensibles con validación de JWT/rol ADMIN.\
- Se integra con el generador de PDFs (`pdf-renderer`) y con PostgreSQL para consultas.
"""
import os
from typing import Optional
from datetime import datetime
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from .auth import require_admin
from .db import get_connection
from .pdf.base import render_html_to_pdf
from .pdf.templates import render_teams_html, render_players_html, render_games_html, render_roster_html, render_player_stats_html

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
    """ 
    @summary Endpoint de salud del microservicio.
    @returns Objeto JSON con `status: ok` para monitoreo.
    """
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
    allow_credentials=True,
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
# /// RF-REP-04: Reporte de roster por partido en PDF.
# /// </summary>
# /// <remarks>
# /// - Muestra los jugadores asignados por cada equipo (local/visitante) según `game_roster_entries`.
# /// - 404 si el partido no existe.
# /// </remarks>
@router.get("/games/{gameId}/roster.pdf")
async def roster_pdf(
    gameId: int,
    request: Request,
    _=Depends(require_admin)
):
    print(f"[INFO] Generating roster PDF for game {gameId}")
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Obtener datos del partido
                cur.execute(
                    """
                    SELECT game_id, home_team, away_team, home_team_id, away_team_id
                    FROM games
                    WHERE game_id = %s
                    """,
                    (gameId,)
                )
                g = cur.fetchone()
                if not g:
                    raise HTTPException(status_code=404, detail="Game not found")
                game = {
                    "game_id": g[0],
                    "home_team": g[1],
                    "away_team": g[2],
                    "home_team_id": g[3],
                    "away_team_id": g[4],
                }

                # Obtener roster con join a players
                cur.execute(
                    """
                    SELECT r.team_side, p.player_id, p.team_id, p.number, p.name, p.position
                    FROM game_roster_entries r
                    JOIN players p ON p.player_id = r.player_id
                    WHERE r.game_id = %s
                    ORDER BY r.team_side ASC, p.number NULLS LAST, p.name ASC
                    """,
                    (gameId,)
                )
                rows = cur.fetchall()

        home_players = []
        away_players = []
        for r in rows:
            item = {
                "player_id": r[1],
                "team_id": r[2],
                "number": r[3],
                "name": r[4],
                "position": r[5],
            }
            if r[0] == "HOME":
                home_players.append(item)
            else:
                away_players.append(item)

        # Fallback: si no hay roster en Postgres, consultar a la API por jugadores de HOME/AWAY
        if not home_players and not away_players:
            try:
                import json
                from urllib import request as urlreq

                auth_header = request.headers.get("authorization")
                # Actualizar nombres de equipos desde API para evitar desincronización
                try:
                    g_req = urlreq.Request(f"http://api:8080/api/games/{gameId}")
                    if auth_header:
                        g_req.add_header("Authorization", auth_header)
                    with urlreq.urlopen(g_req, timeout=10) as resp_g:
                        g_data = json.loads(resp_g.read())
                        g_obj = g_data.get("game") if isinstance(g_data, dict) else None
                        if g_obj:
                            game["home_team"] = g_obj.get("HomeTeam") or game["home_team"]
                            game["away_team"] = g_obj.get("AwayTeam") or game["away_team"]
                except Exception as ex_names:
                    print(f"[WARN] Could not refresh game names from API: {ex_names}")

                def fetch_side(side: str):
                    url = f"http://api:8080/api/games/{gameId}/players/{side}"
                    req = urlreq.Request(url)
                    if auth_header:
                        req.add_header("Authorization", auth_header)
                    with urlreq.urlopen(req, timeout=10) as resp:
                        data = resp.read()
                        return json.loads(data)

                home_json = fetch_side("HOME")
                away_json = fetch_side("AWAY")

                def map_player(p: dict):
                    return {
                        "player_id": p.get("PlayerId") or p.get("playerId") or p.get("player_id"),
                        "team_id": p.get("TeamId") or p.get("teamId") or p.get("team_id"),
                        "number": p.get("Number") if p.get("Number") is not None else p.get("number"),
                        "name": p.get("Name") or p.get("name"),
                        "position": p.get("Position") or p.get("position"),
                        "height_cm": p.get("HeightCm") or p.get("heightCm") or p.get("height_cm"),
                        "age": p.get("Age") or p.get("age"),
                        "nationality": p.get("Nationality") or p.get("nationality"),
                    }

                home_players = [map_player(p) for p in (home_json or [])]
                away_players = [map_player(p) for p in (away_json or [])]
            except Exception as ex:
                print(f"[WARN] Fallback API roster fetch failed: {ex}")

        # Obtener logos de equipos desde API si hay IDs
        home_logo_abs = None
        away_logo_abs = None
        try:
            import json
            from urllib import request as urlreq
            auth_header = request.headers.get("authorization")

            def absolute_logo(u: Optional[str]):
                if not u:
                    return None
                s = str(u)
                if s.startswith("http://") or s.startswith("https://"):
                    return s
                if s.startswith("/"):
                    return f"http://api:8080{s}"
                return s

            def team_logo(team_id: Optional[int]):
                if team_id is None:
                    return None
                req = urlreq.Request(f"http://api:8080/api/teams/{team_id}")
                if auth_header:
                    req.add_header("Authorization", auth_header)
                with urlreq.urlopen(req, timeout=10) as resp:
                    tdata = json.loads(resp.read())
                    url = (tdata.get("LogoUrl") or tdata.get("logoUrl") or tdata.get("logo_url")) if isinstance(tdata, dict) else None
                    return absolute_logo(url)

            home_logo_abs = team_logo(game.get("home_team_id"))
            away_logo_abs = team_logo(game.get("away_team_id"))
        except Exception as _:
            pass

        html = render_roster_html(game, home_players, away_players, None, home_logo_abs, away_logo_abs)
        pdf_bytes = await render_html_to_pdf(html)

        today = datetime.now().strftime("%Y%m%d")
        filename = f"reporte-roster-partido-{gameId}-{today}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
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
                    f"SELECT team_id, name, city, logo_url, created_at FROM teams{where_sql} ORDER BY name ASC LIMIT %s OFFSET %s",
                    [*params, limit, offset],
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

# /// <summary>
# /// RF-REP-01: Reporte de equipos en PDF.
# /// </summary>
# /// <remarks>
# /// - Genera PDF con lista de equipos.
# /// - Filtros: q (nombre), city (ciudad).
# /// - Content-Disposition: attachment con nombre descriptivo.
# /// </remarks>
@router.get("/teams.pdf")
async def teams_pdf(
    q: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    _=Depends(require_admin)
):
    print(f"[INFO] Generating teams PDF with filters: q={q}, city={city}")
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
        
        # Generar HTML
        filters = {"q": q, "city": city, "limit": limit, "offset": offset}
        def absolute_logo(url: Optional[str]) -> Optional[str]:
            if not url:
                return None
            u = str(url)
            if u.startswith("http://") or u.startswith("https://"):
                # Si viene con localhost, reescribir al servicio 'api' dentro de la red docker
                return u.replace("http://localhost:8080", "http://api:8080")
            if u.startswith("/"):
                return f"http://api:8080{u}"
            return u
        logo_url = absolute_logo(os.getenv("SYSTEM_LOGO_URL"))
        html = render_teams_html(rows, filters, logo_url)
        
        # Convertir a PDF
        pdf_bytes = await render_html_to_pdf(html)
        
        # Nombre del archivo
        today = datetime.now().strftime("%Y%m%d")
        filename = f"reporte-equipos-{today}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// RF-REP-02: Reporte de jugadores por equipo en PDF.
# /// </summary>
# /// <remarks>
# /// - Genera PDF con roster completo de un equipo.
# /// - Incluye: número, nombre, posición, altura, edad, nacionalidad.
# /// - 404 si el equipo no existe o no tiene jugadores.
# /// </remarks>
@router.get("/teams/{teamId}/players.pdf")
async def players_pdf(
    teamId: int,
    request: Request,
    _=Depends(require_admin)
):
    print(f"[INFO] Generating players PDF for team {teamId}")
    try:
        # 1) Intentar obtener desde API (fuente prioritaria para nombres actuales y campos extendidos)
        api_team_name: Optional[str] = None
        api_team_logo_url: Optional[str] = None
        api_players: Optional[list] = None
        try:
            import json
            from urllib import request as urlreq
            auth_header = request.headers.get("authorization")

            # Nombre del equipo actual desde API
            team_req = urlreq.Request(f"http://api:8080/api/teams/{teamId}")
            if auth_header:
                team_req.add_header("Authorization", auth_header)
            with urlreq.urlopen(team_req, timeout=10) as resp_t:
                tdata = json.loads(resp_t.read())
                if isinstance(tdata, dict):
                    api_team_name = (tdata.get("Name") or tdata.get("name"))
                    api_team_logo_url = (tdata.get("LogoUrl") or tdata.get("logoUrl") or tdata.get("logo_url"))

            # Jugadores del equipo desde API
            players_req = urlreq.Request(f"http://api:8080/api/teams/{teamId}/players")
            if auth_header:
                players_req.add_header("Authorization", auth_header)
            with urlreq.urlopen(players_req, timeout=15) as resp_p:
                pdata = json.loads(resp_p.read())
                api_players = pdata if isinstance(pdata, list) else []
        except Exception as ex_api:
            print(f"[WARN] RF-REP-02 API fallback failed: {ex_api}")

        # 2) Respaldo: Postgres (si API no disponible)
        pg_team_name: Optional[str] = None
        pg_team_logo_url: Optional[str] = None
        pg_rows: list = []
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT name, logo_url FROM teams WHERE team_id = %s", (teamId,))
                    trow = cur.fetchone()
                    if trow:
                        pg_team_name = trow[0]
                        pg_team_logo_url = trow[1]
                    cur.execute(
                        """SELECT player_id, team_id, number, name, position, active, created_at
                               FROM players WHERE team_id = %s ORDER BY number NULLS LAST, name ASC""",
                        (teamId,),
                    )
                    pg_rows = [
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
        except Exception as ex_pg:
            print(f"[WARN] RF-REP-02 PG read failed: {ex_pg}")

        # 3) Elegir fuente: API primero; si no disponible, Postgres
        team_name = api_team_name or pg_team_name
        if not team_name:
            raise HTTPException(status_code=404, detail="Team not found")

        def map_api_player(p: dict):
            return {
                "player_id": p.get("PlayerId") or p.get("playerId") or p.get("player_id"),
                "team_id": p.get("TeamId") or p.get("teamId") or p.get("team_id"),
                "number": p.get("Number") if p.get("Number") is not None else p.get("number"),
                "name": p.get("Name") or p.get("name"),
                "position": p.get("Position") or p.get("position"),
                "active": bool(p.get("Active") if p.get("Active") is not None else p.get("active", True)),
                "created_at": None,
                "height_cm": p.get("HeightCm") or p.get("heightCm") or p.get("height_cm"),
                "age": p.get("Age") or p.get("age"),
                "nationality": p.get("Nationality") or p.get("nationality"),
            }

        rows = [map_api_player(p) for p in (api_players or [])] if api_players is not None else []
        if not rows:
            # usar Postgres sin campos extendidos
            rows = [
                {
                    **r,
                    "height_cm": None,
                    "age": None,
                    "nationality": None,
                }
                for r in pg_rows
            ]
        
        # Generar HTML
        def absolute_logo(url: Optional[str]) -> Optional[str]:
            if not url:
                return None
            u = str(url)
            if u.startswith("http://") or u.startswith("https://"):
                return u
            if u.startswith("/"):
                return f"http://api:8080{u}"
            return u

        team_logo = absolute_logo(api_team_logo_url or pg_team_logo_url)
        # Si no hay logo del equipo, usar logo del sistema a ambos lados
        logo_single = team_logo or os.getenv("SYSTEM_LOGO_URL")
        html = render_players_html(rows, team_name, logo_single)
        
        # Convertir a PDF
        pdf_bytes = await render_html_to_pdf(html)
        
        # Nombre del archivo
        today = datetime.now().strftime("%Y%m%d")
        safe_team_name = team_name.replace(" ", "-").lower()[:20]
        filename = f"reporte-jugadores-{safe_team_name}-{today}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// RF-REP-03: Historial de partidos en PDF.
# /// </summary>
# /// <remarks>
# /// - Genera PDF con historial de partidos.
# /// - Filtros: from (fecha inicio), to (fecha fin), status (estado).
# /// - Muestra marcador final si Status='FINISHED'.
# /// </remarks>
@router.get("/games.pdf")
async def games_pdf(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
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
                    f"""SELECT game_id, home_team, away_team, home_team_id, away_team_id, 
                               quarter, home_score, away_score, status, created_at 
                        FROM games{where_sql} ORDER BY created_at DESC LIMIT %s OFFSET %s""",
                    [*params, limit, offset],
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
        
        # Generar HTML
        filters = {"from": from_, "to": to, "status": status, "limit": limit, "offset": offset}
        def absolute_logo(url: Optional[str]) -> Optional[str]:
            if not url:
                return None
            u = str(url)
            if u.startswith("http://") or u.startswith("https://"):
                return u.replace("http://localhost:8080", "http://api:8080")
            if u.startswith("/"):
                return f"http://api:8080{u}"
            return u
        logo_url = absolute_logo(os.getenv("SYSTEM_LOGO_URL"))
        html = render_games_html(rows, filters, logo_url)
        
        # Convertir a PDF
        pdf_bytes = await render_html_to_pdf(html)
        
        # Nombre del archivo
        today = datetime.now().strftime("%Y%m%d")
        filename = f"reporte-partidos-{today}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format; use ISO 8601 (YYYY-MM-DD or full ISO)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// RF-REP-05: Estadísticas por jugador en PDF (puntos, faltas).
# /// </summary>
# /// <remarks>
# /// - Filtros opcionales: from, to (ISO 8601) contra created_at de game_events.
# /// - Cálculo:
# ///   • points_1/2/3 desde event_type 'POINT_1'|'POINT_2'|'POINT_3' (solo conteos; total_points con ponderación).
# ///   • total_fouls y desglose por foul_type cuando event_type='FOUL'.
# ///   • games_count: cantidad de juegos distintos con eventos del jugador en el rango.
# /// - Requiere JWT con rol ADMIN.
# /// </remarks>
@router.get("/players/{playerId}/stats.pdf")
async def player_stats_pdf(
    playerId: int,
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    _=Depends(require_admin)
):
    try:
        # Parsear fechas si existen
        def parse_dt(s: Optional[str]) -> Optional[datetime]:
            if not s:
                return None
            return datetime.fromisoformat(s)
        dt_from = parse_dt(from_)
        dt_to = parse_dt(to)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Traer datos del jugador y equipo
                cur.execute(
                    """
                    SELECT p.name, p.number, p.position, p.team_id, t.name as team_name
                    FROM players p
                    LEFT JOIN teams t ON t.team_id = p.team_id
                    WHERE p.player_id = %s
                    """,
                    (playerId,)
                )
                prow = cur.fetchone()
                if not prow:
                    raise HTTPException(status_code=404, detail="Player not found")
                player = {
                    "name": prow[0],
                    "number": prow[1],
                    "position": prow[2],
                    "team_id": prow[3],
                    "team_name": prow[4],
                    # Campos extendidos (no replicados en PG por ahora)
                    "height_cm": None,
                    "age": None,
                    "nationality": None,
                }

                # Condiciones de fecha
                where = ["player_id = %s"]
                params = [playerId]
                if dt_from:
                    where.append("created_at >= %s")
                    params.append(dt_from)
                if dt_to:
                    where.append("created_at <= %s")
                    params.append(dt_to)
                where_sql = " WHERE " + " AND ".join(where)

                # Puntos por tipo (por player_id)
                cur.execute(
                    f"""
                    SELECT 
                        SUM(CASE WHEN event_type='POINT_1' THEN 1 ELSE 0 END) AS p1,
                        SUM(CASE WHEN event_type='POINT_2' THEN 1 ELSE 0 END) AS p2,
                        SUM(CASE WHEN event_type='POINT_3' THEN 1 ELSE 0 END) AS p3
                    FROM game_events
                    {where_sql}
                    """,
                    params,
                )
                pcounts = cur.fetchone() or (0,0,0)
                points_1 = int(pcounts[0] or 0)
                points_2 = int(pcounts[1] or 0)
                points_3 = int(pcounts[2] or 0)
                total_points = points_1*1 + points_2*2 + points_3*3

                # Fouls por tipo (por player_id)
                cur.execute(
                    f"""
                    SELECT COALESCE(foul_type,'PERSONAL') AS foul_type, COUNT(*)
                    FROM game_events
                    {where_sql} AND event_type='FOUL'
                    GROUP BY COALESCE(foul_type,'PERSONAL')
                    ORDER BY 1
                    """,
                    params,
                )
                fouls_by_type = [{"foul_type": r[0], "count": int(r[1])} for r in (cur.fetchall() or [])]
                total_fouls = sum(r["count"] for r in fouls_by_type)

                # Juegos distintos con eventos del jugador (por player_id)
                cur.execute(
                    f"""
                    SELECT COUNT(DISTINCT game_id)
                    FROM game_events
                    {where_sql} AND event_type IN ('POINT_1','POINT_2','POINT_3','FOUL')
                    """,
                    params,
                )
                games_count = int((cur.fetchone() or (0,))[0] or 0)

                # Fallback: si no hay datos por player_id, intentar por player_number + pertenencia al equipo
                # Esto cubre el caso cuando API insertó eventos con player_id nulo pero sí player_number
                if total_points == 0 and total_fouls == 0:
                    pnum = player.get("number")
                    team_id = player.get("team_id")
                    if pnum is not None and team_id is not None:
                        # Puntos por tipo usando player_number y que el evento pertenezca al equipo del jugador
                        cur.execute(
                            """
                            SELECT 
                                SUM(CASE WHEN e.event_type='POINT_1' THEN 1 ELSE 0 END) AS p1,
                                SUM(CASE WHEN e.event_type='POINT_2' THEN 1 ELSE 0 END) AS p2,
                                SUM(CASE WHEN e.event_type='POINT_3' THEN 1 ELSE 0 END) AS p3
                            FROM game_events e
                            JOIN games g ON g.game_id = e.game_id
                            WHERE e.player_id IS NULL
                              AND e.player_number = %s
                              AND (
                                   (e.team = 'HOME' AND g.home_team_id = %s) OR
                                   (e.team = 'AWAY' AND g.away_team_id = %s)
                              )
                            """,
                            (pnum, team_id, team_id)
                        )
                        pcounts2 = cur.fetchone() or (0,0,0)
                        points_1 = int(pcounts2[0] or 0)
                        points_2 = int(pcounts2[1] or 0)
                        points_3 = int(pcounts2[2] or 0)
                        total_points = points_1*1 + points_2*2 + points_3*3

                        # Faltas por tipo por número
                        cur.execute(
                            """
                            SELECT COALESCE(e.foul_type,'PERSONAL') AS foul_type, COUNT(*)
                            FROM game_events e
                            JOIN games g ON g.game_id = e.game_id
                            WHERE e.event_type='FOUL'
                              AND e.player_id IS NULL
                              AND e.player_number = %s
                              AND (
                                   (e.team = 'HOME' AND g.home_team_id = %s) OR
                                   (e.team = 'AWAY' AND g.away_team_id = %s)
                              )
                            GROUP BY COALESCE(e.foul_type,'PERSONAL')
                            ORDER BY 1
                            """,
                            (pnum, team_id, team_id)
                        )
                        fouls_by_type = [{"foul_type": r[0], "count": int(r[1])} for r in (cur.fetchall() or [])]
                        total_fouls = sum(r["count"] for r in fouls_by_type)

                        # Juegos distintos con esos eventos
                        cur.execute(
                            """
                            SELECT COUNT(DISTINCT e.game_id)
                            FROM game_events e
                            JOIN games g ON g.game_id = e.game_id
                            WHERE e.player_id IS NULL
                              AND e.player_number = %s
                              AND e.event_type IN ('POINT_1','POINT_2','POINT_3','FOUL')
                              AND (
                                   (e.team = 'HOME' AND g.home_team_id = %s) OR
                                   (e.team = 'AWAY' AND g.away_team_id = %s)
                              )
                            """,
                            (pnum, team_id, team_id)
                        )
                        games_count = int((cur.fetchone() or (0,))[0] or 0)

        filters = {"from": from_, "to": to}
        # No logo for RF-REP-05 as requested
        html = render_player_stats_html(player, {
            "total_points": total_points,
            "points_1": points_1,
            "points_2": points_2,
            "points_3": points_3,
            "total_fouls": total_fouls,
            "fouls_by_type": fouls_by_type,
            "games_count": games_count,
        }, filters, None)

        pdf_bytes = await render_html_to_pdf(html)
        today = datetime.now().strftime("%Y%m%d")
        safe_name = (player.get("name") or "jugador").replace(" ", "-").lower()[:24]
        filename = f"reporte-stats-jugador-{safe_name}-{today}.pdf"
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format; use ISO 8601 (YYYY-MM-DD or full ISO)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(router)
