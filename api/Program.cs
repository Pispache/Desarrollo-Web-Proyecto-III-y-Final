using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;

var builder = WebApplication.CreateBuilder(args);

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS (abierto en dev; en prod restringe orígenes)
builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseCors();

// Swagger solo en Development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// SIN HTTPS redirection para facilitar pruebas locales/docker
// app.UseHttpsRedirection();

// Healthcheck simple
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Helper para obtener la cadena de conexión
string GetConnectionString()
{
    // 1) Prioriza variable de entorno (útil en Docker)
    var fromEnv = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING");
    if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;

    // 2) Fallback a appsettings.json
    return app.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("No hay cadena de conexión configurada.");
}

// GET: últimos 50 partidos
app.MapGet("/api/games", async () =>
{
    using var conn = new SqlConnection(GetConnectionString());
    var rows = await conn.QueryAsync("SELECT TOP 50 * FROM MarcadorDB.dbo.Games ORDER BY GameId DESC;");
    return Results.Ok(rows);
})
.WithName("GetGames")
.WithOpenApi();

// POST: crear partido
app.MapPost("/api/games", async ([FromBody] CreateGameDto body) =>
{
    var home = string.IsNullOrWhiteSpace(body?.Home) ? "Local" : body!.Home.Trim();
    var away = string.IsNullOrWhiteSpace(body?.Away) ? "Visitante" : body!.Away.Trim();

    using var conn = new SqlConnection(GetConnectionString());
    var id = await conn.ExecuteScalarAsync<int>(@"
        INSERT INTO MarcadorDB.dbo.Games(HomeTeam, AwayTeam, CreatedAt)
        OUTPUT INSERTED.GameId
        VALUES(@home, @away, SYSUTCDATETIME());
    ", new { home, away });

    return Results.Created($"/api/games/{id}", new { GameId = id, Home = home, Away = away });
})
.WithName("CreateGame")
.WithOpenApi();


// GET: detalle de un juego + últimos eventos (p.ej. 100)
app.MapGet("/api/games/{id:int}", async (int id) =>
{
    using var conn = new SqlConnection(GetConnectionString());
    var game = await conn.QuerySingleOrDefaultAsync(
        "SELECT * FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id });
    if (game is null) return Results.NotFound();

    var events = await conn.QueryAsync(
        "SELECT TOP 100 * FROM MarcadorDB.dbo.GameEvents WHERE GameId=@id ORDER BY EventId DESC;", new { id });

    return Results.Ok(new { game, events });
})
.WithName("GetGameById")
.WithOpenApi();

// POST: iniciar partido (Status: IN_PROGRESS). Quarter según tu tabla ya inicia en 1.
app.MapPost("/api/games/{id:int}/start", async (int id, [FromBody] StartDto? _ ) =>
{
    using var conn = new SqlConnection(GetConnectionString());
    var affected = await conn.ExecuteAsync(@"
        UPDATE MarcadorDB.dbo.Games
        SET Status='IN_PROGRESS'
        WHERE GameId=@id AND Status='SCHEDULED';", new { id });

    return affected > 0 ? Results.NoContent()
                        : Results.BadRequest(new { error = "No se pudo iniciar (¿no existe o no está SCHEDULED?)." });
})
.WithName("StartGame")
.WithOpenApi();

// POST: avanzar de cuarto (máximo 4)
app.MapPost("/api/games/{id:int}/advance-quarter", async (int id, [FromBody] AdvanceDto? _ ) =>
{
    using var conn = new SqlConnection(GetConnectionString());

    var current = await conn.QuerySingleOrDefaultAsync<(int Quarter, string Status)>(
        "SELECT Quarter, Status FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id });
    if (current == default) return Results.NotFound();
    if (!string.Equals(current.Status, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { error = "El juego no está en progreso." });
    if (current.Quarter >= 4)
        return Results.BadRequest(new { error = "Ya estás en el último cuarto." });

    var affected = await conn.ExecuteAsync(@"
        UPDATE MarcadorDB.dbo.Games
        SET Quarter = Quarter + 1
        WHERE GameId=@id;", new { id });

    return affected > 0 ? Results.NoContent()
                        : Results.BadRequest(new { error = "No se pudo avanzar de cuarto." });
})
.WithName("AdvanceQuarter")
.WithOpenApi();

// POST: registrar puntos
app.MapPost("/api/games/{id:int}/score", async (int id, [FromBody] ScoreDto body) =>
{
    var team = (body?.Team ?? "").ToUpperInvariant();
    var pts  = body?.Points ?? 0;
    if ((team != "HOME" && team != "AWAY") || (pts != 1 && pts != 2 && pts != 3))
        return Results.BadRequest(new { error = "Team debe ser HOME/AWAY y Points 1|2|3." });

    using var conn = new SqlConnection(GetConnectionString());

    var sqlUpdate = team == "HOME"
        ? "UPDATE MarcadorDB.dbo.Games SET HomeScore = HomeScore + @pts WHERE GameId=@id;"
        : "UPDATE MarcadorDB.dbo.Games SET AwayScore = AwayScore + @pts WHERE GameId=@id;";

    // Dado tu esquema, el EventType es POINT_1|2|3 y Team NOT NULL
    var affected = await conn.ExecuteAsync(@$"
        {sqlUpdate}
        INSERT INTO MarcadorDB.dbo.GameEvents(GameId, Quarter, Team, EventType, PlayerNumber)
          SELECT @id, Quarter, @team, @etype, NULL
          FROM MarcadorDB.dbo.Games WHERE GameId=@id;",
        new { id, team, pts, etype = $"POINT_{pts}" });

    return affected > 0 ? Results.NoContent()
                        : Results.BadRequest(new { error = "No se pudo registrar la puntuación." });
})
.WithName("Score")
.WithOpenApi();

// POST: falta
app.MapPost("/api/games/{id:int}/foul", async (int id, [FromBody] FoulDto body) =>
{
    var team = (body?.Team ?? "").ToUpperInvariant();
    if (team != "HOME" && team != "AWAY")
        return Results.BadRequest(new { error = "Team debe ser HOME o AWAY." });

    using var conn = new SqlConnection(GetConnectionString());
    var affected = await conn.ExecuteAsync(@"
        INSERT INTO MarcadorDB.dbo.GameEvents(GameId, Quarter, Team, EventType, PlayerNumber)
          SELECT @id, Quarter, @team, 'FOUL', NULL
          FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id, team });

    return affected > 0 ? Results.NoContent()
                        : Results.BadRequest(new { error = "No se pudo registrar la falta." });
})
.WithName("Foul")
.WithOpenApi();

// POST: finalizar partido
app.MapPost("/api/games/{id:int}/finish", async (int id) =>
{
    using var conn = new SqlConnection(GetConnectionString());
    var affected = await conn.ExecuteAsync(@"
        UPDATE MarcadorDB.dbo.Games
        SET Status='FINISHED'
        WHERE GameId=@id AND Status='IN_PROGRESS';", new { id });

    return affected > 0 ? Results.NoContent()
                        : Results.BadRequest(new { error = "No se pudo finalizar (¿no está IN_PROGRESS?)." });
})
.WithName("FinishGame")
.WithOpenApi();

// POST: deshacer último evento (POINT_* o FOUL)
app.MapPost("/api/games/{id:int}/undo", async (int id) =>
{
    using var conn = new SqlConnection(GetConnectionString());

    var ev = await conn.QuerySingleOrDefaultAsync<dynamic>(@"
        SELECT TOP 1 * FROM MarcadorDB.dbo.GameEvents
        WHERE GameId=@id AND EventType IN ('POINT_1','POINT_2','POINT_3','FOUL')
        ORDER BY EventId DESC;", new { id });

    if (ev is null) return Results.BadRequest(new { error = "No hay evento deshacible." });

    // revertir puntuación si aplicaba
    string evType = ev.EventType;
    string team   = ev.Team;
    int pts       = evType.StartsWith("POINT_") ? int.Parse(((string)evType).Substring(6)) : 0;

    if (pts > 0)
    {
        if (string.Equals(team, "HOME", StringComparison.OrdinalIgnoreCase))
            await conn.ExecuteAsync("UPDATE MarcadorDB.dbo.Games SET HomeScore = HomeScore - @pts WHERE GameId=@id;", new { id, pts });
        else
            await conn.ExecuteAsync("UPDATE MarcadorDB.dbo.Games SET AwayScore = AwayScore - @pts WHERE GameId=@id;", new { id, pts });
    }

    // registrar UNDO (tu tabla exige Team NOT NULL → usamos el mismo team del evento revertido)
    await conn.ExecuteAsync(@"
        INSERT INTO MarcadorDB.dbo.GameEvents(GameId, Quarter, Team, EventType, PlayerNumber)
          VALUES (@id, @q, @team, 'UNDO', NULL);
        DELETE FROM MarcadorDB.dbo.GameEvents WHERE EventId=@eid;",
        new { id, q = (byte)ev.Quarter, team, eid = (int)ev.EventId });

    return Results.NoContent();
})
.WithName("Undo")
.WithOpenApi();


app.Run();

record CreateGameDto(string? Home, string? Away);
record StartDto();                              // no requiere body hoy
record AdvanceDto();                            // no requiere body hoy
record ScoreDto(string Team, int Points);       // Team: HOME|AWAY, Points: 1|2|3
record FoulDto(string Team);                    // Team: HOME|AWAY
