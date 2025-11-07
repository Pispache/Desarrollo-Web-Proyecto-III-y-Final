"""
@summary Acceso a base de datos para el microservicio de reportes.
@remarks
- Abre conexiones a PostgreSQL usando `psycopg` a partir de la variable de entorno `POSTGRES_CS`.\
- Se recomienda usar este helper por solicitud (con context manager) para liberar recursos correctamente.
"""
import os
import psycopg

POSTGRES_CS = os.getenv("POSTGRES_CS", "")

def get_connection():
    """
    @summary Obtiene una conexión a PostgreSQL usando `POSTGRES_CS`.
    @returns Conexión `psycopg.Connection` lista para usar (cerrar tras utilizar).
    @raises RuntimeError si la cadena de conexión no está configurada.
    """
    if not POSTGRES_CS:
        raise RuntimeError("POSTGRES_CS not configured")
    return psycopg.connect(POSTGRES_CS)
