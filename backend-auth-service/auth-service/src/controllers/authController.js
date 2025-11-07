/**
 * @summary Controladores de autenticación para el Auth Service (Node/Express).
 * @remarks
 * - Expone endpoints de registro, login/email y flujo OAuth (callback).
 * - Genera un JWT compatible con la API .NET (incluye claims de rol esperados).
 * - Provee endpoints auxiliares: información del usuario actual, validación de token y administración de roles.
 * - Migrado a MongoDB con Mongoose.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { logEvent } = require('../security/logger');
const { canAttempt, recordFailure, recordSuccess, remainingLockMs } = require('../security/lockout');

// Generate JWT token compatible with .NET
/**
 * @summary Genera un JWT con claims compatibles con la API .NET.
 * @param {object} user Usuario de Mongoose.
 * @returns {string} Token JWT firmado con `JWT_SECRET`.
 */
function generateToken(user) {
  // Mapear rol de MongoDB (viewer/operator/admin) al claim de .NET esperado por la API (ADMIN/USUARIO)
  const userRole = (user.role || '').toString().trim().toLowerCase();
  const dotnetRole = userRole === 'admin' ? 'ADMIN' : 'USUARIO';

  const userId = user._id.toString();
  
  const payload = {
    // Claims estándar
    id: userId,
    email: user.email,
    username: user.username,
    role: user.role, // mantener tal cual para compatibilidad con la UI

    // Claims compatibles con .NET
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': dotnetRole,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': user.username || user.email,
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': userId,

    // Claims adicionales
    sub: userId,
    name: user.name || user.username
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: process.env.JWT_ISSUER || 'MarcadorApi',
    audience: process.env.JWT_AUDIENCE || 'MarcadorUi'
  });
}

// ===== Admin: resetear contraseña de usuario local =====
exports.resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ success: false, message: 'Se requiere id de usuario' });

    // Verificar que el usuario exista y sea local (tenga password)
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    if (!user.password) {
      return res.status(400).json({ success: false, message: 'No se puede resetear: usuario con OAuth' });
    }

    // Generar contraseña temporal segura
    const temp = Math.random().toString(36).slice(-8) + 'A1'; // 10+ chars con mayúscula y número
    user.password = temp; // El pre-save hook lo hasheará automáticamente
    await user.save();

    try { logEvent('admin_reset_password_success', { targetUserId: userId, byUserId: req.userClaims?.id }); } catch {}
    return res.json({ success: true, temporaryPassword: temp });
  } catch (error) {
    console.error('resetUserPassword error:', error);
    try { logEvent('admin_reset_password_failed', { targetUserId: req.params?.id, byUserId: req.userClaims?.id, error: String(error?.message || error) }); } catch {}
    return res.status(500).json({ success: false, message: 'No se pudo resetear la contraseña' });
  }
};

// Actualizar estado activo (solo ADMIN, no puede modificarse a sí mismo)
/**
 * @summary Actualiza el estado activo de un usuario (solo administradores) y evita auto-modificación.
 */
