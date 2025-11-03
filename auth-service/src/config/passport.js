/**
 * @summary Configuración de Passport para autenticación OAuth 2.0 con GitHub.
 * @remarks
 * - Este módulo define la serialización de usuario en sesión y la estrategia de GitHub
 *   usando el flujo Authorization Code.
 * - Requiere las variables de entorno: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
 *   `GITHUB_CALLBACK_URL`.
 * - Persiste/actualiza usuarios en MySQL vía `db.query()` y almacena el último inicio de sesión.
 */
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const db = require('./database');

/**
 * @summary Serializa el usuario en la sesión.
 * @param {object} user Objeto de usuario persistido (con `id`).
 * @param {(err: any, id?: number) => void} done Callback de finalización.
 * @returns {void}
 */
// Google OAuth 2.0 Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
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

      let users = await db.query('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?', ['google', oauthId]);
      if (users.length > 0) {
        await db.query('UPDATE users SET name = ?, avatar = ?, last_login_at = NOW() WHERE id = ?', [name || users[0].name, avatar || users[0].avatar, users[0].id]);
        const found = users[0];
        if (!found.active) return done(new Error('Account inactive'), null);
        return done(null, found);
      }
      users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length > 0) {
        await db.query('UPDATE users SET oauth_provider = ?, oauth_id = ?, avatar = ?, last_login_at = NOW() WHERE id = ?', ['google', oauthId, avatar || users[0].avatar, users[0].id]);
        const found2 = users[0];
        if (!found2.active) return done(new Error('Account inactive'), null);
        return done(null, found2);
      }
      const result = await db.query(
        `INSERT INTO users (email, username, name, avatar, oauth_provider, oauth_id, email_verified, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())`,
        [email, username, name, avatar, 'google', oauthId]
      );
      const newUser = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      await db.query(
        `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [result.insertId, 'google', accessToken || null, refreshToken || null]
      );
      const created = newUser[0];
      if (!created.active) return done(new Error('Account inactive'), null);
      done(null, created);
    } catch (error) {
      done(error, null);
    }
  }));
}

// Facebook OAuth 2.0 Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
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

      let users = await db.query('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?', ['facebook', oauthId]);
      if (users.length > 0) {
        await db.query('UPDATE users SET name = ?, avatar = ?, last_login_at = NOW() WHERE id = ?', [name || users[0].name, avatar || users[0].avatar, users[0].id]);
        const found = users[0];
        if (!found.active) return done(new Error('Account inactive'), null);
        return done(null, found);
      }
      users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length > 0) {
        await db.query('UPDATE users SET oauth_provider = ?, oauth_id = ?, avatar = ?, last_login_at = NOW() WHERE id = ?', ['facebook', oauthId, avatar || users[0].avatar, users[0].id]);
        const found2 = users[0];
        if (!found2.active) return done(new Error('Account inactive'), null);
        return done(null, found2);
      }
      const result = await db.query(
        `INSERT INTO users (email, username, name, avatar, oauth_provider, oauth_id, email_verified, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())`,
        [email, username, name, avatar, 'facebook', oauthId]
      );
      const newUser = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      await db.query(
        `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [result.insertId, 'facebook', accessToken || null, refreshToken || null]
      );
      const created = newUser[0];
      if (!created.active) return done(new Error('Account inactive'), null);
      done(null, created);
    } catch (error) {
      done(error, null);
    }
  }));
}
passport.serializeUser((user, done) => {
  done(null, user.id);
});

/**
 * @summary Deserializa el usuario desde la sesión.
 * @param {number} id Identificador de usuario almacenado en la sesión.
 * @param {(err: any, user?: object|null) => void} done Callback de finalización.
 * @returns {Promise<void>}
 */
passport.deserializeUser(async (id, done) => {
  try {
    const users = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    done(null, users[0]);
  } catch (error) {
    done(error, null);
  }
});

/**
 * @summary Estrategia de GitHub OAuth 2.0 (Authorization Code).
 * @remarks
 * - Usa `passport-github2` para iniciar el flujo y procesar el `callback`.
 * - Inserta/actualiza el usuario por `oauth_provider='github'` y `oauth_id`.
 * - Actualiza `name`, `avatar` y `last_login_at`. Si falta `username`, se deriva del email.
 * - No expone el `client_secret` en el navegador; el intercambio de `code`→`access_token` se hace en backend.
 */
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email']
  },
  async (accessToken, refreshToken, profile, done) => {
    // Nota: este callback se ejecuta tras el intercambio de `code` por `access_token`.
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName || profile.username || null;
      const avatar = profile.photos?.[0]?.value || null;
      const username = profile.username || email?.split('@')[0] || null;
      
      if (!email) {
        return done(new Error('No email from GitHub'), null);
      }
      
      let users = await db.query(
        'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
        ['github', profile.id]
      );
      
      if (users.length > 0) {
        await db.query(
          'UPDATE users SET name = ?, avatar = ?, last_login_at = NOW() WHERE id = ?',
          [name || users[0].name, avatar || users[0].avatar, users[0].id]
        );
        const found = users[0];
        if (!found.active) return done(new Error('Account inactive'), null);
        return done(null, found);
      }
      
      users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      
      if (users.length > 0) {
        await db.query(
          'UPDATE users SET oauth_provider = ?, oauth_id = ?, avatar = ?, last_login_at = NOW() WHERE id = ?',
          ['github', profile.id, avatar || users[0].avatar, users[0].id]
        );
        const found2 = users[0];
        if (!found2.active) return done(new Error('Account inactive'), null);
        return done(null, found2);
      }
      
      const result = await db.query(
        `INSERT INTO users (email, username, name, avatar, oauth_provider, oauth_id, email_verified, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())`,
        [email, username, name, avatar, 'github', profile.id]
      );
      
      const newUser = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      
      await db.query(
        `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [result.insertId, 'github', accessToken || null, refreshToken || null]
      );
      
      const created = newUser[0];
      if (!created.active) return done(new Error('Account inactive'), null);
      done(null, created);
    } catch (error) {
      done(error, null);
    }
  }));
}

module.exports = passport;
