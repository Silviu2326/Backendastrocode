import Redis from 'ioredis';
import { logger } from './logger';

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
};

// Create Redis instance
export const redis = new Redis(redisConfig);

// Redis event handlers
redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis is ready to receive commands');
});

redis.on('error', (error) => {
  logger.error('Redis connection error:', {
    error: error.message,
    stack: error.stack
  });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (time) => {
  logger.info(`Redis reconnecting in ${time}ms`);
});

redis.on('end', () => {
  logger.warn('Redis connection ended');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Closing Redis connection...');
  await redis.quit();
});

process.on('SIGINT', async () => {
  logger.info('Closing Redis connection...');
  await redis.quit();
});

// Export Redis instance
export default redis;

// Helper functions for common Redis operations
export const redisHelpers = {
  // Set with expiration
  async setex(key: string, seconds: number, value: string): Promise<string | null> {
    try {
      return await redis.setex(key, seconds, value);
    } catch (error) {
      logger.error('Redis SETEX error:', { key, error });
      throw error;
    }
  },

  // Get value
  async get(key: string): Promise<string | null> {
    try {
      return await redis.get(key);
    } catch (error) {
      logger.error('Redis GET error:', { key, error });
      throw error;
    }
  },

  // Delete key
  async del(key: string): Promise<number> {
    try {
      return await redis.del(key);
    } catch (error) {
      logger.error('Redis DEL error:', { key, error });
      throw error;
    }
  },

  // Check if key exists
  async exists(key: string): Promise<number> {
    try {
      return await redis.exists(key);
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error });
      throw error;
    }
  },

  // Set hash field
  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await redis.hset(key, field, value);
    } catch (error) {
      logger.error('Redis HSET error:', { key, field, error });
      throw error;
    }
  },

  // Get hash field
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await redis.hget(key, field);
    } catch (error) {
      logger.error('Redis HGET error:', { key, field, error });
      throw error;
    }
  },

  // Get all hash fields
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await redis.hgetall(key);
    } catch (error) {
      logger.error('Redis HGETALL error:', { key, error });
      throw error;
    }
  },

  // Add to set
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await redis.sadd(key, ...members);
    } catch (error) {
      logger.error('Redis SADD error:', { key, members, error });
      throw error;
    }
  },

  // Get set members
  async smembers(key: string): Promise<string[]> {
    try {
      return await redis.smembers(key);
    } catch (error) {
      logger.error('Redis SMEMBERS error:', { key, error });
      throw error;
    }
  },

  // Push to list
  async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await redis.lpush(key, ...values);
    } catch (error) {
      logger.error('Redis LPUSH error:', { key, values, error });
      throw error;
    }
  },

  // Pop from list
  async lpop(key: string): Promise<string | null> {
    try {
      return await redis.lpop(key);
    } catch (error) {
      logger.error('Redis LPOP error:', { key, error });
      throw error;
    }
  }
};