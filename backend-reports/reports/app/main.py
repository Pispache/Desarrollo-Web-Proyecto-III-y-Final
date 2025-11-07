"""
@summary Microservicio de Reportes (FastAPI).
@remarks
- Expone endpoints JSON y PDF bajo el prefijo `/v1/reports`.\
- Protege rutas sensibles con validación de JWT/rol ADMIN.\
- Se integra con el generador de PDFs (`pdf-renderer`) y con PostgreSQL para consultas.
"""
import os
import base64
import mimetypes
from typing import Optional
from datetime import datetime
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, Request, Body, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import httpx
from .security.auth import require_admin, require_user_or_admin
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

# Base URLs parametrizables para servicios externos
# En Docker: API_BASE_URL=http://api:8080, UI_BASE_URL=http://ui:4200
# En local:  API_BASE_URL=http://localhost:8080, UI_BASE_URL=http://localhost:4200
API_BASE_URL = os.getenv("API_BASE_URL", "http://api:8080")
UI_BASE_URL = os.getenv("UI_BASE_URL", "http://ui:4200")
LOCALHOST_API = "http://localhost:8080"
ETL_SYNC_URL = os.getenv("ETL_SYNC_URL", "http://etl:5010")
ETL_HTTP_TOKEN = os.getenv("ETL_HTTP_TOKEN", "")

