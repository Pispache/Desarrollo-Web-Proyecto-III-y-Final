FROM python:3.11-slim
WORKDIR /app

# Instalar dependencias del sistema (incluyendo cron)
RUN apt-get update && apt-get install -y \
    curl \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    cron \
    postgresql-client \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=arm64,amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/11/prod bullseye main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 mssql-tools18 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Agregar mssql-tools al PATH
ENV PATH="$PATH:/opt/mssql-tools18/bin"

# Configurar ODBC
RUN echo "[ODBC Driver 18 for SQL Server]" > /etc/odbcinst.ini && \
    echo "Description=Microsoft ODBC Driver 18 for SQL Server" >> /etc/odbcinst.ini && \
    echo "Driver=/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.5.so.1.1" >> /etc/odbcinst.ini

# Instalar dependencias de Python
RUN pip install --no-cache-dir psycopg[binary]==3.2.1 pyodbc==5.1.0

# Crear directorios para logs y backups
RUN mkdir -p /var/log/etl /var/backups /app/scripts

# Copiar código y scripts
COPY main.py /app/
COPY scripts/ /app/scripts/
COPY crontab /etc/cron.d/etl-cron

# Dar permisos de ejecución a scripts
RUN chmod +x /app/scripts/*.sh

# Configurar cron
RUN chmod 0644 /etc/cron.d/etl-cron && \
    touch /var/log/etl/cron.log

# Variables de entorno
ENV ETL_INTERVAL_SECONDS=120
ENV ETL_MAX_RETRIES=3
ENV ETL_RETRY_DELAY_SECONDS=5

CMD ["python", "main.py"]
