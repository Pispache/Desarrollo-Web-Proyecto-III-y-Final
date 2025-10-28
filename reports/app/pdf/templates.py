"""
Templates HTML para generación de reportes PDF.
Utiliza estilos inline para compatibilidad con Puppeteer.
"""

from datetime import datetime
from typing import List, Dict, Optional

def get_base_styles() -> str:
    """Estilos CSS base para todos los reportes."""
    return """
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #333;
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 3px solid #667eea;
        }
        .header-logo {
            max-width: 80px;
            max-height: 80px;
            margin-bottom: 10px;
        }
        .header-title {
            font-size: 24pt;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .header-subtitle {
            font-size: 14pt;
            color: #666;
            margin-bottom: 10px;
        }
        .header-meta {
            font-size: 10pt;
            color: #999;
        }
        .filters {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }
        .filters-title {
            font-weight: bold;
            margin-bottom: 8px;
            color: #667eea;
        }
        .filter-item {
            display: inline-block;
            margin-right: 20px;
            font-size: 10pt;
        }
        .filter-label {
            font-weight: 600;
            color: #555;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 10pt;
        }
        thead {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        th {
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #667eea;
        }
        td {
            padding: 10px 8px;
            border: 1px solid #ddd;
        }
        tbody tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tbody tr:hover {
            background-color: #e9ecef;
        }
        .text-center {
            text-align: center;
        }
        .text-right {
            text-align: right;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 9pt;
            font-weight: 600;
        }
        .badge-success {
            background-color: #28a745;
            color: white;
        }
        .badge-warning {
            background-color: #ffc107;
            color: #333;
        }
        .badge-danger {
            background-color: #dc3545;
            color: white;
        }
        .badge-info {
            background-color: #17a2b8;
            color: white;
        }
        .badge-secondary {
            background-color: #6c757d;
            color: white;
        }
        .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 2px solid #ddd;
            text-align: center;
            font-size: 9pt;
            color: #999;
        }
        .logo-mini {
            max-width: 30px;
            max-height: 30px;
            vertical-align: middle;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #999;
            font-style: italic;
        }
    </style>
    """