async def etl_presync(scopes: str = "games,game_events", game_id: int | None = None, timeout: float = 5.0) -> bool:
    if not ETL_SYNC_URL:
        return False
    try:
        params = {"scope": scopes}
        if game_id is not None:
            params["game_id"] = game_id
        headers = {}
        if ETL_HTTP_TOKEN:
            headers["Authorization"] = f"Bearer {ETL_HTTP_TOKEN}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{ETL_SYNC_URL}/sync", params=params, headers=headers)
            return resp.status_code == 200
    except Exception as _:
        return False

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
# CORS por entorno: usar lista blanca de CORS_ALLOWED_ORIGINS (separados por coma).
# En desarrollo, permitir localhost; en producción, si no hay lista, usar UI_BASE_URL como fallback.
ENV = (os.getenv("ENV") or os.getenv("NODE_ENV") or "development").lower()
allowed = [o.strip() for o in (os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")) if o.strip()]
if not allowed:
    if ENV == "production":
        allowed = [UI_BASE_URL]
    else:
        allowed = ["http://localhost:4200", "http://127.0.0.1:4200"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
# /// Guarda/lee el bracket (eliminación directa) por torneo en Postgres.
# /// </summary>
# /// Tabla: tournament_brackets(tournament_id PK, data JSONB, updated_at TIMESTAMP)

def _ensure_brackets_table(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tournament_brackets (
            tournament_id INTEGER PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        """
    )

@router.get("/tournaments/{tid}/bracket")
def get_bracket(tid: int, _=Depends(require_user_or_admin)):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                _ensure_brackets_table(cur)
                cur.execute("SELECT data FROM tournament_brackets WHERE tournament_id = %s", (tid,))
                row = cur.fetchone()
                return row[0] if row else {"roundOf16": [], "quarterfinals": [], "semifinals": [], "final": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/tournaments/{tid}/bracket")
def put_bracket(tid: int, body: dict = Body(...), _=Depends(require_admin)):
    try:
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Invalid bracket payload")
        # Validación: permitir que un equipo avance (aparezca en distintas fases),
        # pero NO duplicado dentro de la misma fase; y nunca local==visita en un match
        def validate_phase(arr, label: str):
            ids = []
            if isinstance(arr, list):
                for m in arr:
                    if isinstance(m, dict):
                        h = m.get("homeTeamId")
                        a = m.get("awayTeamId")
                        if h is not None and a is not None and h == a:
                            raise HTTPException(status_code=400, detail=f"Same team on both sides in {label}")
                        if isinstance(h, int):
                            ids.append(h)
                        if isinstance(a, int):
                            ids.append(a)
            # Duplicados dentro de la fase
            ids = [x for x in ids if isinstance(x, int)]
            if len(set(ids)) != len(ids):
                raise HTTPException(status_code=400, detail=f"A team cannot appear more than once in {label}")

        validate_phase(body.get("roundOf16"), "Round of 16")
        validate_phase(body.get("quarterfinals"), "Quarterfinals")
        validate_phase(body.get("semifinals"), "Semifinals")
        validate_phase(body.get("final"), "Final")
        with get_connection() as conn:
            with conn.cursor() as cur:
                _ensure_brackets_table(cur)
                cur.execute(
                    """
                    INSERT INTO tournament_brackets (tournament_id, data, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (tournament_id)
                    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
                    """,
                    (tid, body),
                )
                conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Actualiza el nombre de un torneo (rename).
# /// </summary>
# /// <remarks>
# /// - PATCH /v1/reports/tournaments/{id}
# /// - Body: { name: string }
# /// - 409 si el nombre ya existe.
# /// </remarks>
@router.patch("/tournaments/{tid}")
def update_tournament(tid: int, body: dict = Body(...), _=Depends(require_admin)):
    try:
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name is required")
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS tournaments (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(150) NOT NULL UNIQUE,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                try:
                    cur.execute("UPDATE tournaments SET name = %s WHERE id = %s", (name, tid))
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=404, detail="Tournament not found")
                    conn.commit()
                except Exception as ex:
                    conn.rollback()
                    msg = str(ex)
                    if "23505" in msg or "unique" in msg.lower():
                        raise HTTPException(status_code=409, detail="Tournament name already exists")
                    raise
        return {"id": tid, "name": name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Elimina un torneo.
# /// </summary>
# /// <remarks>
# /// - DELETE /v1/reports/tournaments/{id}
# /// - 204 si elimina; 404 si no existe.
# /// </remarks>
@router.delete("/tournaments/{tid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tournament(tid: int, _=Depends(require_admin)):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM tournaments WHERE id = %s", (tid,))
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Tournament not found")
                conn.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Lista torneos almacenados en Postgres.
# /// </summary>
# /// <remarks>
# /// - GET /v1/reports/tournaments
# /// - Seguridad: requiere ADMIN.
# /// - Devuelve: [{ id, name, created_at }]
# /// </remarks>
@router.get("/tournaments")
def list_tournaments(_=Depends(require_user_or_admin)):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS tournaments (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(150) NOT NULL UNIQUE,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                cur.execute("SELECT id, name, created_at FROM tournaments ORDER BY created_at DESC, id DESC")
                rows = cur.fetchall() or []
                return [
                    {"id": int(r[0]), "name": r[1], "created_at": (r[2].isoformat() if r[2] else None)}
                    for r in rows
                ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Crea un torneo en Postgres.
# /// </summary>
# /// <remarks>
# /// - POST /v1/reports/tournaments
# /// - Body: { name: string }
# /// - Seguridad: requiere ADMIN.
# /// - Efecto: asegura tabla 'tournaments' y crea un registro único por nombre.
# /// </remarks>
@router.post("/tournaments", status_code=status.HTTP_201_CREATED)
def create_tournament(
    body: dict = Body(...),
    _=Depends(require_admin)
):
    try:
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name is required")

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Ensure table exists (id serial, unique name)
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS tournaments (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(150) NOT NULL UNIQUE,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                # Try insert
                try:
                    cur.execute(
                        "INSERT INTO tournaments(name) VALUES(%s) RETURNING id",
                        (name,),
                    )
                    tid = int(cur.fetchone()[0])
                    conn.commit()
                    return {"id": tid, "name": name}
                except Exception as ex:
                    # Unique violation handling (SQLSTATE 23505)
                    msg = str(ex)
                    conn.rollback()
                    if "23505" in msg or "unique" in msg.lower():
                        raise HTTPException(status_code=409, detail="Tournament name already exists")
                    raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Actualiza el estado de un partido (demo). Permite marcarlo como FINISHED para que RF-REP-03 lo muestre finalizado.
# /// </summary>
# /// <remarks>
# /// - POST /v1/reports/games/{gameId}/status
# /// - Body: { status: SCHEDULED|IN_PROGRESS|FINISHED, quarter?: int, home_score?: int, away_score?: int }
# /// - Seguridad: requiere ADMIN.
# /// </remarks>
@router.post("/games/{gameId}/status")
def update_game_status(
    gameId: int,
    body: dict = Body(...),
    _=Depends(require_admin)
):
    try:
        status_val = str(body.get("status") or "").upper().strip()
        allowed = {"SCHEDULED", "IN_PROGRESS", "FINISHED"}
        if status_val not in allowed:
            raise HTTPException(status_code=400, detail=f"status must be one of {sorted(allowed)}")
        quarter = body.get("quarter")
        home_score = body.get("home_score")
        away_score = body.get("away_score")

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT game_id FROM games WHERE game_id = %s", (gameId,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Game not found")

                sets = ["status = %s"]
                params = [status_val]
                if isinstance(quarter, int):
                    sets.append("quarter = %s")
                    params.append(quarter)
                if isinstance(home_score, int):
                    sets.append("home_score = %s")
                    params.append(home_score)
                if isinstance(away_score, int):
                    sets.append("away_score = %s")
                    params.append(away_score)
                params.append(gameId)

                cur.execute(f"UPDATE games SET {', '.join(sets)} WHERE game_id = %s", params)
                conn.commit()

        return {"game_id": gameId, "status": status_val, "updated": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# /// <summary>
# /// Captura de eventos/puntos en un partido (demo en Report-Service).
# /// </summary>
# /// <remarks>
# /// - POST /v1/reports/games/{gameId}/events
# /// - Body: { event_type: POINT_1|POINT_2|POINT_3|FOUL|FOUL_*, team: HOME|AWAY, quarter: int, player_id?: int, player_number?: int }
# /// - Efecto colateral: si event_type es POINT_1/2/3, actualiza marcador en games.
# /// - Seguridad: requiere ADMIN.
# /// </remarks>
@router.post("/games/{gameId}/events", status_code=status.HTTP_201_CREATED)
def create_game_event(
    gameId: int,
    body: dict = Body(...),
    _=Depends(require_admin)
):
    try:
        event_type = str(body.get("event_type") or body.get("type") or "").upper().strip()
        team = str(body.get("team") or "").upper().strip()
        quarter = int(body.get("quarter") or 1)
        player_id = body.get("player_id") or body.get("playerId")
        player_number = body.get("player_number") or body.get("playerNumber")

        if team not in ("HOME", "AWAY"):
            raise HTTPException(status_code=400, detail="team must be HOME or AWAY")
        if quarter < 1:
            raise HTTPException(status_code=400, detail="quarter must be >= 1")
        if not event_type:
            raise HTTPException(status_code=400, detail="event_type is required")
        if player_id is None and player_number is None:
            raise HTTPException(status_code=400, detail="Provide player_id or player_number")

        # Puntos por tipo
        pts_map = {"POINT_1": 1, "POINT_2": 2, "POINT_3": 3}
        add_points = pts_map.get(event_type, 0)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Validar que el juego exista
                cur.execute("SELECT game_id FROM games WHERE game_id = %s", (gameId,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Game not found")

                # Generar event_id simple (max+1)
                cur.execute("SELECT COALESCE(MAX(event_id),0)+1 FROM game_events")
                next_id = int(cur.fetchone()[0])

                cur.execute(
                    """
                    INSERT INTO game_events (event_id, game_id, quarter, team, event_type, player_number, player_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (next_id, gameId, quarter, team, event_type, player_number, player_id)
                )

                # Si es puntos, actualizar marcador
                if add_points:
                    if team == "HOME":
                        cur.execute("UPDATE games SET home_score = home_score + %s WHERE game_id = %s", (add_points, gameId))
                    else:
                        cur.execute("UPDATE games SET away_score = away_score + %s WHERE game_id = %s", (add_points, gameId))

                conn.commit()

        return {
            "event_id": next_id,
            "game_id": gameId,
            "event_type": event_type,
            "team": team,
            "quarter": quarter,
            "player_id": player_id,
            "player_number": player_number,
            "points_added": add_points,
        }
    except HTTPException:
        raise
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
        # Pre-sync on-demand sólo para este partido
        try:
            await etl_presync("games,game_events", game_id=gameId, timeout=5.0)
        except Exception:
            pass
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
                "fouls": 0,
                "side": r[0],
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
                    g_req = urlreq.Request(f"{API_BASE_URL}/api/games/{gameId}")
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
                    url = f"{API_BASE_URL}/api/games/{gameId}/players/{side}"
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

        # Contabilizar faltas por jugador en este partido
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    # Por player_id (insensible a mayúsculas y permitiendo prefijos FOUL_*)
                    cur.execute(
                        """
                        SELECT player_id, COUNT(*)
                        FROM game_events
                        WHERE game_id = %s AND UPPER(event_type) LIKE 'FOUL%%' AND player_id IS NOT NULL
                        GROUP BY player_id
                        """,
                        (gameId,)
                    )
                    foul_by_pid = {int(r[0]): int(r[1]) for r in (cur.fetchall() or [])}
                    # Fallback por número y lado cuando player_id sea nulo (insensible a mayúsculas)
                    cur.execute(
                        """
                        SELECT player_number, UPPER(team) AS team_up, COUNT(*)
                        FROM game_events
                        WHERE game_id = %s AND UPPER(event_type) LIKE 'FOUL%%' AND player_id IS NULL AND player_number IS NOT NULL
                        GROUP BY player_number, UPPER(team)
                        """,
                        (gameId,)
                    )
                    foul_by_num_side = {}
                    for rr in (cur.fetchall() or []):
                        key = (int(rr[0]), str(rr[1]))
                        foul_by_num_side[key] = int(rr[2])
            try:
                print(f"[DEBUG] fouls by player_id: {foul_by_pid}")
                print(f"[DEBUG] fouls by (number,side): {foul_by_num_side}")
            except Exception:
                pass

            def apply_fouls(lst, side_label):
                for p in lst:
                    pid = p.get("player_id")
                    num = p.get("number")
                    fouls = 0
                    if pid is not None and pid in foul_by_pid:
                        fouls = foul_by_pid[pid]
                    elif num is not None:
                        fouls = foul_by_num_side.get((int(num), side_label.upper()), 0)
                    # Guardar None cuando no tenga faltas para que la vista muestre NA
                    p["fouls"] = fouls if fouls > 0 else None

            apply_fouls(home_players, "HOME")
            apply_fouls(away_players, "AWAY")
            try:
                for p in home_players + away_players:
                    print(f"[DEBUG] player {p.get('name')} #{p.get('number')} pid={p.get('player_id')} side={p.get('side')} fouls={p.get('fouls')}")
            except Exception:
                pass
        except Exception as ex_fouls:
            print(f"[WARN] Could not compute fouls per player for game {gameId}: {ex_fouls}")

        # Obtener logos de equipos desde API si hay IDs y embeberlos como data URI
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
                    return f"{API_BASE_URL}{s}"
                return s

            def team_logo(team_id: Optional[int]):
                if team_id is None:
                    return None
                req = urlreq.Request(f"{API_BASE_URL}/api/teams/{team_id}")
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

        # Normalizar logos a URLs absolutas como en RE-02/03
        def normalize_logo_url(u: Optional[str]) -> Optional[str]:
            if not u:
                return None
            s = str(u)
            if s.startswith("http://") or s.startswith("https://"):
                return s.replace(LOCALHOST_API, API_BASE_URL)
            if not s.startswith("/"):
                s = "/" + s
            # intentar primero API
            api_url = f"{API_BASE_URL}{s}"
            # como fallback, UI
            ui_url = f"{UI_BASE_URL}{s}"
            # no verificamos existencia aquí; dejamos al renderer resolver
            return api_url or ui_url

        home_logo_abs = normalize_logo_url(home_logo_abs)
        away_logo_abs = normalize_logo_url(away_logo_abs)

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
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
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
    request: Request,
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
        # Fallback a API si no hay jugadores en Postgres
        if not rows:
            try:
                import json
                from urllib import request as urlreq
                token = os.getenv("REPORTS_BEARER_TOKEN")
                req = urlreq.Request(f"{API_BASE_URL}/api/teams/{teamId}/players")
                # Preferir el Authorization recibido del cliente; si no, usar REPORTS_BEARER_TOKEN
                auth_header = request.headers.get("authorization")
                if auth_header:
                    req.add_header("Authorization", auth_header)
                elif token:
                    req.add_header("Authorization", f"Bearer {token}")
                with urlreq.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read())
                    items = data.get("items") or data
                    if isinstance(items, list):
                        def map_player(p: dict) -> dict:
                            return {
                                "player_id": p.get("PlayerId") or p.get("playerId") or p.get("player_id"),
                                "team_id": p.get("TeamId") or p.get("teamId") or p.get("team_id"),
                                "number": p.get("Number") if p.get("Number") is not None else p.get("number"),
                                "name": p.get("Name") or p.get("name"),
                                "position": p.get("Position") or p.get("position"),
                                "active": bool(p.get("Active") if p.get("Active") is not None else p.get("active", True)),
                                "created_at": None,
                            }
                        rows = [map_player(p) for p in items]
            except Exception:
                pass
        if not rows:
            # Devolver lista vacía en lugar de 404 para que la UI pueda seguir funcionando
            return {"items": []}
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
            # Comparación case-insensitive
            where.append("UPPER(status) = %s")
            params.append(str(status).upper())
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

        # Fallback: si no hay filas en Postgres, intentar leer desde la API principal
        if not rows:
            try:
                import json
                from urllib import request as urlreq
                auth_header = None
                # No tenemos Request aquí; permitir prueba manual agregando JWT via env (opcional)
                token = os.getenv("REPORTS_BEARER_TOKEN")
                req = urlreq.Request(f"{API_BASE_URL}/api/games")
                if token:
                    req.add_header("Authorization", f"Bearer {token}")
                with urlreq.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read())
                    items = data.get("games") or data.get("items") or data
                    if isinstance(items, list):
                        def map_game(g: dict) -> dict:
                            return {
                                "game_id": g.get("GameId") or g.get("gameId") or g.get("id"),
                                "home_team": g.get("HomeTeam") or g.get("homeTeam"),
                                "away_team": g.get("AwayTeam") or g.get("awayTeam"),
                                "home_team_id": g.get("HomeTeamId") or g.get("homeTeamId"),
                                "away_team_id": g.get("AwayTeamId") or g.get("awayTeamId"),
                                "quarter": g.get("Quarter") or g.get("quarter"),
                                "home_score": g.get("HomeScore") or g.get("homeScore"),
                                "away_score": g.get("AwayScore") or g.get("awayScore"),
                                "status": g.get("Status") or g.get("status"),
                                "created_at": g.get("CreatedAt") or g.get("createdAt"),
                            }
                        rows = [map_game(g) for g in items]
            except Exception as _:
                pass
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
    request: Request,
    q: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    cities: Optional[str] = Query(None, alias="cities"),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    _=Depends(require_admin)
):
    print(f"[INFO] Generating teams PDF with filters: q={q}, city={city}")
    try:
        where = []
        params = []
        # Permitir alias 'cities' para filtrar por ciudad, manteniendo compatibilidad
        effective_city = city or cities
        if q:
            where.append("(name ILIKE %s)")
            params.append(f"%{q}%")
        if effective_city:
            where.append("(city ILIKE %s)")
            params.append(f"%{effective_city}%")
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
        filters = {"q": q, "city": effective_city, "limit": limit, "offset": offset}
        def absolute_logo(url: Optional[str]) -> Optional[str]:
            if not url:
                return None
            u = str(url)
            if u.startswith("http://") or u.startswith("https://"):
                # Si viene con localhost, reescribir a la API configurada
                return u.replace(LOCALHOST_API, API_BASE_URL)
            # Tratar rutas relativas sin slash como raíz
            if not u.startswith("/"):
                u = "/" + u
            # Preferir API; algunas instalaciones sirven estáticos desde la UI
            return f"{API_BASE_URL}{u}"
        # Embebido definitivo de logos como data URI (carpeta de estáticos)
        def build_candidates(u: Optional[str]) -> list:
            if not u:
                return []
            s = str(u)
            # Si viene solo el nombre, asumir carpeta uploads/logos
            if '/' not in s and not s.startswith('http'):
                s = f"/uploads/logos/{s}"
            if not s.startswith('http'):
                if not s.startswith('/'):
                    s = '/' + s
                return [f"{API_BASE_URL}{s}", f"{UI_BASE_URL}{s}"]
            # Absoluta
            return [s.replace(LOCALHOST_API, API_BASE_URL)]

        def fetch_data_uri(url_like: Optional[str]) -> Optional[str]:
            try:
                from urllib import request as urlreq
                import base64, mimetypes, json
                auth_header = request.headers.get("authorization")
                for target in build_candidates(url_like):
                    try:
                        req = urlreq.Request(target)
                        if auth_header:
                            req.add_header("Authorization", auth_header)
                        with urlreq.urlopen(req, timeout=10) as resp:
                            ctype_hdr = resp.headers.get_content_type() or ""
                            data = resp.read()
                            # Si el endpoint devuelve JSON, intentar resolver URL anidada del archivo
                            if "json" in ctype_hdr.lower():
                                try:
                                    obj = json.loads(data)
                                    # Explorar campos comunes que puedan contener la URL del archivo
                                    candidates = []
                                    if isinstance(obj, dict):
                                        for k in [
                                            "url","Url","URL","fileUrl","FileUrl","href","logoUrl","logo_url","path","Path"
                                        ]:
                                            v = obj.get(k)
                                            if isinstance(v, str):
                                                candidates.append(v)
                                    # También si el JSON es una lista con primer elemento string
                                    if isinstance(obj, list) and obj and isinstance(obj[0], str):
                                        candidates.append(obj[0])
                                    # Intentar descargar la primera candidata válida
                                    for inner in candidates:
                                        inner_targets = build_candidates(inner)
                                        for it in inner_targets:
                                            try:
                                                ireq = urlreq.Request(it)
                                                if auth_header:
                                                    ireq.add_header("Authorization", auth_header)
                                                with urlreq.urlopen(ireq, timeout=10) as iresp:
                                                    idata = iresp.read()
                                                    ictype = iresp.headers.get_content_type() or mimetypes.guess_type(it)[0] or "image/png"
                                                    return f"data:{ictype};base64,{base64.b64encode(idata).decode('ascii')}"
                                            except Exception:
                                                continue
                                except Exception:
                                    pass
                            # Caso normal: contenido binario de imagen
                            ctype = ctype_hdr or mimetypes.guess_type(target)[0] or "image/png"
                            return f"data:{ctype};base64,{base64.b64encode(data).decode('ascii')}"
                    except Exception:
                        continue
                return None
            except Exception:
                return None

        rows = [
            {**r, "logo_url": (fetch_data_uri(r.get("logo_url")) or r.get("logo_url"))}
            for r in rows
        ]
        # Logo de encabezado con fallback del sistema
        sys_logo = os.getenv("SYSTEM_LOGO_URL")
        logo_url = fetch_data_uri(sys_logo) or absolute_logo(sys_logo)
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
        def normalize_logo_url(u: Optional[str]) -> Optional[str]:
            if not u:
                return None
            s = str(u)
            if s.startswith("http://") or s.startswith("https://"):
                return s.replace("http://localhost:8080", "http://api:8080")
            if not s.startswith("/"):
                s = "/" + s
            # Preferir API; como fallback, UI
            return f"http://api:8080{s}"  # el renderer puede resolver UI si necesario

        team_logo = normalize_logo_url(api_team_logo_url or pg_team_logo_url)
        # Si no hay logo del equipo, usar logo del sistema
        system_logo = normalize_logo_url(os.getenv("SYSTEM_LOGO_URL"))
        logo_single = team_logo or system_logo
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
        # Si el filtro pide juegos en curso, realizar sync rápido global
        if status and str(status).upper() == "IN_PROGRESS":
            try:
                await etl_presync("games,game_events", game_id=None, timeout=5.0)
            except Exception:
                pass
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
                    f"""
                        SELECT g.game_id, g.home_team, g.away_team, g.home_team_id, g.away_team_id,
                               g.quarter, g.home_score, g.away_score, g.status, g.created_at,
                               th.logo_url AS home_logo_url, ta.logo_url AS away_logo_url
                        FROM games g
                        LEFT JOIN teams th ON th.team_id = g.home_team_id
                        LEFT JOIN teams ta ON ta.team_id = g.away_team_id
                        {where_sql}
                        ORDER BY g.created_at DESC
                        LIMIT %s OFFSET %s
                    """,
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
                        "home_logo_url": r[10],
                        "away_logo_url": r[11],
                    }
                    for r in cur.fetchall()
                ]

        # Fallback: si no hay filas, intentar recoger desde API principal
        if not rows:
            try:
                import json
                from urllib import request as urlreq
                token = os.getenv("REPORTS_BEARER_TOKEN")
                url = "http://api:8080/api/games"
                # Si hay filtros de status/fecha, aplicarlos luego por software
                req = urlreq.Request(url)
                if token:
                    req.add_header("Authorization", f"Bearer {token}")
                with urlreq.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read())
                    items = data.get("games") or data.get("items") or data
                    if isinstance(items, list):
                        def to_dt(x):
                            try:
                                return datetime.fromisoformat(x)
                            except Exception:
                                return None
                        def match_filters(g: dict) -> bool:
                            if status:
                                s = (g.get("Status") or g.get("status") or "").upper()
                                if s != str(status).upper():
                                    return False
                            created = to_dt(g.get("CreatedAt") or g.get("createdAt") or "")
                            if dt_from and (not created or created < dt_from):
                                return False
                            if dt_to and (not created or created > dt_to):
                                return False
                            return True
                        mapped = []
                        for g in items:
                            if not match_filters(g):
                                continue
                            mapped.append({
                                "game_id": g.get("GameId") or g.get("gameId") or g.get("id"),
                                "home_team": g.get("HomeTeam") or g.get("homeTeam"),
                                "away_team": g.get("AwayTeam") or g.get("awayTeam"),
                                "home_team_id": g.get("HomeTeamId") or g.get("homeTeamId"),
                                "away_team_id": g.get("AwayTeamId") or g.get("awayTeamId"),
                                "quarter": g.get("Quarter") or g.get("quarter"),
                                "home_score": g.get("HomeScore") or g.get("homeScore"),
                                "away_score": g.get("AwayScore") or g.get("awayScore"),
                                "status": g.get("Status") or g.get("status"),
                                "created_at": g.get("CreatedAt") or g.get("createdAt"),
                                "home_logo_url": None,
                                "away_logo_url": None,
                            })
                        rows = mapped
            except Exception:
                pass
        
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
        # Normalizar logos por equipo en cada fila
        def norm_row(row: dict) -> dict:
            return {
                **row,
                "home_logo_url": absolute_logo(row.get("home_logo_url")),
                "away_logo_url": absolute_logo(row.get("away_logo_url")),
            }
        rows = [norm_row(r) for r in rows]
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
                # Si no existe en Postgres, usar datos mínimos y continuar (stats saldrán en 0 si no hay eventos)
                if not prow:
                    player = {
                        "name": f"Player {playerId}",
                        "number": None,
                        "position": None,
                        "team_id": None,
                        "team_name": None,
                        "height_cm": None,
                        "age": None,
                        "nationality": None,
                    }
                else:
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

        # Logo para el encabezado: intentar con logo del equipo; si no, usar logo del sistema
        def normalize_logo_url(u: Optional[str]) -> Optional[str]:
            if not u:
                return None
            s = str(u)
            if s.startswith("http://") or s.startswith("https://"):
                return s.replace("http://localhost:8080", "http://api:8080")
            if not s.startswith("/"):
                s = "/" + s
            return f"http://api:8080{s}"
        team_logo_url = None
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT logo_url FROM teams WHERE team_id = %s", (player.get("team_id"),))
                    trow2 = cur.fetchone()
                    if trow2 and trow2[0]:
                        team_logo_url = normalize_logo_url(trow2[0])
        except Exception:
            pass
        system_logo = normalize_logo_url(os.getenv("SYSTEM_LOGO_URL"))

        filters = {"from": from_, "to": to}
        html = render_player_stats_html(player, {
            "total_points": total_points,
            "points_1": points_1,
            "points_2": points_2,
            "points_3": points_3,
            "total_fouls": total_fouls,
            "fouls_by_type": fouls_by_type,
            "games_count": games_count,
        }, filters, team_logo_url or system_logo)

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
