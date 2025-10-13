FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir psycopg[binary]==3.2.1 pyodbc==5.1.0
COPY etl /app
ENV ETL_INTERVAL_SECONDS=120
CMD ["python", "main.py"]
