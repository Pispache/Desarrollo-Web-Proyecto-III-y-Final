const jwt = require('jsonwebtoken');

// Verifica JWT y adjunta req.userClaims
exports.verifyToken = (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token = auth.substring(7);
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    req.userClaims = claims;
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 401 : 401;
    return res.status(code).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Requiere rol ADMIN del claim .NET o 'admin' nativo
exports.requireAdmin = (req, res, next) => {
  const c = req.userClaims || {};
  const role = c['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || c.role || '';
  if (role === 'ADMIN' || role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin role required' });
};
