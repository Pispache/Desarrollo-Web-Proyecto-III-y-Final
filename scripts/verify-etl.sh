#!/bin/bash
# Verificacion del ETL - compara conteos entre SQL Server y Postgres

set -e

echo "=========================================="
echo "Verificacion ETL"
echo "=========================================="
echo ""

echo "Estado del ETL:"
docker ps -a --filter name=marcador_etl --format "table {{.Names}}\t{{.Status}}"
echo ""

echo "Conteos en SQL Server:"
docker exec -it marcador_db /opt/mssql-tools18/bin/sqlcmd -S localhost,1435 -C -U sa -P 'Proyect0Web2025!' -d MarcadorDB -Q "
    SELECT 'Teams' as Tabla, COUNT(*) as Total FROM dbo.Teams
    UNION ALL
    SELECT 'Players', COUNT(*) FROM dbo.Players
    UNION ALL
    SELECT 'Games', COUNT(*) FROM dbo.Games
    UNION ALL
    SELECT 'GameEvents', COUNT(*) FROM dbo.GameEvents
" -h -1 -W
echo ""

echo "Conteos en Postgres:"
docker exec -it marcador_pg psql -U reports_admin -d reportsdb -t -c "
    SELECT 'Teams' as tabla, COUNT(*) as total FROM teams
    UNION ALL
    SELECT 'Players', COUNT(*) FROM players
    UNION ALL
    SELECT 'Games', COUNT(*) FROM games
    UNION ALL
    SELECT 'GameEvents', COUNT(*) FROM game_events;
"
echo ""

echo "Checkpoints:"
docker exec -it marcador_pg psql -U reports_admin -d reportsdb -c "
    SELECT checkpoint_key, checkpoint_value, updated_at 
    FROM etl_state 
    ORDER BY checkpoint_key;
"
echo ""

echo "=========================================="
echo "Verificacion completada"
echo "=========================================="