def render_teams_html(teams: List[Dict], filters: Dict, logo_url: Optional[str] = None) -> str:
    """Genera HTML para reporte de equipos."""
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    # Construir filtros aplicados
    filters_html = ""
    if filters.get("q"):
        filters_html += f'<span class="filter-item"><span class="filter-label">Búsqueda:</span> {filters["q"]}</span>'
    if filters.get("city"):
        filters_html += f'<span class="filter-item"><span class="filter-label">Ciudad:</span> {filters["city"]}</span>'
    if not filters_html:
        filters_html = '<span class="filter-item">Sin filtros aplicados</span>'
    
    # Construir filas de tabla
    rows_html = ""
    if teams:
        for idx, team in enumerate(teams, 1):
            logo_cell = ""
            if team.get("logo_url"):
                logo_cell = f'<img src="{team["logo_url"]}" class="logo-mini" alt="Logo">'
            
            rows_html += f"""
            <tr>
                <td class="text-center">{idx}</td>
                <td class="text-center">{logo_cell}</td>
                <td>{team.get("name", "N/A")}</td>
                <td>{team.get("city", "N/A")}</td>
                <td class="text-center">{team.get("created_at", "N/A")[:10] if team.get("created_at") else "N/A"}</td>
            </tr>
            """
    else:
        rows_html = '<tr><td colspan="5" class="no-data">No se encontraron equipos</td></tr>'
    
    logo_img = f'<img src="{logo_url}" class="header-logo" alt="Logo">' if logo_url else ""
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        {get_base_styles()}
    </head>
    <body>
        <div class="header">
            {logo_img}
            <div class="header-title">Reporte de Equipos</div>
            <div class="header-subtitle">Sistema de Marcador de Baloncesto</div>
            <div class="header-meta">Generado el {now}</div>
        </div>
        
        <div class="filters">
            <div class="filters-title">Filtros Aplicados</div>
            {filters_html}
        </div>
        
        <table>
            <thead>
                <tr>
                    <th class="text-center" style="width: 8%;">#</th>
                    <th class="text-center" style="width: 10%;">Logo</th>
                    <th style="width: 40%;">Nombre</th>
                    <th style="width: 30%;">Ciudad</th>
                    <th class="text-center" style="width: 12%;">Fecha Registro</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
        
        <div class="footer">
            Total de equipos: {len(teams)} | Marcador BB &copy; 2025
        </div>
    </body>
    </html>
    """
    return html

def render_player_stats_html(player: Dict, stats: Dict, filters: Dict, logo_url: Optional[str] = None) -> str:
    """Genera HTML para reporte de estadísticas por jugador.
    Espera:
      - player: { name, number, team_name, position, height_cm, age, nationality }
      - stats: {
          total_points, points_1, points_2, points_3,
          total_fouls, fouls_by_type: [{ foul_type, count }],
          games_count
        }
      - filters: { from, to }
    """
    now = datetime.now().strftime("%d/%m/%Y %H:%M")

    # Filtros
    filters_html = ""
    if filters.get("from"):
        filters_html += f'<span class="filter-item"><span class="filter-label">Desde:</span> {filters["from"]}</span>'
    if filters.get("to"):
        filters_html += f'<span class="filter-item"><span class="filter-label">Hasta:</span> {filters["to"]}</span>'
    if not filters_html:
        filters_html = '<span class="filter-item">Sin filtros aplicados</span>'

    # Encabezado de jugador
    meta_rows = []
    if player.get("number") is not None:
        meta_rows.append(f"<strong>Número:</strong> {player['number']}")
    if player.get("team_name"):
        meta_rows.append(f"<strong>Equipo:</strong> {player['team_name']}")
    if player.get("position"):
        meta_rows.append(f"<strong>Posición:</strong> {player['position']}")
    if player.get("height_cm") is not None:
        meta_rows.append(f"<strong>Estatura:</strong> {player['height_cm']} cm")
    if player.get("age") is not None:
        meta_rows.append(f"<strong>Edad:</strong> {player['age']}")
    if player.get("nationality"):
        meta_rows.append(f"<strong>Nacionalidad:</strong> {player['nationality']}")
    meta_html = " | ".join(meta_rows) if meta_rows else ""

    # Tabla de totales de puntos
    points_html = f"""
    <table>
      <thead>
        <tr>
          <th class='text-center' style='width:20%'>Tot. Puntos</th>
          <th class='text-center' style='width:20%'>De 1</th>
          <th class='text-center' style='width:20%'>De 2</th>
          <th class='text-center' style='width:20%'>De 3</th>
          <th class='text-center' style='width:20%'>Partidos</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class='text-center'><strong>{stats.get('total_points', 0)}</strong></td>
          <td class='text-center'>{stats.get('points_1', 0)}</td>
          <td class='text-center'>{stats.get('points_2', 0)}</td>
          <td class='text-center'>{stats.get('points_3', 0)}</td>
          <td class='text-center'>{stats.get('games_count', 0)}</td>
        </tr>
      </tbody>
    </table>
    """

    # Tabla de faltas por tipo (mostrar tipos en español)
    fouls_rows = ""
    fouls_by_type = stats.get("fouls_by_type", []) or []
    foul_map_es = {
        "PERSONAL": "PERSONAL",
        "TECHNICAL": "TECNICA",
        "UNSPORTSMANLIKE": "ANTIDEPORTIVA",
        "DISQUALIFYING": "DESCALIFICATIVA",
    }
    if fouls_by_type:
        for r in fouls_by_type:
            raw = (r.get('foul_type') or '').upper()
            label = foul_map_es.get(raw, raw or '-')
            fouls_rows += f"<tr><td>{label}</td><td class='text-center'>{r.get('count',0)}</td></tr>"
    else:
        fouls_rows = "<tr><td colspan='2' class='no-data'>Sin faltas registradas</td></tr>"

    fouls_html = f"""
    <table>
      <thead>
        <tr>
          <th style='width:70%'>Tipo de falta</th>
          <th class='text-center' style='width:30%'>Conteo</th>
        </tr>
      </thead>
      <tbody>
        {fouls_rows}
      </tbody>
    </table>
    """

    logo_img = f'<img src="{logo_url}" class="header-logo" alt="Logo">' if logo_url else ""

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset=\"UTF-8\">
      {get_base_styles()}
    </head>
    <body>
      <div class=\"header\">
        {logo_img}
        <div class=\"header-title\">Estadísticas por Jugador</div>
        <div class=\"header-subtitle\">{player.get('name','Jugador')}</div>
        <div class=\"header-meta\">{meta_html}<br/>Generado el {now}</div>
      </div>

      <div class=\"filters\">
        <div class=\"filters-title\">Rango de Fechas</div>
        {filters_html}
      </div>

      <h3>Resumen de Puntos</h3>
      {points_html}

      <h3 style=\"margin-top:20px\">Faltas por Tipo (Total: {stats.get('total_fouls',0)})</h3>
      {fouls_html}

      <div class=\"footer\">
        Marcador BB &copy; 2025
      </div>
    </body>
    </html>
    """
    return html

