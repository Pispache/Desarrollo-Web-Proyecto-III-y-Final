#!/usr/bin/env bash
set -e

# Resolve sqlcmd path (supports mssql-tools18 and mssql-tools)
SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
if [ ! -x "$SQLCMD" ]; then
  if [ -x "/opt/mssql-tools/bin/sqlcmd" ]; then
    SQLCMD="/opt/mssql-tools/bin/sqlcmd"
  fi
fi

"$SQLCMD" -S db,1435 -C -U sa -P "$SA_PASSWORD" -i /db/init.sql
if [ -f /db/seed.sql ]; then
  "$SQLCMD" -S db,1435 -C -U sa -P "$SA_PASSWORD" -i /db/seed.sql
fi
echo "DB inicializada."
