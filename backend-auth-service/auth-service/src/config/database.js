const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_db';

let isConnected = false;

async function initialize() {
  try {
    if (isConnected) {
      console.log('✅ MongoDB already connected');
      return mongoose.connection;
    }

    // Configuración de conexión
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI, options);
    
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);

    // Event listeners
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
      isConnected = true;
    });

    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isConnected = false;
    throw error;
  }
}

async function disconnect() {
  try {
    if (isConnected) {
      await mongoose.disconnect();
      isConnected = false;
      console.log('✅ MongoDB disconnected gracefully');
    }
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
    throw error;
  }
}

function getConnection() {
  return mongoose.connection;
}

function isReady() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
  initialize,
  disconnect,
  getConnection,
  isReady,
  get connection() {
    return mongoose.connection;
  }
};
