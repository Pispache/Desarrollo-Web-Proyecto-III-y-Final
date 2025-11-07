#!/bin/bash
# Script para ejecutar el ETL manualmente
#
# Úsalo cuando quieras sincronizar los datos de inmediato
# sin esperar a que corra el cron automático.

set -e

echo "=== Ejecutando sincronización ETL ==="
echo "Hora: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Verificamos que estén configuradas las conexiones a las bases de datos
if [ -z "$MSSQL_CS" ] || [ -z "$POSTGRES_CS" ]; then
    echo "Error: Faltan las variables de conexión"
    echo "Necesitas configurar MSSQL_CS y POSTGRES_CS"
    exit 1
fi

# Ejecutamos el ETL
cd /app
python3 main.py

echo ""
echo "=== Sincronización completada ==="
