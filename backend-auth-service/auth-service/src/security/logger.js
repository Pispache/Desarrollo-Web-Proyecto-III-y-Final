/**
 * @summary Logs estructurados de seguridad (A09: Security Logging and Monitoring Failures).
 * @remarks Emite eventos JSON (login/register/roles/estado/reset) para auditoría y detección de anomalías.
 * @effects Facilita monitoreo centralizado y alertas por patrones sospechosos.
 */
function logEvent(event, data = {}) {
  try {
    const payload = {
      ts: new Date().toISOString(),
      event,
      ...data,
    };
    console.log(JSON.stringify(payload));
  } catch (_) {}
}

module.exports = { logEvent };
