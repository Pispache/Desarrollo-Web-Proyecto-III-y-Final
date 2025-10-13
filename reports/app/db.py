import os
import psycopg

POSTGRES_CS = os.getenv("POSTGRES_CS", "")

def get_connection():
    if not POSTGRES_CS:
        raise RuntimeError("POSTGRES_CS not configured")
    return psycopg.connect(POSTGRES_CS)
