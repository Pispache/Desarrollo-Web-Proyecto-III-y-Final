const User = require('../models/User');

/**
 * Seed de usuario admin en MongoDB a partir de variables de entorno.
 * Variables soportadas:
 * - ADMIN_SEED_EMAIL (obligatoria)
 * - ADMIN_SEED_PASSWORD (obligatoria)
 * - ADMIN_SEED_NAME (opcional, por defecto "Admin")
 * - ADMIN_SEED_ROLE (opcional, por defecto "admin")
 */
module.exports = async function seedAdminFromEnv(logger = console) {
  try {
    let email = (process.env.ADMIN_SEED_EMAIL || '').toLowerCase().trim();
    const password = process.env.ADMIN_SEED_PASSWORD || '';
    const name = process.env.ADMIN_SEED_NAME || 'Admin';
    const role = (process.env.ADMIN_SEED_ROLE || 'admin').toLowerCase();
    const forcePwd = String(process.env.ADMIN_SEED_FORCE_PASSWORD || 'false').toLowerCase() === 'true';

    if (!email || !password) {
      logger.log('[auth-seed] ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD no definidos; se omite seed.');
      return;
    }

    // Normalizar: si el dominio no tiene TLD (sin punto), añadir .dev
    let rawEmail = email; // conservar original para fallback
    try {
      const at = email.indexOf('@');
      if (at > 0) {
        const domain = email.slice(at + 1);
        if (domain && !domain.includes('.')) {
          const normalized = email + '.dev';
          logger.log(`[auth-seed] Normalizando email '${email}' => '${normalized}' (añadido .dev)`);
          email = normalized;
        }
      }
    } catch {}

    // Buscar usuario existente por email normalizado, email crudo o username derivado
    const desiredUsername = email.split('@')[0];
    const existing = await User.findOne({
      $or: [
        { email: email },
        { email: rawEmail },
        { username: desiredUsername }
      ]
    });
    if (existing) {
      let changed = false;
      if (existing.email !== email) { existing.email = email; changed = true; }
      if (!existing.username) { existing.username = desiredUsername; changed = true; }
      if (existing.role !== role) { existing.role = role; changed = true; }
      if (existing.name !== name) { existing.name = name; changed = true; }
      if (!existing.active) { existing.active = true; changed = true; }
      if (!existing.emailVerified) { existing.emailVerified = true; changed = true; }
      if (forcePwd && password) { existing.password = password; changed = true; }
      if (changed) {
        await existing.save();
        logger.log(`[auth-seed] Usuario admin '${existing.email}' actualizado (role=${role}${forcePwd ? ', password reset' : ''}).`);
      } else {
        logger.log(`[auth-seed] Usuario '${existing.email}' ya existe, sin cambios.`);
      }
      return;
    }

    const user = new User({
      email,
      username: desiredUsername,
      password,
      name,
      role,
      active: true,
      emailVerified: true,
      lastLoginAt: new Date()
    });
    await user.save();
    logger.log(`[auth-seed] Usuario admin '${email}' creado.`);
  } catch (err) {
    logger.error('[auth-seed] Error creando admin:', err.message);
  }
};
