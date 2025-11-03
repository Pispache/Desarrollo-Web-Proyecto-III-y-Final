/**
 * Script para listar todos los usuarios registrados en MongoDB
 * Ejecutar: node list-users.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:MongoAuth2025!@localhost:27017/auth_db?authSource=admin';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

async function listUsers() {
  try {
    console.log(`\n${colors.blue}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.blue}📋 Usuarios Registrados en MongoDB${colors.reset}`);
    console.log(`${colors.blue}${'═'.repeat(80)}${colors.reset}\n`);

    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log(`${colors.green}✅ Conectado a MongoDB${colors.reset}\n`);

    // Obtener todos los usuarios
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    console.log(`${colors.cyan}Total de usuarios: ${users.length}${colors.reset}\n`);

    if (users.length === 0) {
      console.log(`${colors.yellow}⚠️  No hay usuarios registrados${colors.reset}\n`);
      return;
    }

    // Mostrar cada usuario
    users.forEach((user, index) => {
      const num = (index + 1).toString().padStart(2, '0');
      const status = user.active ? `${colors.green}✅ Activo${colors.reset}` : `${colors.red}❌ Inactivo${colors.reset}`;
      const verified = user.emailVerified ? '✓' : '✗';
      const provider = user.oauthProvider === 'local' ? 'Local' : `OAuth (${user.oauthProvider})`;
      
      console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.yellow}Usuario #${num}${colors.reset}`);
      console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`  ${colors.cyan}ID:${colors.reset}              ${user._id}`);
      console.log(`  ${colors.cyan}Email:${colors.reset}           ${user.email} ${verified}`);
      console.log(`  ${colors.cyan}Nombre:${colors.reset}          ${user.name}`);
      console.log(`  ${colors.cyan}Username:${colors.reset}        ${user.username || 'N/A'}`);
      console.log(`  ${colors.cyan}Rol:${colors.reset}             ${user.role.toUpperCase()}`);
      console.log(`  ${colors.cyan}Proveedor:${colors.reset}       ${provider}`);
      console.log(`  ${colors.cyan}Estado:${colors.reset}          ${status}`);
      console.log(`  ${colors.cyan}Email Verificado:${colors.reset} ${user.emailVerified ? 'Sí' : 'No'}`);
      
      if (user.avatar) {
        console.log(`  ${colors.cyan}Avatar:${colors.reset}          ${user.avatar.substring(0, 50)}...`);
      }
      
      if (user.lastLoginAt) {
        const lastLogin = new Date(user.lastLoginAt).toLocaleString('es-GT', {
          timeZone: 'America/Guatemala',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        console.log(`  ${colors.cyan}Último Login:${colors.reset}    ${lastLogin}`);
      }
      
      const createdAt = new Date(user.createdAt).toLocaleString('es-GT', {
        timeZone: 'America/Guatemala',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      console.log(`  ${colors.cyan}Registrado:${colors.reset}      ${createdAt}`);
      
      if (user.oauthTokens && user.oauthTokens.length > 0) {
        console.log(`  ${colors.cyan}OAuth Tokens:${colors.reset}    ${user.oauthTokens.length} token(s)`);
        user.oauthTokens.forEach((token, i) => {
          console.log(`    ${i + 1}. ${token.provider} - ${token.accessToken.substring(0, 20)}...`);
        });
      }
      
      console.log('');
    });

    // Resumen por rol
    console.log(`${colors.blue}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.blue}📊 Resumen por Rol${colors.reset}`);
    console.log(`${colors.blue}${'═'.repeat(80)}${colors.reset}\n`);
    
    const roleCount = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(roleCount).forEach(([role, count]) => {
      console.log(`  ${colors.cyan}${role.toUpperCase()}:${colors.reset} ${count} usuario(s)`);
    });

    // Resumen por proveedor
    console.log(`\n${colors.blue}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.blue}🔐 Resumen por Proveedor de Autenticación${colors.reset}`);
    console.log(`${colors.blue}${'═'.repeat(80)}${colors.reset}\n`);
    
    const providerCount = users.reduce((acc, user) => {
      acc[user.oauthProvider] = (acc[user.oauthProvider] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(providerCount).forEach(([provider, count]) => {
      console.log(`  ${colors.cyan}${provider.toUpperCase()}:${colors.reset} ${count} usuario(s)`);
    });

    // Resumen por estado
    console.log(`\n${colors.blue}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.blue}✓ Resumen por Estado${colors.reset}`);
    console.log(`${colors.blue}${'═'.repeat(80)}${colors.reset}\n`);
    
    const activeCount = users.filter(u => u.active).length;
    const inactiveCount = users.filter(u => !u.active).length;
    
    console.log(`  ${colors.green}Activos:${colors.reset}   ${activeCount} usuario(s)`);
    console.log(`  ${colors.red}Inactivos:${colors.reset} ${inactiveCount} usuario(s)`);

    console.log('');

  } catch (error) {
    console.error(`\n${colors.red}❌ Error:${colors.reset}`, error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log(`${colors.green}✅ Desconectado de MongoDB${colors.reset}\n`);
  }
}

// Ejecutar
listUsers();
