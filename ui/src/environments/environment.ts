const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const environment = {
  production: !isLocal,
  apiBaseUrl: isLocal ? 'http://localhost:8080/api' : '/api',
  reportsBaseUrl: isLocal ? 'http://localhost:8081/v1/reports' : '/reports',
  authBaseUrl: isLocal ? 'http://localhost:5001/api/auth' : '/api/auth'
};