exports.updateUserActive = async (req, res) => {
  try {
    const userId = req.params.id;
    const { active } = req.body || {};
    if (typeof active === 'undefined') {
      return res.status(400).json({ success: false, message: 'Field "active" is required' });
    }
    if (!req.userClaims) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // Evitar que un admin cambie su propio estado activo
    const meId = req.userClaims.id;
    if (meId === userId) {
      return res.status(400).json({ success: false, message: 'No puedes cambiar tu propio estado' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.active = !!active;
    await user.save();

    try { logEvent('admin_update_active_success', { targetUserId: userId, active: !!active, byUserId: req.userClaims?.id }); } catch {}
    res.json({ success: true, user: user.toPublicJSON() });
  } catch (error) {
    console.error('updateUserActive error:', error);
    try { logEvent('admin_update_active_failed', { targetUserId: req.params?.id, byUserId: req.userClaims?.id, error: String(error?.message || error) }); } catch {}
    res.status(500).json({ success: false, message: 'Failed to update user active' });
  }
};

// Register with email/password
/**
 * @summary Registro de usuario con email y contraseña.
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
    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'El correo ya está registrado'
      });
    }
    
    // Create user
    const user = new User({
      email,
      username: username || email.split('@')[0],
      password, // El pre-save hook lo hasheará automáticamente
      name,
      role: 'viewer',
      active: true,
      emailVerified: true, // Auto-verificado para simplificar
      lastLoginAt: new Date()
    });
    
    await user.save();

    const token = generateToken(user);
    try { logEvent('auth_register_success', { userId: user._id.toString(), email: user.email }); } catch {}
    res.status(201).json({
      success: true,
      message: 'Registro Correcto',
      user: user.toPublicJSON(),
      token: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: process.env.JWT_EXPIRES_IN || '1h'
      }
    });
  } catch (error) {
    console.error('Error de Registro:', error);
    try { logEvent('auth_register_failed', { email: req.body?.email, error: String(error?.message || error) }); } catch {}
    res.status(500).json({
      success: false,
      message: 'El registro fallo',
      error: error.message
    });
  }
};

// Login with email/password
/**
 * @summary Login con email/contraseña.
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

    const key = `${(email || '').toLowerCase()}#${req.ip || ''}`;
    if (!canAttempt(key)) {
      const rem = remainingLockMs(key);
      try { logEvent('auth_login_locked', { email: (email || '').toLowerCase(), ip: req.ip, remainingMs: rem }); } catch {}
      return res.status(429).json({
        success: false,
        message: 'Cuenta bloqueada temporalmente. Inténtalo más tarde.'
      });
    }

    const user = await User.findByEmail(email).select('+password');
    if (!user) {
      recordFailure(key);
      try { logEvent('auth_login_failed', { reason: 'user_not_found', email: (email || '').toLowerCase(), ip: req.ip }); } catch {}
      return res.status(401).json({
        success: false,
        message: 'Credenciales Invalidas'
      });
    }

    // Check if user has password (not OAuth user)
    if (!user.password) {
      recordFailure(key);
      try { logEvent('auth_login_failed', { reason: 'oauth_only', userId: user._id.toString(), email: user.email, ip: req.ip }); } catch {}
      return res.status(401).json({
        success: false,
        message: 'Esta cuenta utiliza OAuth. Por favor, inicie sesión con ' + user.oauthProvider
      });
    }

    // Verify password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      recordFailure(key);
      try { logEvent('auth_login_failed', { reason: 'invalid_password', userId: user._id.toString(), email: user.email, ip: req.ip }); } catch {}
      return res.status(401).json({
        success: false,
        message: 'Credenciales Invalidas'
      });
    }

    // Check if active
    if (!user.active) {
      recordFailure(key);
      try { logEvent('auth_login_failed', { reason: 'inactive', userId: user._id.toString(), email: user.email, ip: req.ip }); } catch {}
      return res.status(403).json({
        success: false,
        message: 'La cuenta está inactiva'
      });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user);
    recordSuccess(key);
    try { logEvent('auth_login_success', { userId: user._id.toString(), email: user.email, ip: req.ip }); } catch {}

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: user.toPublicJSON(),
      token: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: '1h'
      }
    });
  } catch (error) {
    console.error('Error de Login:', error);
    try { logEvent('auth_login_failed', { reason: 'exception', email: req.body?.email, ip: req.ip, error: String(error?.message || error) }); } catch {}
    res.status(500).json({
      success: false,
      message: 'Login Fallido',
      error: error.message
    });
  }
};

// Logout
/**
 * @summary Cierra la sesión de Passport del usuario actual.
 */
exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión'
      });
    }
    res.json({
      success: true,
      message: 'Cierre de sesión exitoso'
    });
  });
};

// Get current user
/**
 * @summary Obtiene información del usuario actual a partir del JWT.
 */
exports.me = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token proporcionado'
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    res.json({
      success: true,
      user: user.toPublicJSON()
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token Invalido'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error al obtener información del usuario'
    });
  }
};

// Validate token (for other microservices)
/**
 * @summary Valida un JWT para uso entre microservicios.
 */
