import { Redis } from 'ioredis';
import { createHash } from 'crypto';
import { logger } from './logger';
import { redisConnection } from '../config/redis';

/**
 * Context caching system for LLM responses
 * Caches prompt + response pairs to avoid duplicate LLM calls
 */
export class ContextCache {
  private redis: Redis;
  private readonly CACHE_PREFIX = 'context:cache:';
  private readonly DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(redis?: Redis) {
    this.redis = redis || redisConnection;
  }

  /**
   * Generate a cache key from prompt and context
   */
  private generateCacheKey(
    prompt: string,
    context: Record<string, any> = {},
    model: string = 'default'
  ): string {
    // Create a deterministic hash from prompt + context + model
    const normalizedContext = this.normalizeContext(context);
    const hashInput = JSON.stringify({
      prompt: prompt.trim(),
      context: normalizedContext,
      model,
    });
    
    const hash = createHash('sha256').update(hashInput).digest('hex');
    return `${this.CACHE_PREFIX}${hash}`;
  }

  /**
   * Normalize context object for consistent hashing
   */
  private normalizeContext(context: Record<string, any>): Record<string, any> {
    // Remove timestamp and other volatile fields
    const normalized = { ...context };
    delete normalized.timestamp;
    delete normalized.requestId;
    delete normalized.sessionId;
    
    // Sort keys for consistent ordering
    const sortedKeys = Object.keys(normalized).sort();
    const sortedContext: Record<string, any> = {};
    
    for (const key of sortedKeys) {
      sortedContext[key] = normalized[key];
    }
    
    return sortedContext;
  }

