#!/bin/bash
# Script para aplicar migraciones a PostgreSQL
#
# Este script revisa qué migraciones ya están aplicadas y ejecuta
# solo las que faltan, en el orden correcto.

set -e

# Colores para que se vea bonito en la terminal jajajaja Att: Pablo
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # Volver al color normal

# Configuración de la base de datos
# Puedes cambiar estos valores con variables de entorno
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-reportsdb}"
DB_USER="${POSTGRES_USER:-postgres}"
MIGRATIONS_DIR="$(dirname "$0")/migrations"

echo -e "${GREEN}=== Sistema de Migraciones PostgreSQL ===${NC}"
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Esta función ejecuta un comando SQL y devuelve el resultado
run_sql() {
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "$1"
}

# Esta función ejecuta un archivo SQL completo
run_sql_file() {
    local file=$1
    echo -e "${YELLOW}Aplicando: $(basename "$file")${NC}"
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file"
}

# Primero verificamos que podamos conectarnos a la base de datos
echo "Verificando conexión a la base de datos..."
if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; then
    echo -e "${RED}Error: No pude conectarme a la base de datos${NC}"
    echo "Revisa que estén bien configuradas estas variables:"
    echo "  - POSTGRES_HOST"
    echo "  - POSTGRES_PORT"
    echo "  - POSTGRES_USER"
    echo "  - POSTGRES_PASSWORD"
    exit 1
fi
echo -e "${GREEN}✓ Conexión exitosa${NC}\n"

# Creamos la tabla que lleva el registro de migraciones (si no existe)
echo "Verificando tabla de migraciones..."
run_sql "CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    execution_time INTERVAL
);" > /dev/null
echo -e "${GREEN}✓ Tabla schema_migrations lista${NC}\n"

# Vemos qué migraciones ya se aplicaron antes
echo "Consultando migraciones aplicadas..."
applied_migrations=$(run_sql "SELECT version FROM schema_migrations ORDER BY version;" | tr -d ' ')
echo "Migraciones que ya están aplicadas: ${applied_migrations:-ninguna}"
echo ""

# Ahora aplicamos las migraciones que faltan
pending_count=0
applied_count=0

for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    if [ ! -f "$migration_file" ]; then
        echo -e "${YELLOW}No encontré archivos de migración en la carpeta${NC}"
        exit 0
    fi
    
    # Sacamos el número de versión del nombre del archivo
    filename=$(basename "$migration_file")
    version=$(echo "$filename" | grep -oE '^[0-9]+')
    
    if [ -z "$version" ]; then
        echo -e "${YELLOW}⚠ Saltando este archivo porque no tiene número de versión: $filename${NC}"
        continue
    fi
    
    # Revisamos si esta migración ya se aplicó antes
    if echo "$applied_migrations" | grep -q "^${version}$"; then
        echo -e "✓ La migración $version ya estaba aplicada: $filename"
        applied_count=$((applied_count + 1))
    else
        echo -e "${GREEN}→ Aplicando la migración $version: $filename${NC}"
        start_time=$(date +%s)
        
        if run_sql_file "$migration_file"; then
            end_time=$(date +%s)
            duration=$((end_time - start_time))
            echo -e "${GREEN}✓ Listo! La migración $version se aplicó correctamente (tardó ${duration}s)${NC}\n"
            pending_count=$((pending_count + 1))
        else
            echo -e "${RED}✗ Ups! Hubo un error al aplicar la migración $version${NC}"
            exit 1
        fi
    fi
done

echo ""
echo -e "${GREEN}=== Resumen ===${NC}"
echo "Migraciones que ya estaban: $applied_count"
echo "Migraciones nuevas que apliqué: $pending_count"
echo ""

# Mostramos un resumen de todas las migraciones
echo -e "${GREEN}=== Todas las Migraciones Aplicadas ===${NC}"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
    version,
    description,
    applied_at,
    EXTRACT(EPOCH FROM execution_time) as duration_seconds
FROM schema_migrations 
ORDER BY version;
"

echo -e "\n${GREEN}✓ Todo listo! Las migraciones están al día${NC}"