exports.validateToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        valid: false,
        message: 'No token proporcionado'
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    
    if (!user || !user.active) {
      return res.status(401).json({
        valid: false,
        message: 'Usuario no encontrado o inactivo'
      });
    }
    
    res.json({
      valid: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      message: error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token Invalido'
    });
  }
};

// OAuth callback
/**
 * @summary Callback de OAuth tras el intercambio de código por token.
 * @remarks
 * - Si hay usuario, genera un JWT y redirige a `FRONTEND_URL/login?token=...`.
 * - Si falta usuario o hay error, redirige con mensaje de error.
 * - Verifica en base de datos si el usuario está activo; si está inactivo,
 *   NO emite token y redirige a `FRONTEND_URL/login?error=account_inactive`.
 */
exports.oauthCallback = async (req, res) => {
  try {
    console.log('OAuth callback - User:', req.user);
    
    if (!req.user) {
      console.error('OAuth callback - No user in request');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      return res.redirect(`${frontendUrl}/login?error=no_user`);
    }
    
    // Comprobar estado activo antes de emitir token
    try {
      if (req.user?._id) {
        const user = await User.findById(req.user._id);
        if (!user || !user.active) {
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
          return res.redirect(`${frontendUrl}/login?error=account_inactive`);
        }
        // Marcar último acceso para usuarios OAuth
        user.lastLoginAt = new Date();
        await user.save();
      }
    } catch (e) {
      console.warn('OAuth callback - active check failed:', e?.message);
    }
    
    // Generate token for OAuth user
    const token = generateToken(req.user);
    console.log('OAuth callback - Token generated:', token.substring(0, 20) + '...');
    
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const redirectUrl = `${frontendUrl}/login?token=${token}`;
    console.log('OAuth callback - Redirecting to:', redirectUrl);
    try { logEvent('auth_oauth_success', { userId: req.user?._id?.toString?.(), provider: req.user?.oauthProvider }); } catch {}
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    try { logEvent('auth_oauth_failed', { error: String(error?.message || error) }); } catch {}
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error.message)}`);
  }
};

// Listar usuarios (solo ADMIN)
/**
 * @summary Lista usuarios (solo administradores).
 */
exports.listUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('email username name role active avatar lastLoginAt password')
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    
    // Agregar campo has_password
    const usersWithPasswordFlag = users.map(u => ({
      id: u._id,
      email: u.email,
      username: u.username,
      name: u.name,
      role: u.role,
      active: u.active,
      avatar: u.avatar,
      last_login_at: u.lastLoginAt,
      has_password: !!u.password
    }));
    
    try { logEvent('admin_list_users', { byUserId: req.userClaims?.id, count: usersWithPasswordFlag.length }); } catch {}
    res.json({ success: true, users: usersWithPasswordFlag });
  } catch (error) {
    console.error('listUsers error:', error);
    try { logEvent('admin_list_users_failed', { byUserId: req.userClaims?.id, error: String(error?.message || error) }); } catch {}
    res.status(500).json({ success: false, message: 'Error al listar usuarios' });
  }
};

// Actualizar rol de usuario (solo ADMIN)
/**
 * @summary Actualiza el rol de un usuario (solo administradores).
 */
exports.updateUserRole = async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body || {};

    if (!userId || !role) {
      return res.status(400).json({ success: false, message: 'Se requiere el id del usuario y el rol' });
    }

    const allowed = ['viewer', 'operator', 'admin'];
    const newRole = String(role).toLowerCase();
    if (!allowed.includes(newRole)) {
      return res.status(400).json({ success: false, message: 'Rol Invalido' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.role = newRole;
    await user.save();

    try { logEvent('admin_update_role_success', { targetUserId: userId, role: newRole, byUserId: req.userClaims?.id }); } catch {}
    res.json({ success: true, user: user.toPublicJSON() });
  } catch (error) {
    console.error('updateUserRole error:', error);
    try { logEvent('admin_update_role_failed', { targetUserId: req.params?.id, byUserId: req.userClaims?.id, error: String(error?.message || error) }); } catch {}
    res.status(500).json({ success: false, message: 'No se pudo actualizar el rol del usuario' });
  }
};
