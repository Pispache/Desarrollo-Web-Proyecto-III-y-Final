/**
 * @summary Rutas del Auth Service (Node/Express).
 * @remarks
 * - Expone endpoints de autenticación clásica (email/contraseña) y OAuth con GitHub.\
 * - Incluye endpoints de utilería (`/me`, `/validate`) y administración (listar/actualizar rol).\
 * - Protecciones: `verifyToken` y `requireAdmin` donde corresponde.
 */
const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validators');

/**
 * @summary Registro/Login vía email y contraseña.
 */
router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/logout', authController.logout);

/**
 * @summary Devuelve el usuario actual leyendo el JWT del header Authorization.
 */
router.get('/me', authController.me);

/**
 * @summary Valida un JWT (uso entre microservicios).
 */
router.post('/validate', authController.validateToken);


// OAuth - Google
router.get('/google', (req, res, next) => {
  try {
    console.log('[Google] /google init:', { sid: req.sessionID, cookie: req.headers.cookie });
  } catch {}
  next();
}, passport.authenticate('google', { 
  scope: ['profile', 'email']
}));

// Usar callback personalizado para capturar el error real y redirigir a la UI con mensaje
router.get('/google/callback', (req, res, next) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
  passport.authenticate('google', (err, user, info) => {
    if (err || !user) {
      console.error('Google OAuth failure:', err || info);
      try { console.log('[Google] callback failure:', { sid: req.sessionID, cookie: req.headers.cookie, info }); } catch {}
      const rawMsg = err?.message || info?.message || 'oauth_failed';
      if (String(rawMsg).toLowerCase().includes('inactive')) {
        return res.redirect(`${FRONTEND_URL}/cuenta-inactiva`);
      }
      const msg = encodeURIComponent(rawMsg);
      return res.redirect(`${FRONTEND_URL}/login?error=${msg}`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Google OAuth login error:', loginErr);
        const msg = encodeURIComponent(loginErr?.message || 'oauth_login_failed');
        return res.redirect(`${FRONTEND_URL}/login?error=${msg}`);
      }
      try { console.log('[Google] callback success:', { sid: req.sessionID, userId: user?.id }); } catch {}
      // Reutiliza el callback común para emitir JWT y redirigir con token
      return authController.oauthCallback(req, res);
    });
  })(req, res, next);
});

// OAuth - Facebook 
/**
 * @summary Inicio de OAuth con Facebook.
 * @remarks
 * - Redirige al proveedor solicitando alcance de correo electrónico.
 */
router.get('/facebook', passport.authenticate('facebook', { 
  scope: ['email'] 
}));

/**
 * @summary Callback de OAuth Facebook.
 * @remarks
 * - Maneja errores del proveedor y usuarios inactivos (redirige a `/cuenta-inactiva`).
 * - Si la autenticación fue exitosa, lo manda a `oauthCallback` para emitir JWT y redirigir a la UI.
 */
router.get('/facebook/callback', (req, res, next) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
  passport.authenticate('facebook', (err, user, info) => {
    if (err || !user) {
      console.error('Facebook OAuth failure:', err || info);
      try { console.log('[Facebook] callback failure:', { sid: req.sessionID, cookie: req.headers.cookie, info }); } catch {}
      const rawMsg = err?.message || info?.message || 'oauth_failed';
      if (String(rawMsg).toLowerCase().includes('inactive')) {
        return res.redirect(`${FRONTEND_URL}/cuenta-inactiva`);
      }
      const msg = encodeURIComponent(rawMsg);
      return res.redirect(`${FRONTEND_URL}/login?error=${msg}`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Facebook OAuth login error:', loginErr);
        const msg = encodeURIComponent(loginErr?.message || 'oauth_login_failed');
        return res.redirect(`${FRONTEND_URL}/login?error=${msg}`);
      }
      return authController.oauthCallback(req, res);
    });
  })(req, res, next);
});

/**
 * @summary Inicio de OAuth con GitHub (redirige a GitHub con scope `user:email`).
 */
router.get('/github', passport.authenticate('github', { 
  scope: ['user:email'] 
}));

/**
 * @summary Callback de OAuth GitHub. Procesa `code`, autentica al usuario y redirige con JWT.
 */
router.get('/github/callback', (req, res, next) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
  passport.authenticate('github', (err, user, info) => {
    if (err || !user) {
      console.error('GitHub OAuth failure:', err || info);
      const rawMsg = err?.message || info?.message || 'oauth_failed';
      if (String(rawMsg).toLowerCase().includes('inactive')) {
        return res.redirect(`${FRONTEND_URL}/cuenta-inactiva`);
      }
      const msg = encodeURIComponent(rawMsg);
      return res.redirect(`${FRONTEND_URL}/login?error=${msg}`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('GitHub OAuth login error:', loginErr);
        const msg = encodeURIComponent(loginErr?.message || 'oauth_login_failed');
        return res.redirect(`${FRONTEND_URL}/login?error=${msg}`);
      }
      return authController.oauthCallback(req, res);
    });
  })(req, res, next);
});

/**
 * @summary Lista de usuarios (solo ADMIN).
 */
router.get('/users', verifyToken, requireAdmin, authController.listUsers);

/**
 * @summary Actualiza el rol de un usuario (solo ADMIN).
 */
router.patch('/users/:id/role', verifyToken, requireAdmin, authController.updateUserRole);

/**
 * @summary Actualiza el estado activo de un usuario (solo ADMIN).
 */
router.patch('/users/:id/active', verifyToken, requireAdmin, authController.updateUserActive);

/**
 * @summary Resetear contraseña de usuario local (solo ADMIN). Devuelve clave temporal.
 */
router.post('/users/:id/reset-password', verifyToken, requireAdmin, authController.resetUserPassword);

module.exports = router;
