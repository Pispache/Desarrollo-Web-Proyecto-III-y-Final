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
