const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  password: {
    type: String,
    select: false // No incluir password por defecto en queries
  },
  name: {
    type: String,
    trim: true
  },
  avatar: {
    type: String
  },
  oauthProvider: {
    type: String,
    enum: ['local', 'google', 'facebook', 'github'],
    default: 'local'
  },
  oauthId: {
    type: String,
    sparse: true
  },
  role: {
    type: String,
    enum: ['viewer', 'operator', 'admin'],
    default: 'viewer'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  active: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  },
  oauthTokens: [{
    provider: String,
    accessToken: String,
    refreshToken: String,
    expiresAt: Date
  }]
}, {
  timestamps: true, // Crea automáticamente createdAt y updatedAt
  collection: 'users'
});

// Índices compuestos para búsquedas OAuth
userSchema.index({ oauthProvider: 1, oauthId: 1 });

// Hash password antes de guardar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Método para obtener datos públicos del usuario
userSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    email: this.email,
    username: this.username,
    name: this.name,
    avatar: this.avatar,
    role: this.role,
    emailVerified: this.emailVerified,
    oauthProvider: this.oauthProvider,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt
  };
};

// Método estático para buscar por email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Método estático para buscar por OAuth
userSchema.statics.findByOAuth = function(provider, oauthId) {
  return this.findOne({ oauthProvider: provider, oauthId });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
