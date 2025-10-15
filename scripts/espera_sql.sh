#!/usr/bin/env bash
set -e
host="$1"; shift
port="$1"; shift

# Resolve sqlcmd path (supports mssql-tools18 and mssql-tools)
SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
if [ ! -x "$SQLCMD" ]; then
  if [ -x "/opt/mssql-tools/bin/sqlcmd" ]; then
    SQLCMD="/opt/mssql-tools/bin/sqlcmd"
  fi
fi

until "$SQLCMD" -S ${host},${port} -C -U sa -P "$SA_PASSWORD" -Q "SELECT 1" &>/dev/null; do
  echo "Esperando a SQL Server en ${host}:${port}..."
  sleep 2
done
echo "SQL Server listo."
exec "$@"
