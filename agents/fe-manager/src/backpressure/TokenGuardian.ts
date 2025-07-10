import { Redis } from 'ioredis';
import { logger } from '../../../../shared/utils/logger';
import { eventBus, SystemEvent } from '../events/EventBus';
import { PrismaClient } from '@prisma/client';

export interface TokenUsageStats {
  provider: string;
  model: string;
  tokensUsed: number;
  timeWindow: number; // minutes
  limit: number;
  remaining: number;
  resetTime: Date;
}

export interface BackpressureConfig {
  providers: {
    [provider: string]: {
      models: {
        [model: string]: {
          tokensPerMinute: number;
          tokensPerHour: number;
          tokensPerDay: number;
          costPerToken: number;
        };
      };
    };
  };
  overloadThresholds: {
    warning: number; // 0.8 = 80% of limit
    critical: number; // 0.95 = 95% of limit
  };
  backpressureMultipliers: {
    warning: number; // 1.5x delay
    critical: number; // 3x delay
    emergency: number; // 10x delay
  };
}

class TokenGuardian {
  private redis: Redis;
  private prisma: PrismaClient;
  private config: BackpressureConfig;
  private baseDelayMs = 500;

  constructor(redis: Redis, config: BackpressureConfig) {
    this.redis = redis;
    this.prisma = new PrismaClient();
    this.config = config;
  }

  async checkTokenAvailability(
    provider: string,
    model: string,
    estimatedTokens: number
  ): Promise<{ allowed: boolean; delayMs: number; reason?: string }> {
    try {
      const stats = await this.getTokenUsageStats(provider, model);
      const providerConfig = this.config.providers[provider]?.models[model];
      
      if (!providerConfig) {
        logger.warn('Unknown provider/model configuration', { provider, model });
        return { allowed: true, delayMs: 0 };
      }

      // Check different time windows
      const checks = [
        { window: 1, limit: providerConfig.tokensPerMinute, key: 'minute' },
        { window: 60, limit: providerConfig.tokensPerHour, key: 'hour' },
        { window: 1440, limit: providerConfig.tokensPerDay, key: 'day' }
      ];

      for (const check of checks) {
        const usage = await this.getUsageInWindow(provider, model, check.window);
        const projectedUsage = usage + estimatedTokens;
        const utilizationRate = projectedUsage / check.limit;

        if (projectedUsage > check.limit) {
          const delayMs = this.calculateEmergencyDelay(utilizationRate);
          await this.publishOverloadEvent(provider, model, 'emergency', {
            window: check.key,
            usage: projectedUsage,
            limit: check.limit,
            utilizationRate
          });
          
          return {
            allowed: false,
            delayMs,
            reason: `Token limit exceeded for ${check.key} window (${projectedUsage}/${check.limit})`
          };
        }

        if (utilizationRate >= this.config.overloadThresholds.critical) {
          const delayMs = this.calculateCriticalDelay(utilizationRate);
          await this.publishOverloadEvent(provider, model, 'critical', {
            window: check.key,
            usage: projectedUsage,
            limit: check.limit,
            utilizationRate
          });
          
          return {
            allowed: true,
            delayMs,
            reason: `Critical token usage in ${check.key} window (${(utilizationRate * 100).toFixed(1)}%)`
          };
        }

        if (utilizationRate >= this.config.overloadThresholds.warning) {
          const delayMs = this.calculateWarningDelay(utilizationRate);
          await this.publishOverloadEvent(provider, model, 'warning', {
            window: check.key,
            usage: projectedUsage,
            limit: check.limit,
            utilizationRate
          });
          
          return {
            allowed: true,
            delayMs,
            reason: `High token usage in ${check.key} window (${(utilizationRate * 100).toFixed(1)}%)`
          };
        }
      }

      return { allowed: true, delayMs: 0 };
    } catch (error) {
      logger.error('Error checking token availability', { 
        provider, 
        model, 
        estimatedTokens, 
        error: error.message 
      });
      // Fail safe - allow with minimal delay
      return { allowed: true, delayMs: this.baseDelayMs };
    }
  }

