FROM python:3.11-slim
WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    curl \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=arm64,amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/11/prod bullseye main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configurar ODBC
RUN echo "[ODBC Driver 18 for SQL Server]" > /etc/odbcinst.ini && \
    echo "Description=Microsoft ODBC Driver 18 for SQL Server" >> /etc/odbcinst.ini && \
    echo "Driver=/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.5.so.1.1" >> /etc/odbcinst.ini

# Instalar dependencias de Python
RUN pip install --no-cache-dir psycopg[binary]==3.2.1 pyodbc==5.1.0

# Copiar codigo
COPY main.py /app/

ENV ETL_INTERVAL_SECONDS=120

CMD ["python", "main.py"]
