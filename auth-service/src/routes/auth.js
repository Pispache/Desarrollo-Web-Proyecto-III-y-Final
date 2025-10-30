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

// Email verification
router.get('/verify-email', authController.verifyEmail);

// OAuth - Google (no utilizado en despliegue actual; rutas conservadas por compatibilidad)
router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'] 
}));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  authController.oauthCallback
);

// OAuth - Facebook (no utilizado en despliegue actual; rutas conservadas por compatibilidad)
router.get('/facebook', passport.authenticate('facebook', { 
  scope: ['email'] 
}));

router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  authController.oauthCallback
);

/**
 * @summary Inicio de OAuth con GitHub (redirige a GitHub con scope `user:email`).
 */
router.get('/github', passport.authenticate('github', { 
  scope: ['user:email'] 
}));

/**
 * @summary Callback de OAuth GitHub. Procesa `code`, autentica al usuario y redirige con JWT.
 */
router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  authController.oauthCallback
);

/**
 * @summary Lista de usuarios (solo ADMIN).
 */
router.get('/users', verifyToken, requireAdmin, authController.listUsers);

/**
 * @summary Actualiza el rol de un usuario (solo ADMIN).
 */
router.patch('/users/:id/role', verifyToken, requireAdmin, authController.updateUserRole);

module.exports = router;
