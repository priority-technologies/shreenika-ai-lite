/**
 * Environment Configuration Loader
 * Validates and loads environment variables with safe defaults
 *
 * Week 1, Day 1 Task
 */

const logger = require('../utils/logger');

class EnvironmentConfig {
  constructor() {
    this.config = {};
  }

  /**
   * Load and validate environment variables
   */
  load() {
    try {
      logger.info('[ENV] Loading environment configuration...');

      // Critical variables (must exist)
      const critical = [
        'GOOGLE_API_KEY',
        'MONGODB_URI',
        'JWT_SECRET'
      ];

      // Optional variables with defaults
      const optional = {
        NODE_ENV: 'development',
        PORT: 5000,
        LOG_LEVEL: 'info',
        SESSION_TIMEOUT_MS: 600000,
        MAX_CALL_DURATION_SECONDS: 600,
        ENABLE_CACHE: true,
        CACHE_HIT_THRESHOLD: 50,
        TRACK_COSTS: true,
        COST_ALERT_THRESHOLD_PER_MIN: 0.02
      };

      // Check critical variables
      for (const variable of critical) {
        if (!process.env[variable]) {
          throw new Error(`Critical environment variable missing: ${variable}`);
        }
        this.config[variable] = process.env[variable];
        logger.info(`[ENV] ${variable}: ✓ loaded (masked)`);
      }

      // Set optional variables with defaults
      for (const [variable, defaultValue] of Object.entries(optional)) {
        this.config[variable] = process.env[variable] !== undefined
          ? process.env[variable]
          : defaultValue;
        logger.info(`[ENV] ${variable}: ${this.config[variable]}`);
      }

      logger.info('[ENV] All environment variables validated');
      return this.config;

    } catch (error) {
      logger.error('[ENV] Configuration loading failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get config value
   */
  get(key) {
    if (!(key in this.config)) {
      logger.warn(`[ENV] Configuration key not found: ${key}`);
      return null;
    }
    return this.config[key];
  }

  /**
   * Get all config
   */
  getAll() {
    return { ...this.config };
  }
}

// Singleton instance
let instance = null;

function getEnvironmentConfig() {
  if (!instance) {
    instance = new EnvironmentConfig();
  }
  return instance;
}

// Load immediately
try {
  const envConfig = getEnvironmentConfig();
  envConfig.load();
} catch (error) {
  logger.error('[ENV] Failed to load environment configuration', {
    error: error.message
  });
  process.exit(1);
}

module.exports = {
  EnvironmentConfig,
  getEnvironmentConfig
};
