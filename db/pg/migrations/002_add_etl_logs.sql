-- Migración 002: Sistema de logs para el ETL
-- Creado: 3 de noviembre, 2025
--
-- Agregamos una tabla para llevar registro de todas las ejecuciones del ETL.
-- Esto nos permite saber cuándo se ejecutó, cuántos registros procesó,
-- si hubo errores, y cuánto tiempo tardó cada sincronización.

-- Aquí guardamos el historial de cada vez que corre el ETL
CREATE TABLE IF NOT EXISTS etl_logs (
    log_id              SERIAL PRIMARY KEY,
    table_name          VARCHAR(50) NOT NULL,
    status              VARCHAR(20) NOT NULL, -- Puede ser: SUCCESS, ERROR o WARNING
    records_processed   INTEGER NOT NULL DEFAULT 0,
    duration_seconds    NUMERIC(10,2),
    error_message       TEXT,
    executed_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para hacer más rápidas las consultas de monitoreo
CREATE INDEX IF NOT EXISTS idx_etl_logs_table_name ON etl_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_etl_logs_status ON etl_logs(status);
CREATE INDEX IF NOT EXISTS idx_etl_logs_executed_at ON etl_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_etl_logs_table_status ON etl_logs(table_name, status, executed_at DESC);

-- Damos los permisos necesarios a cada rol
GRANT SELECT ON etl_logs TO report_ro;
GRANT SELECT, INSERT ON etl_logs TO etl_writer;
GRANT USAGE, SELECT ON SEQUENCE etl_logs_log_id_seq TO etl_writer;

-- Esta vista nos da un resumen rápido de cómo ha ido el ETL
-- en las últimas 24 horas: cuántas veces corrió, cuántas fallaron, etc.
CREATE OR REPLACE VIEW v_etl_summary_24h AS
SELECT 
    table_name,
    COUNT(*) as total_runs,
    SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successful_runs,
    SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) as failed_runs,
    SUM(records_processed) as total_records,
    AVG(duration_seconds) as avg_duration_seconds,
    MAX(executed_at) as last_execution
FROM etl_logs
WHERE executed_at >= NOW() - INTERVAL '24 hours'
GROUP BY table_name
ORDER BY table_name;

GRANT SELECT ON v_etl_summary_24h TO report_ro;
GRANT SELECT ON v_etl_summary_24h TO etl_writer;

-- Marcamos esta migración como aplicada
INSERT INTO schema_migrations (version, description, applied_at)
VALUES (2, 'Tabla de logs de ETL para auditoría', NOW())
ON CONFLICT (version) DO NOTHING;
