/**
 * @summary Configuración de Passport para autenticación OAuth 2.0.
 * @remarks
 * - Este módulo define la serialización de usuario en sesión y las estrategias OAuth
 *   (Google, Facebook, GitHub) usando el flujo Authorization Code.
 * - Requiere las variables de entorno para cada proveedor OAuth.
 * - Persiste/actualiza usuarios en MongoDB vía Mongoose y almacena el último inicio de sesión.
 */
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');

/**
 * @summary Serializa el usuario en la sesión.
 */
passport.serializeUser((user, done) => {
  done(null, user._id.toString());
});

/**
 * @summary Deserializa el usuario desde la sesión.
 */
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth 2.0 Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  /**
   * @summary Estrategia OAuth Google con validación de cuenta activa.
   * @remarks
   * - Tras localizar/crear el usuario, se verifica `active` antes de `done(...)`.
   * - Si el usuario está inactivo, se devuelve `done(new Error('Account inactive'), null)`
   *   para impedir la autenticación y permitir a las rutas redirigir a la UI.
   */
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName || null;
      const avatar = profile.photos?.[0]?.value || null;
      const oauthId = profile.id;
      const username = (email?.split('@')[0]) || null;
      
      if (!email) return done(new Error('No email from Google'), null);

      // Buscar usuario existente por OAuth
      let user = await User.findByOAuth('google', oauthId);
      
      if (user) {
        // Actualizar información y último login
        user.name = name || user.name;
        user.avatar = avatar || user.avatar;
        user.lastLoginAt = new Date();
        
        // Actualizar o agregar token OAuth
        const tokenIndex = user.oauthTokens.findIndex(t => t.provider === 'google');
        if (tokenIndex >= 0) {
          user.oauthTokens[tokenIndex].accessToken = accessToken;
          user.oauthTokens[tokenIndex].refreshToken = refreshToken;
        } else {
          user.oauthTokens.push({
            provider: 'google',
            accessToken,
            refreshToken
          });
        }
        
        await user.save();
        
        if (!user.active) return done(new Error('Account inactive'), null);
        return done(null, user);
      }
      
      // Buscar por email
      user = await User.findByEmail(email);
      
      if (user) {
        // Vincular OAuth a cuenta existente
        user.oauthProvider = 'google';
        user.oauthId = oauthId;
        user.avatar = avatar || user.avatar;
        user.lastLoginAt = new Date();
        user.oauthTokens.push({
          provider: 'google',
          accessToken,
          refreshToken
        });
        await user.save();
        
        if (!user.active) return done(new Error('Account inactive'), null);
        return done(null, user);
      }
      
      // Crear nuevo usuario
      user = new User({
        email,
        username,
        name,
        avatar,
        oauthProvider: 'google',
        oauthId,
        emailVerified: true,
        lastLoginAt: new Date(),
        oauthTokens: [{
          provider: 'google',
          accessToken,
          refreshToken
        }]
      });
      
      await user.save();
      
      if (!user.active) return done(new Error('Account inactive'), null);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }));
}

// Facebook OAuth 2.0 Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  /**
   * @summary Estrategia OAuth Facebook con validación de cuenta activa.
   * @remarks
   * - Bloquea el flujo con `Account inactive` si el usuario está desactivado.
   * - Evita emitir sesión/JWT para cuentas desactivadas.
   */
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'displayName', 'emails', 'photos']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName || null;
      const avatar = profile.photos?.[0]?.value || null;
      const oauthId = profile.id;
      const username = (email?.split('@')[0]) || null;
      
      if (!email) return done(new Error('No email from Facebook'), null);

      // Buscar usuario existente por OAuth
      let user = await User.findByOAuth('facebook', oauthId);
      
      if (user) {
        user.name = name || user.name;
        user.avatar = avatar || user.avatar;
        user.lastLoginAt = new Date();
        
        const tokenIndex = user.oauthTokens.findIndex(t => t.provider === 'facebook');
        if (tokenIndex >= 0) {
          user.oauthTokens[tokenIndex].accessToken = accessToken;
          user.oauthTokens[tokenIndex].refreshToken = refreshToken;
        } else {
          user.oauthTokens.push({
            provider: 'facebook',
            accessToken,
            refreshToken
          });
        }
        
        await user.save();
        
        if (!user.active) return done(new Error('Account inactive'), null);
        return done(null, user);
      }
      
      // Buscar por email
      user = await User.findByEmail(email);
      
      if (user) {
        user.oauthProvider = 'facebook';
        user.oauthId = oauthId;
        user.avatar = avatar || user.avatar;
        user.lastLoginAt = new Date();
        user.oauthTokens.push({
          provider: 'facebook',
          accessToken,
          refreshToken
        });
        await user.save();
        
        if (!user.active) return done(new Error('Account inactive'), null);
        return done(null, user);
      }
      
      // Crear nuevo usuario
      user = new User({
        email,
        username,
        name,
        avatar,
        oauthProvider: 'facebook',
        oauthId,
        emailVerified: true,
        lastLoginAt: new Date(),
        oauthTokens: [{
          provider: 'facebook',
          accessToken,
          refreshToken
        }]
      });
      
      await user.save();
      
      if (!user.active) return done(new Error('Account inactive'), null);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }));
}

// GitHub OAuth 2.0 Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  /**
   * @summary Estrategia OAuth GitHub con validación de cuenta activa.
   * @remarks
   * - Verifica `active` en coincidencias por `oauth_id` o por `email`.
   * - Si está inactivo, aborta con error para que el caller redirija a la UI.
   */
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName || profile.username || null;
      const avatar = profile.photos?.[0]?.value || null;
      const username = profile.username || email?.split('@')[0] || null;
      
      if (!email) {
        return done(new Error('No email from GitHub'), null);
      }
      
      // Buscar usuario existente por OAuth
      let user = await User.findByOAuth('github', profile.id);
      
      if (user) {
        user.name = name || user.name;
        user.avatar = avatar || user.avatar;
        user.lastLoginAt = new Date();
        
        const tokenIndex = user.oauthTokens.findIndex(t => t.provider === 'github');
        if (tokenIndex >= 0) {
          user.oauthTokens[tokenIndex].accessToken = accessToken;
          user.oauthTokens[tokenIndex].refreshToken = refreshToken;
        } else {
          user.oauthTokens.push({
            provider: 'github',
            accessToken,
            refreshToken
          });
        }
        
        await user.save();
        
        if (!user.active) return done(new Error('Account inactive'), null);
        return done(null, user);
      }
      
      // Buscar por email
      user = await User.findByEmail(email);
      
      if (user) {
        user.oauthProvider = 'github';
        user.oauthId = profile.id;
        user.avatar = avatar || user.avatar;
        user.lastLoginAt = new Date();
        user.oauthTokens.push({
          provider: 'github',
          accessToken,
          refreshToken
        });
        await user.save();
        
        if (!user.active) return done(new Error('Account inactive'), null);
        return done(null, user);
      }
      
      // Crear nuevo usuario
      user = new User({
        email,
        username,
        name,
        avatar,
        oauthProvider: 'github',
        oauthId: profile.id,
        emailVerified: true,
        lastLoginAt: new Date(),
        oauthTokens: [{
          provider: 'github',
          accessToken,
          refreshToken
        }]
      });
      
      await user.save();
      
      if (!user.active) return done(new Error('Account inactive'), null);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }));
}

module.exports = passport;
