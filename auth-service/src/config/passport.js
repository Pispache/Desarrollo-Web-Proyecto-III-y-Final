const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const db = require('./database');

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id, done) => {
  try {
    const users = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    done(null, users[0]);
  } catch (error) {
    done(error, null);
  }
});

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const avatar = profile.photos[0]?.value;
      
      // Check if user exists
      let users = await db.query(
        'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
        ['google', profile.id]
      );
      
      if (users.length > 0) {
        // Update user info
        await db.query(
          'UPDATE users SET name = ?, avatar = ?, last_login_at = NOW() WHERE id = ?',
          [name, avatar, users[0].id]
        );
        return done(null, users[0]);
      }
      
      // Check if email exists
      users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      
      if (users.length > 0) {
        // Link OAuth to existing account
        await db.query(
          'UPDATE users SET oauth_provider = ?, oauth_id = ?, avatar = ?, last_login_at = NOW() WHERE id = ?',
          ['google', profile.id, avatar, users[0].id]
        );
        return done(null, users[0]);
      }
      
      // Create new user
      const result = await db.query(
        `INSERT INTO users (email, username, name, avatar, oauth_provider, oauth_id, email_verified, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())`,
        [email, email.split('@')[0], name, avatar, 'google', profile.id]
      );
      
      const newUser = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      
      // Store OAuth tokens
      await db.query(
        `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [result.insertId, 'google', accessToken || null, refreshToken || null]
      );
      
      done(null, newUser[0]);
    } catch (error) {
      done(error, null);
    }
  }));
}

// Facebook Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'emails', 'name', 'picture.type(large)']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = `${profile.name.givenName} ${profile.name.familyName}`;
      const avatar = profile.photos?.[0]?.value;
      
      if (!email) {
        return done(new Error('No email from Facebook'), null);
      }
      
      // Similar logic as Google
      let users = await db.query(
        'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
        ['facebook', profile.id]
      );
      
      if (users.length > 0) {
        await db.query(
          'UPDATE users SET name = ?, avatar = ?, last_login_at = NOW() WHERE id = ?',
          [name, avatar, users[0].id]
        );
        return done(null, users[0]);
      }
      
      users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      
      if (users.length > 0) {
        await db.query(
          'UPDATE users SET oauth_provider = ?, oauth_id = ?, avatar = ?, last_login_at = NOW() WHERE id = ?',
          ['facebook', profile.id, avatar, users[0].id]
        );
        return done(null, users[0]);
      }
      
      const result = await db.query(
        `INSERT INTO users (email, username, name, avatar, oauth_provider, oauth_id, email_verified, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())`,
        [email, email.split('@')[0], name, avatar, 'facebook', profile.id]
      );
      
      const newUser = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      
      await db.query(
        `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [result.insertId, 'facebook', accessToken || null, refreshToken || null]
      );
      
      done(null, newUser[0]);
    } catch (error) {
      done(error, null);
    }
  }));
}

// GitHub Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
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
      
      // Similar logic as Google
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