  /**
   * Check if a cached response exists
   */
  async has(
    prompt: string,
    context: Record<string, any> = {},
    model: string = 'default'
  ): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(prompt, context, model);
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check cache existence', {
        error: error.message,
        prompt: prompt.substring(0, 100),
      });
      return false;
    }
  }

  /**
   * Get cached response
   */
  async get(
    prompt: string,
    context: Record<string, any> = {},
    model: string = 'default'
  ): Promise<{
    response: string;
    metadata: {
      cachedAt: string;
      originalTokens: number;
      hitCount: number;
      model: string;
    };
  } | null> {
    try {
      const cacheKey = this.generateCacheKey(prompt, context, model);
      const cached = await this.redis.hgetall(cacheKey);
      
      if (!cached || !cached.response) {
        return null;
      }

      // Increment hit count
      await this.redis.hincrby(cacheKey, 'hitCount', 1);
      
      // Update TTL on access
      await this.redis.expire(cacheKey, this.DEFAULT_TTL);

      logger.info('Cache hit', {
        cacheKey: cacheKey.substring(0, 20) + '...',
        hitCount: parseInt(cached.hitCount || '0', 10) + 1,
        model,
      });

      return {
        response: cached.response,
        metadata: {
          cachedAt: cached.cachedAt,
          originalTokens: parseInt(cached.originalTokens || '0', 10),
          hitCount: parseInt(cached.hitCount || '0', 10) + 1,
          model: cached.model || model,
        },
      };
    } catch (error) {
      logger.error('Failed to get cached response', {
        error: error.message,
        prompt: prompt.substring(0, 100),
      });
      return null;
    }
  }

  /**
   * Cache a response
   */
  async set(
    prompt: string,
    response: string,
    context: Record<string, any> = {},
    metadata: {
      model?: string;
      tokensUsed?: number;
      provider?: string;
      operation?: string;
    } = {},
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(
        prompt,
        context,
        metadata.model || 'default'
      );
      
      const cacheData = {
        response,
        prompt: prompt.substring(0, 1000), // Store truncated prompt for debugging
        cachedAt: new Date().toISOString(),
        originalTokens: metadata.tokensUsed || 0,
        model: metadata.model || 'default',
        provider: metadata.provider || 'unknown',
        operation: metadata.operation || 'unknown',
        hitCount: 0,
        context: JSON.stringify(this.normalizeContext(context)),
      };

      await this.redis.hset(cacheKey, cacheData);
      await this.redis.expire(cacheKey, ttl);

      logger.info('Response cached', {
        cacheKey: cacheKey.substring(0, 20) + '...',
        responseLength: response.length,
        tokensUsed: metadata.tokensUsed,
        model: metadata.model,
        ttl,
      });
    } catch (error) {
      logger.error('Failed to cache response', {
        error: error.message,
        prompt: prompt.substring(0, 100),
        responseLength: response.length,
      });
      throw error;
    }
  }

  /**
   * Get or set cached response (cache-aside pattern)
   */
  async getOrSet<T>(
    prompt: string,
    context: Record<string, any> = {},
    generator: () => Promise<{
      response: string;
      tokensUsed: number;
      model?: string;
      provider?: string;
    }>,
    options: {
      model?: string;
      operation?: string;
      ttl?: number;
      forceRefresh?: boolean;
    } = {}
  ): Promise<{
    response: string;
    fromCache: boolean;
    tokensUsed: number;
    metadata: {
      cachedAt?: string;
      hitCount?: number;
      model: string;
    };
  }> {
    const model = options.model || 'default';
    
    try {
      // Check cache first (unless force refresh)
      if (!options.forceRefresh) {
        const cached = await this.get(prompt, context, model);
        if (cached) {
          return {
            response: cached.response,
            fromCache: true,
            tokensUsed: 0, // No tokens used for cached response
            metadata: {
              cachedAt: cached.metadata.cachedAt,
              hitCount: cached.metadata.hitCount,
              model: cached.metadata.model,
            },
          };
        }
      }

      // Generate new response
      logger.info('Cache miss, generating new response', {
        operation: options.operation,
        model,
        forceRefresh: options.forceRefresh,
      });

      const result = await generator();
      
      // Cache the result
      await this.set(
        prompt,
        result.response,
        context,
        {
          model: result.model || model,
          tokensUsed: result.tokensUsed,
          provider: result.provider,
          operation: options.operation,
        },
        options.ttl
      );

      return {
        response: result.response,
        fromCache: false,
        tokensUsed: result.tokensUsed,
        metadata: {
          model: result.model || model,
        },
      };
    } catch (error) {
      logger.error('Failed in getOrSet operation', {
        error: error.message,
        operation: options.operation,
        model,
      });
      throw error;
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidate(pattern: string = '*'): Promise<number> {
    try {
      const fullPattern = `${this.CACHE_PREFIX}${pattern}`;
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      
      logger.info('Cache invalidated', {
        pattern: fullPattern,
        keysDeleted: deleted,
      });
      
      return deleted;
    } catch (error) {
      logger.error('Failed to invalidate cache', {
        error: error.message,
        pattern,
      });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    averageHitCount: number;
    cacheSize: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  }> {
    try {
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
      
      if (keys.length === 0) {
        return {
          totalEntries: 0,
          totalHits: 0,
          averageHitCount: 0,
          cacheSize: 0,
          oldestEntry: null,
          newestEntry: null,
        };
      }

      let totalHits = 0;
      let oldestDate = new Date();
      let newestDate = new Date(0);
      let oldestEntry: string | null = null;
      let newestEntry: string | null = null;
      let totalSize = 0;

      // Sample a subset of keys for performance
      const sampleKeys = keys.slice(0, Math.min(100, keys.length));
      
      for (const key of sampleKeys) {
        const data = await this.redis.hgetall(key);
        
        if (data.hitCount) {
          totalHits += parseInt(data.hitCount, 10);
        }
        
        if (data.cachedAt) {
          const cachedDate = new Date(data.cachedAt);
          if (cachedDate < oldestDate) {
            oldestDate = cachedDate;
            oldestEntry = data.cachedAt;
          }
          if (cachedDate > newestDate) {
            newestDate = cachedDate;
            newestEntry = data.cachedAt;
          }
        }
        
        // Estimate size
        totalSize += JSON.stringify(data).length;
      }

      return {
        totalEntries: keys.length,
        totalHits,
        averageHitCount: keys.length > 0 ? totalHits / sampleKeys.length : 0,
        cacheSize: totalSize,
        oldestEntry,
        newestEntry,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', { error: error.message });
      return {
        totalEntries: 0,
        totalHits: 0,
        averageHitCount: 0,
        cacheSize: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }
  }

  /**
   * Warm up cache with common prompts
   */
  async warmUp(
    commonPrompts: Array<{
      prompt: string;
      context?: Record<string, any>;
      model?: string;
    }>,
    generator: (prompt: string, context: Record<string, any>) => Promise<{
      response: string;
      tokensUsed: number;
      model?: string;
      provider?: string;
    }>
  ): Promise<number> {
    let warmedUp = 0;
    
    try {
      for (const { prompt, context = {}, model = 'default' } of commonPrompts) {
        const exists = await this.has(prompt, context, model);
        
        if (!exists) {
          try {
            const result = await generator(prompt, context);
            await this.set(prompt, result.response, context, {
              model: result.model || model,
              tokensUsed: result.tokensUsed,
              provider: result.provider,
              operation: 'warmup',
            });
            warmedUp++;
          } catch (error) {
            logger.warn('Failed to warm up cache entry', {
              prompt: prompt.substring(0, 100),
              error: error.message,
            });
          }
        }
      }
      
      logger.info('Cache warm-up completed', {
        totalPrompts: commonPrompts.length,
        warmedUp,
        skipped: commonPrompts.length - warmedUp,
      });
      
      return warmedUp;
    } catch (error) {
      logger.error('Failed to warm up cache', { error: error.message });
      return warmedUp;
    }
  }
}

// Export singleton instance
export const contextCache = new ContextCache();