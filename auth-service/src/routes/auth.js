const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validators');

// Email/Password Authentication
router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/logout', authController.logout);

// Get current user
router.get('/me', authController.me);

// Validate token (for other microservices)
router.post('/validate', authController.validateToken);

// OAuth - Google
router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'] 
}));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  authController.oauthCallback
);

// OAuth - Facebook
router.get('/facebook', passport.authenticate('facebook', { 
  scope: ['email'] 
}));

router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  authController.oauthCallback
);

// OAuth - GitHub
router.get('/github', passport.authenticate('github', { 
  scope: ['user:email'] 
}));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  authController.oauthCallback
);

// Admin-only: list users
router.get('/users', verifyToken, requireAdmin, authController.listUsers);

module.exports = router;