  async recordTokenUsage(
    provider: string,
    model: string,
    tokensUsed: number,
    jobRunId?: string
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const cost = this.calculateCost(provider, model, tokensUsed);

      // Store in Redis for real-time tracking
      const redisKey = `tokens:${provider}:${model}`;
      await this.redis.zadd(redisKey, timestamp, `${timestamp}:${tokensUsed}`);
      
      // Set expiry for cleanup (keep 7 days)
      await this.redis.expire(redisKey, 7 * 24 * 60 * 60);

      // Store in Prisma for analytics
      await this.prisma.tokenUsage.create({
        data: {
          provider,
          model,
          tokens: tokensUsed,
          cost,
          jobRunId,
          timestamp: new Date(timestamp)
        }
      });

      logger.debug('Token usage recorded', { 
        provider, 
        model, 
        tokensUsed, 
        cost, 
        jobRunId 
      });
    } catch (error) {
      logger.error('Error recording token usage', { 
        provider, 
        model, 
        tokensUsed, 
        error: error.message 
      });
    }
  }

  private async getUsageInWindow(
    provider: string,
    model: string,
    windowMinutes: number
  ): Promise<number> {
    const redisKey = `tokens:${provider}:${model}`;
    const now = Date.now();
    const windowStart = now - (windowMinutes * 60 * 1000);

    try {
      const entries = await this.redis.zrangebyscore(
        redisKey,
        windowStart,
        now
      );

      return entries.reduce((total, entry) => {
        const [, tokens] = entry.split(':');
        return total + parseInt(tokens, 10);
      }, 0);
    } catch (error) {
      logger.error('Error getting usage in window', { 
        provider, 
        model, 
        windowMinutes, 
        error: error.message 
      });
      return 0;
    }
  }

  private async getTokenUsageStats(
    provider: string,
    model: string
  ): Promise<TokenUsageStats> {
    const providerConfig = this.config.providers[provider]?.models[model];
    if (!providerConfig) {
      throw new Error(`Unknown provider/model: ${provider}/${model}`);
    }

    const minuteUsage = await this.getUsageInWindow(provider, model, 1);
    const hourUsage = await this.getUsageInWindow(provider, model, 60);
    const dayUsage = await this.getUsageInWindow(provider, model, 1440);

    // Use the most restrictive limit
    const limits = [
      { usage: minuteUsage, limit: providerConfig.tokensPerMinute, window: 1 },
      { usage: hourUsage, limit: providerConfig.tokensPerHour, window: 60 },
      { usage: dayUsage, limit: providerConfig.tokensPerDay, window: 1440 }
    ];

    const mostRestrictive = limits.reduce((prev, curr) => 
      (curr.usage / curr.limit) > (prev.usage / prev.limit) ? curr : prev
    );

    return {
      provider,
      model,
      tokensUsed: mostRestrictive.usage,
      timeWindow: mostRestrictive.window,
      limit: mostRestrictive.limit,
      remaining: mostRestrictive.limit - mostRestrictive.usage,
      resetTime: new Date(Date.now() + (mostRestrictive.window * 60 * 1000))
    };
  }

  private calculateWarningDelay(utilizationRate: number): number {
    const overload = utilizationRate - this.config.overloadThresholds.warning;
    return Math.floor(this.baseDelayMs * this.config.backpressureMultipliers.warning * (1 + overload));
  }

  private calculateCriticalDelay(utilizationRate: number): number {
    const overload = utilizationRate - this.config.overloadThresholds.critical;
    return Math.floor(this.baseDelayMs * this.config.backpressureMultipliers.critical * (1 + overload * 2));
  }

  private calculateEmergencyDelay(utilizationRate: number): number {
    const overload = utilizationRate - 1.0; // Over 100%
    return Math.floor(this.baseDelayMs * this.config.backpressureMultipliers.emergency * (1 + overload * 5));
  }

  private calculateCost(provider: string, model: string, tokens: number): number {
    const providerConfig = this.config.providers[provider]?.models[model];
    if (!providerConfig) return 0;
    
    return tokens * providerConfig.costPerToken;
  }

  private async publishOverloadEvent(
    provider: string,
    model: string,
    severity: 'warning' | 'critical' | 'emergency',
    metadata: any
  ): Promise<void> {
    const event: SystemEvent = {
      type: severity === 'emergency' ? 'tokens.limit' : 'system.overload',
      severity: severity === 'warning' ? 'warning' : 'error',
      timestamp: new Date(),
      metadata: {
        provider,
        model,
        ...metadata
      }
    };

    await eventBus.publish(event);
  }

  // Cleanup old entries
  async cleanup(): Promise<void> {
    try {
      const pattern = 'tokens:*';
      const keys = await this.redis.keys(pattern);
      const now = Date.now();
      const cutoff = now - (7 * 24 * 60 * 60 * 1000); // 7 days ago

      for (const key of keys) {
        await this.redis.zremrangebyscore(key, 0, cutoff);
      }

      logger.info('Token usage cleanup completed', { keysProcessed: keys.length });
    } catch (error) {
      logger.error('Error during token usage cleanup', { error: error.message });
    }
  }

  // Get analytics
  async getUsageAnalytics(
    provider?: string,
    model?: string,
    hours: number = 24
  ): Promise<any> {
    try {
      const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      const whereClause: any = {
        timestamp: { gte: since }
      };
      
      if (provider) whereClause.provider = provider;
      if (model) whereClause.model = model;

      const usage = await this.prisma.tokenUsage.groupBy({
        by: ['provider', 'model'],
        where: whereClause,
        _sum: {
          tokens: true,
          cost: true
        },
        _count: {
          id: true
        }
      });

      return usage.map(item => ({
        provider: item.provider,
        model: item.model,
        totalTokens: item._sum.tokens || 0,
        totalCost: item._sum.cost || 0,
        requestCount: item._count.id,
        averageTokensPerRequest: item._sum.tokens ? Math.round(item._sum.tokens / item._count.id) : 0
      }));
    } catch (error) {
      logger.error('Error getting usage analytics', { error: error.message });
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('TokenGuardian health check failed', { error: error.message });
      return false;
    }
  }
}

// Default configuration
export const defaultTokenConfig: BackpressureConfig = {
  providers: {
    openai: {
      models: {
        'gpt-4': {
          tokensPerMinute: 10000,
          tokensPerHour: 300000,
          tokensPerDay: 5000000,
          costPerToken: 0.00003
        },
        'gpt-3.5-turbo': {
          tokensPerMinute: 40000,
          tokensPerHour: 1000000,
          tokensPerDay: 10000000,
          costPerToken: 0.000002
        }
      }
    },
    anthropic: {
      models: {
        'claude-3-sonnet': {
          tokensPerMinute: 20000,
          tokensPerHour: 500000,
          tokensPerDay: 8000000,
          costPerToken: 0.000015
        }
      }
    }
  },
  overloadThresholds: {
    warning: 0.8,
    critical: 0.95
  },
  backpressureMultipliers: {
    warning: 1.5,
    critical: 3.0,
    emergency: 10.0
  }
};

export { TokenGuardian };