import { Redis } from 'ioredis';
import { logger } from './logger';
import { redisConnection } from '../config/redis';

/**
 * Token tracking and persistence system
 * Tracks token usage per story, project, and globally
 */
export class TokenTracker {
  private redis: Redis;
  private readonly KEYS = {
    TOTAL_TOKENS: 'tokens:total',
    STORY_TOKENS: 'tokens:story:',
    PROJECT_TOKENS: 'tokens:project:',
    DAILY_TOKENS: 'tokens:daily:',
    HOURLY_TOKENS: 'tokens:hourly:',
  };

  constructor(redis?: Redis) {
    this.redis = redis || redisConnection;
  }

  /**
   * Increment token usage for a specific story
   */
  async incrementStoryTokens(
    storyId: string,
    tokensUsed: number,
    metadata: {
      projectId: string;
      operation: string;
      model?: string;
      provider?: string;
      timestamp?: Date;
    }
  ): Promise<void> {
    const timestamp = metadata.timestamp || new Date();
    const dateKey = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const hourKey = timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Increment total tokens
      pipeline.incrby(this.KEYS.TOTAL_TOKENS, tokensUsed);

      // Increment story-specific tokens
      const storyKey = `${this.KEYS.STORY_TOKENS}${storyId}`;
      pipeline.incrby(storyKey, tokensUsed);
      pipeline.expire(storyKey, 30 * 24 * 60 * 60); // 30 days TTL

      // Increment project-specific tokens
      const projectKey = `${this.KEYS.PROJECT_TOKENS}${metadata.projectId}`;
      pipeline.incrby(projectKey, tokensUsed);
      pipeline.expire(projectKey, 90 * 24 * 60 * 60); // 90 days TTL

      // Daily aggregation
      const dailyKey = `${this.KEYS.DAILY_TOKENS}${dateKey}`;
      pipeline.incrby(dailyKey, tokensUsed);
      pipeline.expire(dailyKey, 365 * 24 * 60 * 60); // 1 year TTL

      // Hourly aggregation
      const hourlyKey = `${this.KEYS.HOURLY_TOKENS}${hourKey}`;
      pipeline.incrby(hourlyKey, tokensUsed);
      pipeline.expire(hourlyKey, 7 * 24 * 60 * 60); // 7 days TTL

      // Store detailed metadata
      const metadataKey = `${storyKey}:metadata`;
      pipeline.hset(metadataKey, {
        operation: metadata.operation,
        model: metadata.model || 'unknown',
        provider: metadata.provider || 'unknown',
        timestamp: timestamp.toISOString(),
        tokens: tokensUsed,
      });
      pipeline.expire(metadataKey, 30 * 24 * 60 * 60); // 30 days TTL

      await pipeline.exec();

      logger.info('Token usage tracked', {
        storyId,
        projectId: metadata.projectId,
        operation: metadata.operation,
        tokensUsed,
        timestamp: timestamp.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to track token usage', {
        storyId,
        tokensUsed,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get total tokens used
   */
  async getTotalTokens(): Promise<number> {
    try {
      const total = await this.redis.get(this.KEYS.TOTAL_TOKENS);
      return parseInt(total || '0', 10);
    } catch (error) {
      logger.error('Failed to get total tokens', { error: error.message });
      return 0;
    }
  }

  /**
   * Get tokens used for a specific story
   */
  async getStoryTokens(storyId: string): Promise<{
    total: number;
    metadata: Record<string, any>;
  }> {
    try {
      const storyKey = `${this.KEYS.STORY_TOKENS}${storyId}`;
      const metadataKey = `${storyKey}:metadata`;

      const [total, metadata] = await Promise.all([
        this.redis.get(storyKey),
        this.redis.hgetall(metadataKey),
      ]);

      return {
        total: parseInt(total || '0', 10),
        metadata: metadata || {},
      };
    } catch (error) {
      logger.error('Failed to get story tokens', {
        storyId,
        error: error.message,
      });
      return { total: 0, metadata: {} };
    }
  }

  /**
   * Get tokens used for a specific project
   */
  async getProjectTokens(projectId: string): Promise<number> {
    try {
      const projectKey = `${this.KEYS.PROJECT_TOKENS}${projectId}`;
      const total = await this.redis.get(projectKey);
      return parseInt(total || '0', 10);
    } catch (error) {
      logger.error('Failed to get project tokens', {
        projectId,
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Get daily token usage
   */
  async getDailyTokens(date?: Date): Promise<number> {
    try {
      const targetDate = date || new Date();
      const dateKey = targetDate.toISOString().split('T')[0];
      const dailyKey = `${this.KEYS.DAILY_TOKENS}${dateKey}`;
      const total = await this.redis.get(dailyKey);
      return parseInt(total || '0', 10);
    } catch (error) {
      logger.error('Failed to get daily tokens', {
        date: date?.toISOString(),
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Get hourly token usage for the last 24 hours
   */
  async getHourlyTokens(hours: number = 24): Promise<Array<{
    hour: string;
    tokens: number;
  }>> {
    try {
      const now = new Date();
      const results: Array<{ hour: string; tokens: number }> = [];

      for (let i = 0; i < hours; i++) {
        const targetHour = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hourKey = targetHour.toISOString().substring(0, 13);
        const redisKey = `${this.KEYS.HOURLY_TOKENS}${hourKey}`;
        
        const tokens = await this.redis.get(redisKey);
        results.push({
          hour: hourKey,
          tokens: parseInt(tokens || '0', 10),
        });
      }

      return results.reverse(); // Oldest first
    } catch (error) {
      logger.error('Failed to get hourly tokens', {
        hours,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get token usage statistics
   */
  async getTokenStats(): Promise<{
    total: number;
    today: number;
    thisHour: number;
    topProjects: Array<{ projectId: string; tokens: number }>;
  }> {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const thisHour = now.toISOString().substring(0, 13);

      const [total, todayTokens, hourTokens] = await Promise.all([
        this.getTotalTokens(),
        this.getDailyTokens(),
        this.redis.get(`${this.KEYS.HOURLY_TOKENS}${thisHour}`),
      ]);

      // Get top projects (this is a simplified version)
      // In a real implementation, you might want to use Redis sorted sets
      const topProjects: Array<{ projectId: string; tokens: number }> = [];

      return {
        total,
        today: todayTokens,
        thisHour: parseInt(hourTokens || '0', 10),
        topProjects,
      };
    } catch (error) {
      logger.error('Failed to get token stats', { error: error.message });
      return {
        total: 0,
        today: 0,
        thisHour: 0,
        topProjects: [],
      };
    }
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(
    tokens: number,
    model: string = 'gpt-4',
    provider: string = 'openai'
  ): number {
    // Cost per 1K tokens (in USD)
    const costMap: Record<string, Record<string, number>> = {
      openai: {
        'gpt-4': 0.03,
        'gpt-4-turbo': 0.01,
        'gpt-3.5-turbo': 0.002,
      },
      anthropic: {
        'claude-3-opus': 0.015,
        'claude-3-sonnet': 0.003,
        'claude-3-haiku': 0.00025,
      },
      google: {
        'gemini-pro': 0.0005,
        'gemini-pro-vision': 0.0025,
      },
    };

    const providerCosts = costMap[provider.toLowerCase()];
    if (!providerCosts) {
      logger.warn('Unknown provider for cost calculation', { provider });
      return 0;
    }

    const modelCost = providerCosts[model.toLowerCase()];
    if (!modelCost) {
      logger.warn('Unknown model for cost calculation', { model, provider });
      return 0;
    }

    return (tokens / 1000) * modelCost;
  }

  /**
   * Get cost analysis for a story
   */
  async getStoryCost(storyId: string): Promise<{
    tokens: number;
    estimatedCost: number;
    breakdown: Array<{
      operation: string;
      tokens: number;
      cost: number;
      model: string;
      provider: string;
    }>;
  }> {
    try {
      const { total, metadata } = await this.getStoryTokens(storyId);
      
      const estimatedCost = this.calculateCost(
        total,
        metadata.model,
        metadata.provider
      );

      // For detailed breakdown, you'd need to store individual operations
      // This is a simplified version
      const breakdown = [
        {
          operation: metadata.operation || 'unknown',
          tokens: total,
          cost: estimatedCost,
          model: metadata.model || 'unknown',
          provider: metadata.provider || 'unknown',
        },
      ];

      return {
        tokens: total,
        estimatedCost,
        breakdown,
      };
    } catch (error) {
      logger.error('Failed to get story cost', {
        storyId,
        error: error.message,
      });
      return {
        tokens: 0,
        estimatedCost: 0,
        breakdown: [],
      };
    }
  }
}

// Export singleton instance
export const tokenTracker = new TokenTracker();