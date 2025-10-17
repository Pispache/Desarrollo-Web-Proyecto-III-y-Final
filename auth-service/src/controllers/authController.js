/**
 * @summary Controladores de autenticación para el Auth Service (Node/Express).
 * @remarks
 * - Expone endpoints de registro, login/email y flujo OAuth (callback).\
 * - Genera un JWT compatible con la API .NET (incluye claims de rol esperados).\
 * - Provee endpoints auxiliares: información del usuario actual, validación de token y administración de roles.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../config/database');

// Generate JWT token compatible with .NET
/**
 * @summary Genera un JWT con claims compatibles con la API .NET.
 * @param {{ id:number, email:string, username?:string, name?:string, role?:string }} user Usuario persistido.
 * @returns {string} Token JWT firmado con `JWT_SECRET`.
 */
function generateToken(user) {
  // Mapear rol de MySQL (viewer/operator/admin) al claim de .NET esperado por la API (ADMIN/USUARIO)
  const mysqlRole = (user.role || '').toString().trim().toLowerCase();
  const dotnetRole = mysqlRole === 'admin' ? 'ADMIN' : 'USUARIO';

  const payload = {
    // Claims estándar
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role, // mantener tal cual para compatibilidad con la UI

    // Claims compatibles con .NET
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': dotnetRole,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': user.username || user.email,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': user.id.toString(),

    // Claims adicionales
    sub: user.id.toString(),
    name: user.name || user.username
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: process.env.JWT_ISSUER || 'MarcadorApi',
    audience: process.env.JWT_AUDIENCE || 'MarcadorUi'
  });
}

// Register with email/password
/**
 * @summary Registro de usuario con email y contraseña.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { email, password, name, username } = req.body;
    
    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await db.query(
      `INSERT INTO users (email, username, password, name, role, active)
       VALUES (?, ?, ?, ?, 'viewer', TRUE)`,
      [email, username || email.split('@')[0], hashedPassword, name]
    );
    
    // Get created user
    const users = await db.query('SELECT id, email, username, name, role FROM users WHERE id = ?', [result.insertId]);
    const user = users[0];
    
    // Generate token
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role
      },
      token: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: '1h'
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  };
};

// Login with email/password
/**
 * @summary Login con email/contraseña.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { email, password } = req.body;
    
    // Find user
    const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const user = users[0];
    
    // Check if user has password (not OAuth user)
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'This account uses OAuth. Please login with ' + user.oauth_provider
      });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if active
    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive'
      });
    }
    
    // Update last login
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    
    // Generate token
    const token = generateToken(user);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar
      },
      token: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: '1h'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// Logout
/**
 * @summary Cierra la sesión de Passport del usuario actual.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
};

// Get current user
/**
 * @summary Obtiene información del usuario actual a partir del JWT.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.me = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const users = await db.query(
      'SELECT id, email, username, name, role, avatar, email_verified, last_login_at FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: users[0]
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to get user info'
    });
  }
};

// Validate token (for other microservices)
/**
 * @summary Valida un JWT para uso entre microservicios.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.validateToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        valid: false,
        message: 'No token provided'
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const users = await db.query(
      'SELECT id, email, username, name, role, active FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (users.length === 0 || !users[0].active) {
      return res.status(401).json({
        valid: false,
        message: 'User not found or inactive'
      });
    }
    
    res.json({
      valid: true,
      user: {
        id: users[0].id,
        email: users[0].email,
        username: users[0].username,
        name: users[0].name,
        role: users[0].role
      }
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      message: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
    });
  }
};

// OAuth callback
/**
 * @summary Callback de OAuth (GitHub) tras el intercambio de código por token.
 * @remarks
 * - Si hay usuario, genera un JWT y redirige a `FRONTEND_URL/login?token=...`.\
 * - Si falta usuario o hay error, redirige con mensaje de error.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
exports.oauthCallback = (req, res) => {
  try {
    console.log('OAuth callback - User:', req.user);
    
    if (!req.user) {
      console.error('OAuth callback - No user in request');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      return res.redirect(`${frontendUrl}/login?error=no_user`);
    }
    
    // Generate token for OAuth user
    const token = generateToken(req.user);
    console.log('OAuth callback - Token generated:', token.substring(0, 20) + '...');
    
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const redirectUrl = `${frontendUrl}/login?token=${token}`;
    console.log('OAuth callback - Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error.message)}`);
  }
};

// Listar usuarios (solo ADMIN)
/**
 * @summary Lista usuarios (solo administradores).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.listUsers = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, email, username, name, role, active, avatar,
              COALESCE(DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s'), NULL) AS last_login_at
         FROM users
         ORDER BY created_at DESC, id DESC`
    );
    res.json({ success: true, users: rows });
  } catch (error) {
    console.error('listUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to list users' });
  }
};

// Actualizar rol de usuario (solo ADMIN)
/**
 * @summary Actualiza el rol de un usuario (solo administradores).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.updateUserRole = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { role } = req.body || {};

    if (!userId || !role) {
      return res.status(400).json({ success: false, message: 'User id and role are required' });
    }

    const allowed = ['viewer', 'operator', 'admin'];
    const newRole = String(role).toLowerCase();
    if (!allowed.includes(newRole)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    await db.query('UPDATE users SET role = ? WHERE id = ?', [newRole, userId]);

    const rows = await db.query(
      'SELECT id, email, username, name, role, active, avatar, last_login_at FROM users WHERE id = ?', [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('updateUserRole error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user role' });
  }
};
