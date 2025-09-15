#!/usr/bin/env bash
set -e
/opt/mssql-tools18/bin/sqlcmd -S db,1435 -C -U sa -P "$SA_PASSWORD" -i /db/init.sql
if [ -f /db/seed.sql ]; then
  /opt/mssql-tools18/bin/sqlcmd -S db,1435 -C -U sa -P "$SA_PASSWORD" -i /db/seed.sql
fi
echo "DB inicializada."
