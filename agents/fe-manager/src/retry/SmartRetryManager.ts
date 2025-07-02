import { Job } from 'bullmq';
import { logger } from '../../../../shared/utils/logger';
import { eventBus, JobEvent } from '../events/EventBus';
import { PrismaClient } from '@prisma/client';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface ErrorCategory {
  name: string;
  patterns: RegExp[];
  retryable: boolean;
  config?: Partial<RetryConfig>;
  deadLetterAfter?: number;
  customHandler?: (error: Error, job: Job) => Promise<boolean>;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  reason: string;
  category: string;
  moveToDeadLetter?: boolean;
  customAction?: string;
}

class SmartRetryManager {
  private prisma: PrismaClient;
  private defaultConfig: RetryConfig;
  private errorCategories: ErrorCategory[];

  constructor(config?: Partial<RetryConfig>) {
    this.prisma = new PrismaClient();
    this.defaultConfig = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      ...config
    };
    
    this.initializeErrorCategories();
  }

  private initializeErrorCategories(): void {
    this.errorCategories = [
      {
        name: 'network_timeout',
        patterns: [
          /timeout/i,
          /ECONNRESET/i,
          /ENOTFOUND/i,
          /ECONNREFUSED/i,
          /socket hang up/i
        ],
        retryable: true,
        config: {
          maxAttempts: 5,
          baseDelayMs: 2000,
          backoffMultiplier: 1.5
        }
      },
      {
        name: 'rate_limit',
        patterns: [
          /rate limit/i,
          /too many requests/i,
          /429/,
          /quota exceeded/i
        ],
        retryable: true,
        config: {
          maxAttempts: 10,
          baseDelayMs: 5000,
          backoffMultiplier: 2,
          maxDelayMs: 300000 // 5 minutes
        }
      },
      {
        name: 'json_parse_error',
        patterns: [
          /unexpected token/i,
          /invalid json/i,
          /json parse error/i,
          /malformed json/i,
          /unexpected end of json/i
        ],
        retryable: true,
        config: {
          maxAttempts: 2,
          baseDelayMs: 500
        }
      },
      {
        name: 'llm_content_filter',
        patterns: [
          /content filter/i,
          /safety filter/i,
          /inappropriate content/i,
          /content policy/i
        ],
        retryable: false,
        deadLetterAfter: 1
      },
      {
        name: 'ast_validation_error',
        patterns: [
          /missing required field/i,
          /invalid component structure/i,
          /ast validation failed/i,
          /syntax error in generated code/i
        ],
        retryable: false,
        deadLetterAfter: 1,
        customHandler: this.handleASTValidationError.bind(this)
      },
      {
        name: 'authentication_error',
        patterns: [
          /unauthorized/i,
          /invalid api key/i,
          /authentication failed/i,
          /401/,
          /403/
        ],
        retryable: false,
        deadLetterAfter: 1
      },
      {
        name: 'server_error',
        patterns: [
          /internal server error/i,
          /500/,
          /502/,
          /503/,
          /504/
        ],
        retryable: true,
        config: {
          maxAttempts: 3,
          baseDelayMs: 3000,
          backoffMultiplier: 2
        }
      },
      {
        name: 'validation_error',
        patterns: [
          /validation error/i,
          /invalid input/i,
          /bad request/i,
          /400/
        ],
        retryable: false,
        deadLetterAfter: 1
      },
      {
        name: 'resource_exhausted',
        patterns: [
          /out of memory/i,
          /resource exhausted/i,
          /disk full/i,
          /no space left/i
        ],
        retryable: true,
        config: {
          maxAttempts: 2,
          baseDelayMs: 10000,
          maxDelayMs: 60000
        }
      }
    ];
  }

  async shouldRetry(error: Error, job: Job): Promise<RetryDecision> {
    try {
      const attemptsMade = job.attemptsMade || 0;
      const errorMessage = error.message || error.toString();
      const category = this.categorizeError(errorMessage);
      
      logger.info('Analyzing retry decision', {
        jobId: job.id,
        jobName: job.name,
        attemptsMade,
        errorMessage: errorMessage.substring(0, 200),
        category: category.name
      });

      // Record the error for analytics
      await this.recordRetryAttempt(job, error, category.name);

      // Check if error is retryable
      if (!category.retryable) {
        await this.publishRetryEvent(job, 'retry.abandoned', {
          reason: `Error category '${category.name}' is not retryable`,
          category: category.name,
          attemptsMade
        });

        return {
          shouldRetry: false,
          delayMs: 0,
          reason: `Error category '${category.name}' is not retryable`,
          category: category.name,
          moveToDeadLetter: category.deadLetterAfter ? attemptsMade >= category.deadLetterAfter : true
        };
      }

      // Get retry configuration for this category
      const config = { ...this.defaultConfig, ...category.config };
      
      // Check if we've exceeded max attempts
      if (attemptsMade >= config.maxAttempts) {
        await this.publishRetryEvent(job, 'retry.exhausted', {
          reason: `Max attempts (${config.maxAttempts}) exceeded`,
          category: category.name,
          attemptsMade
        });

        return {
          shouldRetry: false,
          delayMs: 0,
          reason: `Max attempts (${config.maxAttempts}) exceeded`,
          category: category.name,
          moveToDeadLetter: true
        };
      }

      // Custom handler for specific error types
      if (category.customHandler) {
        const customResult = await category.customHandler(error, job);
        if (!customResult) {
          return {
            shouldRetry: false,
            delayMs: 0,
            reason: 'Custom handler rejected retry',
            category: category.name,
            moveToDeadLetter: true,
            customAction: 'custom_handler_rejection'
          };
        }
      }

      // Calculate delay with exponential backoff and jitter
      const delayMs = this.calculateDelay(attemptsMade, config);

      await this.publishRetryEvent(job, 'retry.scheduled', {
        reason: `Retrying after ${category.name} error`,
        category: category.name,
        attemptsMade,
        delayMs
      });

      return {
        shouldRetry: true,
        delayMs,
        reason: `Retrying after ${category.name} error (attempt ${attemptsMade + 1}/${config.maxAttempts})`,
        category: category.name
      };
    } catch (analysisError) {
      logger.error('Error analyzing retry decision', {
        jobId: job.id,
        originalError: error.message,
        analysisError: analysisError.message
      });

      // Fallback to simple retry logic
      const attemptsMade = job.attemptsMade || 0;
      if (attemptsMade < this.defaultConfig.maxAttempts) {
        return {
          shouldRetry: true,
          delayMs: this.calculateDelay(attemptsMade, this.defaultConfig),
          reason: 'Fallback retry after analysis error',
          category: 'unknown'
        };
      }

      return {
        shouldRetry: false,
        delayMs: 0,
        reason: 'Analysis failed and max attempts reached',
        category: 'unknown',
        moveToDeadLetter: true
      };
    }
  }

  private categorizeError(errorMessage: string): ErrorCategory {
    for (const category of this.errorCategories) {
      for (const pattern of category.patterns) {
        if (pattern.test(errorMessage)) {
          return category;
        }
      }
    }

    // Default category for unknown errors
    return {
      name: 'unknown',
      patterns: [],
      retryable: true,
      config: this.defaultConfig
    };
  }

  private calculateDelay(attemptsMade: number, config: RetryConfig): number {
    // Exponential backoff: baseDelay * (multiplier ^ attempt)
    let delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attemptsMade);
    
    // Apply jitter to avoid thundering herd
    const jitter = delay * config.jitterFactor * (Math.random() - 0.5);
    delay += jitter;
    
    // Cap at maximum delay
    delay = Math.min(delay, config.maxDelayMs);
    
    return Math.floor(delay);
  }

  private async handleASTValidationError(error: Error, job: Job): Promise<boolean> {
    try {
      // Analyze the generated code to see if it's salvageable
      const jobData = job.data;
      const generatedCode = jobData.generatedCode || jobData.result?.code;
      
      if (!generatedCode) {
        logger.warn('No generated code found for AST validation error', { jobId: job.id });
        return false;
      }

      // Check for common fixable issues
      const fixablePatterns = [
        /missing import/i,
        /undefined variable/i,
        /missing prop/i,
        /invalid jsx/i
      ];

      const isFixable = fixablePatterns.some(pattern => pattern.test(error.message));
      
      if (isFixable) {
        logger.info('AST validation error appears fixable', {
          jobId: job.id,
          errorMessage: error.message.substring(0, 100)
        });
        
        // Add context for the retry
        job.data.retryContext = {
          astValidationError: error.message,
          previousCode: generatedCode,
          fixAttempt: true
        };
        
        return true;
      }

      logger.warn('AST validation error not fixable', {
        jobId: job.id,
        errorMessage: error.message.substring(0, 100)
      });
      
      return false;
    } catch (handlerError) {
      logger.error('Error in AST validation handler', {
        jobId: job.id,
        handlerError: handlerError.message
      });
      return false;
    }
  }

  private async recordRetryAttempt(
    job: Job,
    error: Error,
    category: string
  ): Promise<void> {
    try {
      await this.prisma.jobRun.updateMany({
        where: {
          jobId: job.id?.toString(),
          status: 'running'
        },
        data: {
          errorCategory: category,
          lastError: error.message.substring(0, 1000),
          retryCount: job.attemptsMade || 0
        }
      });
    } catch (dbError) {
      logger.error('Error recording retry attempt', {
        jobId: job.id,
        dbError: dbError.message
      });
    }
  }

  private async publishRetryEvent(
    job: Job,
    eventType: string,
    metadata: any
  ): Promise<void> {
    const event: JobEvent = {
      type: eventType as any,
      jobId: job.id?.toString() || 'unknown',
      queueName: job.queueName,
      timestamp: new Date(),
      metadata
    };

    await eventBus.publish(event);
  }

  // Get retry statistics
  async getRetryStats(hours: number = 24): Promise<any> {
    try {
      const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      const stats = await this.prisma.jobRun.groupBy({
        by: ['errorCategory'],
        where: {
          updatedAt: { gte: since },
          errorCategory: { not: null }
        },
        _count: {
          id: true
        },
        _avg: {
          retryCount: true
        }
      });

      const totalJobs = await this.prisma.jobRun.count({
        where: {
          updatedAt: { gte: since }
        }
      });

      const successfulJobs = await this.prisma.jobRun.count({
        where: {
          updatedAt: { gte: since },
          status: 'completed'
        }
      });

      return {
        totalJobs,
        successfulJobs,
        successRate: totalJobs > 0 ? (successfulJobs / totalJobs) * 100 : 0,
        errorCategories: stats.map(stat => ({
          category: stat.errorCategory,
          count: stat._count.id,
          averageRetries: stat._avg.retryCount || 0
        }))
      };
    } catch (error) {
      logger.error('Error getting retry stats', { error: error.message });
      return {
        totalJobs: 0,
        successfulJobs: 0,
        successRate: 0,
        errorCategories: []
      };
    }
  }

  // Add custom error category
  addErrorCategory(category: ErrorCategory): void {
    this.errorCategories.push(category);
    logger.info('Added custom error category', { categoryName: category.name });
  }

  // Update retry configuration
  updateConfig(config: Partial<RetryConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    logger.info('Updated retry configuration', { config });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('SmartRetryManager health check failed', { error: error.message });
      return false;
    }
  }
}

export { SmartRetryManager };