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
const db = require('./database');

/**
 * @summary Serializa el usuario en la sesión.
 * @param {object} user Objeto de usuario persistido (con `id`).
 * @param {(err: any, id?: number) => void} done Callback de finalización.
 * @returns {void}
 */
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
        return done(null, users[0]);
      }
      
      users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      
      if (users.length > 0) {
        await db.query(
          'UPDATE users SET oauth_provider = ?, oauth_id = ?, avatar = ?, last_login_at = NOW() WHERE id = ?',
          ['github', profile.id, avatar || users[0].avatar, users[0].id]
        );
        return done(null, users[0]);
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
      
      done(null, newUser[0]);
    } catch (error) {
      done(error, null);
    }
  }));
}

module.exports = passport;
