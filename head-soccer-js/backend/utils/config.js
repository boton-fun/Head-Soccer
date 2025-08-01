const path = require('path');

// Only load .env in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const validateEnvVar = (name, defaultValue = null, required = true) => {
  const value = process.env[name] || defaultValue;
  
  // Debug logging
  console.log(`Env var ${name}: ${value ? 'Set' : 'Not set'}`);
  
  if (required && !value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  
  return value;
};

const config = {
  // Server Configuration
  port: parseInt(validateEnvVar('PORT', '3001', false)),
  nodeEnv: validateEnvVar('NODE_ENV', 'development', false),
  
  // Frontend Configuration
  frontendUrl: validateEnvVar('FRONTEND_URL', 'http://localhost:3000', false),
  
  // Database Configuration
  supabase: {
    url: validateEnvVar('SUPABASE_URL', null, false),
    anonKey: validateEnvVar('SUPABASE_ANON_KEY', null, false),
    serviceKey: validateEnvVar('SUPABASE_SERVICE_KEY', null, false)
  },
  
  // Redis Configuration
  redis: {
    url: validateEnvVar('REDIS_URL', null, false),
    password: validateEnvVar('REDIS_PASSWORD', null, false)
  },
  
  // Security Configuration
  jwt: {
    secret: validateEnvVar('JWT_SECRET', 'default-jwt-secret-change-in-production', false),
    expiresIn: validateEnvVar('JWT_EXPIRES_IN', '7d', false)
  },
  session: {
    secret: validateEnvVar('SESSION_SECRET', 'default-session-secret-change-in-production', false)
  },
  
  // Game Configuration
  game: {
    maxPlayersPerRoom: parseInt(validateEnvVar('MAX_PLAYERS_PER_ROOM', '2', false)),
    timeoutMinutes: parseInt(validateEnvVar('GAME_TIMEOUT_MINUTES', '10', false)),
    matchmakingTimeoutSeconds: parseInt(validateEnvVar('MATCHMAKING_TIMEOUT_SECONDS', '120', false))
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(validateEnvVar('RATE_LIMIT_WINDOW_MS', '900000', false)),
    maxRequests: parseInt(validateEnvVar('RATE_LIMIT_MAX_REQUESTS', '100', false))
  },
  
  // Logging
  logLevel: validateEnvVar('LOG_LEVEL', 'info', false),
  
  // Environment helpers
  isDevelopment: () => config.nodeEnv === 'development',
  isProduction: () => config.nodeEnv === 'production',
  isTest: () => config.nodeEnv === 'test'
};

// Production-specific validations
console.log('=== Environment Debug ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('All env vars:', Object.keys(process.env).filter(key => !key.includes('npm_')).sort());

if (config.isProduction()) {
  // Debug logging
  console.log('=== Production Validation ===');
  console.log('JWT_SECRET from env:', process.env.JWT_SECRET ? 'Set' : 'Not set');
  console.log('JWT_SECRET actual value:', process.env.JWT_SECRET);
  console.log('JWT secret config value:', config.jwt.secret);
  console.log('Checking if equals default:', config.jwt.secret === 'default-jwt-secret-change-in-production');
  
  // Validate critical production environment variables
  if (config.jwt.secret === 'default-jwt-secret-change-in-production') {
    throw new Error('JWT_SECRET must be set to a secure value in production');
  }
  
  if (config.session.secret === 'default-session-secret-change-in-production') {
    throw new Error('SESSION_SECRET must be set to a secure value in production');
  }
  
  // Database should be configured in production
  if (!config.supabase.url || !config.supabase.anonKey) {
    console.warn('Warning: Database configuration is incomplete in production');
  }
}

// Log configuration on startup (excluding sensitive data)
const logConfig = {
  port: config.port,
  nodeEnv: config.nodeEnv,
  frontendUrl: config.frontendUrl,
  logLevel: config.logLevel,
  gameConfig: config.game,
  rateLimit: config.rateLimit,
  databaseConfigured: !!(config.supabase.url && config.supabase.anonKey),
  redisConfigured: !!config.redis.url
};

console.log('Configuration loaded:', JSON.stringify(logConfig, null, 2));

module.exports = config;