#!/bin/bash
# Script para verificar que el ETL esté funcionando bien
#
# Este script compara los datos entre SQL Server y PostgreSQL
# para asegurarse de que todo esté sincronizado correctamente.

set -e

# Colores para que se vea bonito
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # Volver al color normal

# Configuración de las bases de datos
MSSQL_HOST="${MSSQL_HOST:-sqlserver}"
MSSQL_DB="${MSSQL_DB:-MarcadorDB}"
MSSQL_USER="${MSSQL_USER:-sa}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-reportsdb}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Verificación de Sincronización ETL                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "SQL Server: $MSSQL_HOST/$MSSQL_DB"
echo "PostgreSQL: $POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB"
echo ""

# Esta función cuenta cuántos registros hay en una tabla de SQL Server
count_mssql() {
    local table=$1
    /opt/mssql-tools/bin/sqlcmd -S "$MSSQL_HOST" -U "$MSSQL_USER" -P "$MSSQL_PASSWORD" -d "$MSSQL_DB" -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM $table" 2>/dev/null | tr -d ' '
}

# Esta función cuenta cuántos registros hay en una tabla de PostgreSQL
count_postgres() {
    local table=$1
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM $table" 2>/dev/null | tr -d ' '
}

# Primero verificamos que podamos conectarnos a ambas bases de datos
echo -e "${YELLOW}Verificando conexiones...${NC}"

if ! /opt/mssql-tools/bin/sqlcmd -S "$MSSQL_HOST" -U "$MSSQL_USER" -P "$MSSQL_PASSWORD" -d "$MSSQL_DB" -Q "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: No pude conectarme a SQL Server${NC}"
    exit 1
fi
echo -e "${GREEN}✓ SQL Server conectado${NC}"

if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: No pude conectarme a PostgreSQL${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL conectado${NC}"
echo ""

# Tablas a verificar
declare -A tables=(
    ["dbo.Teams"]="teams"
    ["dbo.Players"]="players"
    ["dbo.Games"]="games"
    ["dbo.GameEvents"]="game_events"
)

# Verificar conteos
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    Conteo de Registros                     ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
printf "%-20s | %15s | %15s | %10s\n" "Tabla" "SQL Server" "PostgreSQL" "Estado"
echo "────────────────────────────────────────────────────────────────"

all_match=true
total_mssql=0
total_pg=0

for mssql_table in "${!tables[@]}"; do
    pg_table="${tables[$mssql_table]}"
    
    # Obtener conteos
    mssql_count=$(count_mssql "$mssql_table")
    pg_count=$(count_postgres "$pg_table")
    
    # Validar que sean números
    if ! [[ "$mssql_count" =~ ^[0-9]+$ ]]; then
        mssql_count=0
    fi
    if ! [[ "$pg_count" =~ ^[0-9]+$ ]]; then
        pg_count=0
    fi
    
    total_mssql=$((total_mssql + mssql_count))
    total_pg=$((total_pg + pg_count))
    
    # Comparar
    if [ "$mssql_count" -eq "$pg_count" ]; then
        status="${GREEN}✓ OK${NC}"
    else
        status="${RED}✗ DIFF${NC}"
        all_match=false
    fi
    
    # Mostrar resultado
    table_name=$(echo "$pg_table" | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++)sub(/./,toupper(substr($i,1,1)),$i)}1' | sed 's/ /_/g')
    printf "%-20s | %15s | %15s | " "$table_name" "$mssql_count" "$pg_count"
    echo -e "$status"
done

echo "────────────────────────────────────────────────────────────────"
printf "%-20s | %15s | %15s |\n" "TOTAL" "$total_mssql" "$total_pg"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Verificar logs de ETL recientes
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              Últimas Ejecuciones ETL (24h)                ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT 
    table_name as \"Tabla\",
    status as \"Estado\",
    records_processed as \"Registros\",
    ROUND(duration_seconds::numeric, 2) as \"Duración (s)\",
    TO_CHAR(executed_at, 'YYYY-MM-DD HH24:MI:SS') as \"Ejecutado\"
FROM etl_logs
WHERE executed_at >= NOW() - INTERVAL '24 hours'
ORDER BY executed_at DESC
LIMIT 20;
" 2>/dev/null || echo -e "${YELLOW}⚠ No se pudieron obtener logs de ETL${NC}"

echo ""

# Verificar checkpoints
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                  Estado de Checkpoints                    ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT 
    checkpoint_key as \"Checkpoint\",
    checkpoint_value as \"Último ID\",
    TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as \"Actualizado\"
FROM etl_state
ORDER BY checkpoint_key;
" 2>/dev/null || echo -e "${YELLOW}⚠ No se pudieron obtener checkpoints${NC}"

echo ""

# Resultado final
if [ "$all_match" = true ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ VERIFICACIÓN EXITOSA - Todos los conteos coinciden     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ VERIFICACIÓN FALLIDA - Hay discrepancias en los datos  ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