def render_roster_html(game: Dict, home_players: List[Dict], away_players: List[Dict], logo_url: Optional[str] = None, home_logo_url: Optional[str] = None, away_logo_url: Optional[str] = None) -> str:
    now = datetime.now().strftime("%d/%m/%Y %H:%M")

    max_rows = max(len(home_players), len(away_players))
    def row_html(idx: int) -> str:
        left = home_players[idx] if idx < len(home_players) else None
        right = away_players[idx] if idx < len(away_players) else None
        def fmt(p: Optional[Dict]) -> str:
            if not p:
                return ""
            number = p.get("number") if p.get("number") is not None else "S/N"
            name = p.get("name", "N/A")
            pos = p.get("position") or "-"
            age = p.get("age")
            height = p.get("height_cm") or p.get("heightCm")
            nat = p.get("nationality") or p.get("Nationality")
            extra = []
            if height is not None:
                extra.append(f"Est: {height} cm")
            if age is not None:
                extra.append(f"Edad: {age}")
            if nat:
                extra.append(f"Nac: {nat}")
            extra_html = ("<div style='color:#777;font-size:11px;margin-top:2px'>" + " | ".join(extra) + "</div>") if extra else ""
            return f"<div><strong>{number}</strong> - {name} <span style='color:#666'>( {pos} )</span>{extra_html}</div>"
        return f"""
        <tr>
            <td>{fmt(left)}</td>
            <td>{fmt(right)}</td>
        </tr>
        """

    body_rows = "".join(row_html(i) for i in range(max_rows)) if max_rows > 0 else '<tr><td colspan="2" class="no-data">No hay roster asignado</td></tr>'

    # Encabezado con 2 logos (si existen) y VS
    left_logo = f'<img src="{home_logo_url}" class="header-logo" alt="Logo Local">' if home_logo_url else ""
    right_logo = f'<img src="{away_logo_url}" class="header-logo" alt="Logo Visitante">' if away_logo_url else ""
    duel = f"<div style='display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:8px'>" \
           f"{left_logo}<div style='font-size:18px;color:#666;font-weight:700'>VS</div>{right_logo}</div>"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        {get_base_styles()}
    </head>
    <body>
        <div class="header">
            {duel}
            <div class="header-title">Roster por Partido</div>
            <div class="header-subtitle">{game.get('home_team','Local')} vs {game.get('away_team','Visitante')}</div>
            <div class="header-meta">Generado el {now}</div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 50%;">Local: {game.get('home_team','-')}</th>
                    <th style="width: 50%;">Visitante: {game.get('away_team','-')}</th>
                </tr>
            </thead>
            <tbody>
                {body_rows}
            </tbody>
        </table>

        <div class="footer">
            Total local: {len(home_players)} | Total visitante: {len(away_players)} | Marcador BB &copy; 2025
        </div>
    </body>
    </html>
    """
    return html

def render_players_html(players: List[Dict], team_name: str, logo_url: Optional[str] = None) -> str:
    """Genera HTML para reporte de jugadores por equipo."""
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    # Construir filas de tabla
    rows_html = ""
    if players:
        for player in players:
            number = player.get("number") if player.get("number") is not None else "S/N"
            position = player.get("position") or "N/A"
            height = f'{player.get("height_cm")} cm' if player.get("height_cm") else "N/A"
            age = player.get("age") if player.get("age") else "N/A"
            nationality = player.get("nationality") or "N/A"
            
            rows_html += f"""
            <tr>
                <td>{player.get("name", "N/A")}</td>
                <td class="text-center"><strong>{number}</strong></td>
                <td class="text-center">{position}</td>
                <td class="text-center">{age}</td>
                <td class="text-center">{height}</td>
                <td class="text-center">{nationality}</td>
            </tr>
            """
    else:
        rows_html = '<tr><td colspan="6" class="no-data">No se encontraron jugadores</td></tr>'
    
    logo_img = f'<img src="{logo_url}" class="header-logo" alt="Logo">' if logo_url else ""
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        {get_base_styles()}
    </head>
    <body>
        <div class="header">
            {logo_img}
            <div class="header-title">Roster de Jugadores</div>
            <div class="header-subtitle">{team_name}</div>
            <div class="header-meta">Generado el {now}</div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th style="width: 34%;">Nombre completo</th>
                    <th class="text-center" style="width: 10%;">Número</th>
                    <th class="text-center" style="width: 14%;">Posición</th>
                    <th class="text-center" style="width: 10%;">Edad</th>
                    <th class="text-center" style="width: 14%;">Estatura</th>
                    <th class="text-center" style="width: 18%;">Nacionalidad</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
        
        <div class="footer">
            Total de jugadores: {len(players)} | Marcador BB &copy; 2025
        </div>
    </body>
    </html>
    """
    return html

