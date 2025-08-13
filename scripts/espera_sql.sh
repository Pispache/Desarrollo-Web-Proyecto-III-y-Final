#!/usr/bin/env bash
set -e
host="$1"; shift
port="$1"; shift
until /opt/mssql-tools18/bin/sqlcmd -S ${host},${port} -C -U sa -P "$SA_PASSWORD" -Q "SELECT 1" &>/dev/null; do
  echo "Esperando a SQL Server en ${host}:${port}..."
  sleep 2
done
echo "SQL Server listo."
exec "$@"