def render_games_html(games: List[Dict], filters: Dict, logo_url: Optional[str] = None) -> str:
    """Genera HTML para reporte de historial de partidos."""
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    status_translation = {
        "SCHEDULED": "Programado",
        "IN_PROGRESS": "En Progreso",
        "FINISHED": "Finalizado",
        "CANCELLED": "Cancelado",
        "SUSPENDED": "Suspendido"
    }
    
    # Construir filtros aplicados
    filters_html = ""
    if filters.get("from"):
        filters_html += f'<span class="filter-item"><span class="filter-label">Desde:</span> {filters["from"]}</span>'
    if filters.get("to"):
        filters_html += f'<span class="filter-item"><span class="filter-label">Hasta:</span> {filters["to"]}</span>'
    if filters.get("status"):
        status_es = status_translation.get(filters["status"], filters["status"])
        filters_html += f'<span class="filter-item"><span class="filter-label">Estado:</span> {status_es}</span>'
    if not filters_html:
        filters_html = '<span class="filter-item">Sin filtros aplicados</span>'
    
    # Mapeo de estados a badges
    status_badges = {
        "SCHEDULED": '<span class="badge badge-info">Programado</span>',
        "IN_PROGRESS": '<span class="badge badge-warning">En Progreso</span>',
        "FINISHED": '<span class="badge badge-success">Finalizado</span>',
        "CANCELLED": '<span class="badge badge-danger">Cancelado</span>',
        "SUSPENDED": '<span class="badge badge-warning">Suspendido</span>'
    }
    
    # Construir filas de tabla
    rows_html = ""
    if games:
        for idx, game in enumerate(games, 1):
            status = game.get("status", "N/A")
            status_badge = status_badges.get(status, f'<span class="badge badge-secondary">{status}</span>')
            
            score_html = ""
            if status == "FINISHED":
                score_html = f'{game.get("home_score", 0)} - {game.get("away_score", 0)}'
            else:
                score_html = "-"
            
            created_at = game.get("created_at", "N/A")[:16] if game.get("created_at") else "N/A"
            quarter = game.get("quarter", "N/A")
            
            rows_html += f"""
            <tr>
                <td class="text-center">{idx}</td>
                <td>{game.get("home_team", "N/A")}</td>
                <td>{game.get("away_team", "N/A")}</td>
                <td class="text-center">{score_html}</td>
                <td class="text-center">{quarter}</td>
                <td class="text-center">{status_badge}</td>
                <td class="text-center">{created_at}</td>
            </tr>
            """
    else:
        rows_html = '<tr><td colspan="7" class="no-data">No se encontraron partidos</td></tr>'
    
    logo_img = f'<img src="{logo_url}" class="header-logo" alt="Logo">' if logo_url else ""
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        {get_base_styles()}
    </head>
    <body>
        <div class="header">
            {logo_img}
            <div class="header-title">Historial de Partidos</div>
            <div class="header-subtitle">Sistema de Marcador de Baloncesto</div>
            <div class="header-meta">Generado el {now}</div>
        </div>
        
        <div class="filters">
            <div class="filters-title">Filtros Aplicados</div>
            {filters_html}
        </div>
        
        <table>
            <thead>
                <tr>
                    <th class="text-center" style="width: 8%;">#</th>
                    <th style="width: 28%;">Equipo Local</th>
                    <th style="width: 28%;">Equipo Visitante</th>
                    <th class="text-center" style="width: 12%;">Marcador</th>
                    <th class="text-center" style="width: 8%;">Cuarto</th>
                    <th class="text-center" style="width: 12%;">Estado</th>
                    <th class="text-center" style="width: 14%;">Fecha/Hora</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
        
        <div class="footer">
            Total de partidos: {len(games)} | Marcador BB &copy; 2025
        </div>
    </body>
    </html>
    """
    return html
