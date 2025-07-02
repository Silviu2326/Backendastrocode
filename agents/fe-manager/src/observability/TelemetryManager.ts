import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics, trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { logger } from '../../../../shared/utils/logger';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  jaeger: {
    enabled: boolean;
    endpoint: string;
  };
  prometheus: {
    enabled: boolean;
    port: number;
    endpoint: string;
  };
  sampling: {
    ratio: number;
  };
  customMetrics: {
    enabled: boolean;
    collectInterval: number;
  };
}

export interface StoryTrace {
  storyId: string;
  traceId: string;
  parentSpanId?: string;
  spans: {
    [spanName: string]: {
      spanId: string;
      startTime: Date;
      endTime?: Date;
      status: 'running' | 'completed' | 'failed';
      attributes: Record<string, any>;
      events: Array<{
        name: string;
        timestamp: Date;
        attributes?: Record<string, any>;
      }>;
    };
  };
  metadata: {
    userId?: string;
    projectId?: string;
    complexity?: number;
    priority?: number;
  };
}

class TelemetryManager {
  private sdk: NodeSDK;
  private config: TelemetryConfig;
  private prisma: PrismaClient;
  private meter: any;
  private tracer: any;
  private storyTraces = new Map<string, StoryTrace>();
  
  // Metrics
  private jobCounter: any;
  private jobDurationHistogram: any;
  private queueSizeGauge: any;
  private errorCounter: any;
  private tokenUsageCounter: any;
  private retryCounter: any;

  constructor(config: TelemetryConfig) {
    this.config = config;
    this.prisma = new PrismaClient();
    this.initializeSDK();
    this.initializeMetrics();
    this.initializeTracer();
  }

  private initializeSDK(): void {
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
    });

    const exporters = [];

    // Jaeger exporter for traces
    if (this.config.jaeger.enabled) {
      exporters.push(
        new JaegerExporter({
          endpoint: this.config.jaeger.endpoint,
        })
      );
    }

    // Prometheus exporter for metrics
    const metricReaders = [];
    if (this.config.prometheus.enabled) {
      metricReaders.push(
        new PrometheusExporter({
          port: this.config.prometheus.port,
          endpoint: this.config.prometheus.endpoint,
        })
      );
    }

    this.sdk = new NodeSDK({
      resource,
      traceExporter: exporters.length > 0 ? exporters[0] : undefined,
      metricReader: metricReaders.length > 0 ? metricReaders[0] : undefined,
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-redis': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
      })],
    });

    this.sdk.start();
    logger.info('OpenTelemetry SDK initialized', { 
      serviceName: this.config.serviceName,
      jaegerEnabled: this.config.jaeger.enabled,
      prometheusEnabled: this.config.prometheus.enabled
    });
  }

  private initializeMetrics(): void {
    this.meter = metrics.getMeter(this.config.serviceName, this.config.serviceVersion);

    // Job processing metrics
    this.jobCounter = this.meter.createCounter('fe_manager_jobs_total', {
      description: 'Total number of jobs processed',
    });

    this.jobDurationHistogram = this.meter.createHistogram('fe_manager_job_duration_seconds', {
      description: 'Job processing duration in seconds',
      boundaries: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    });

    this.queueSizeGauge = this.meter.createObservableGauge('fe_manager_queue_size', {
      description: 'Current queue size',
    });

    this.errorCounter = this.meter.createCounter('fe_manager_errors_total', {
      description: 'Total number of errors',
    });

    this.tokenUsageCounter = this.meter.createCounter('fe_manager_tokens_total', {
      description: 'Total tokens consumed',
    });

    this.retryCounter = this.meter.createCounter('fe_manager_retries_total', {
      description: 'Total number of retries',
    });
  }

  private initializeTracer(): void {
    this.tracer = trace.getTracer(this.config.serviceName, this.config.serviceVersion);
  }

  // Start a new story trace
  startStoryTrace(
    storyId: string,
    metadata: {
      userId?: string;
      projectId?: string;
      complexity?: number;
      priority?: number;
    } = {}
  ): string {
    const traceId = this.generateTraceId();
    
    const storyTrace: StoryTrace = {
      storyId,
      traceId,
      spans: {},
      metadata
    };

    this.storyTraces.set(storyId, storyTrace);

    // Start root span for the story
    const span = this.tracer.startSpan(`story.process`, {
      kind: SpanKind.SERVER,
      attributes: {
        'story.id': storyId,
        'story.complexity': metadata.complexity || 0,
        'story.priority': metadata.priority || 0,
        'user.id': metadata.userId || 'unknown',
        'project.id': metadata.projectId || 'unknown',
      },
    });

    // Set trace context
    context.with(trace.setSpan(context.active(), span), () => {
      span.addEvent('story.received', {
        'story.id': storyId,
        'timestamp': new Date().toISOString(),
      });
    });

    storyTrace.spans['story.process'] = {
      spanId: this.getSpanId(span),
      startTime: new Date(),
      status: 'running',
      attributes: {
        'story.id': storyId,
        'story.complexity': metadata.complexity || 0,
        'story.priority': metadata.priority || 0,
      },
      events: [{
        name: 'story.received',
        timestamp: new Date(),
        attributes: { 'story.id': storyId }
      }]
    };

    logger.info('Started story trace', { storyId, traceId });
    return traceId;
  }

  // Start a job span within a story trace
  startJobSpan(
    storyId: string,
    jobName: string,
    job: Job,
    agentType: string
  ): any {
    const storyTrace = this.storyTraces.get(storyId);
    if (!storyTrace) {
      logger.warn('Story trace not found for job span', { storyId, jobName });
      return this.tracer.startSpan(jobName);
    }

    const span = this.tracer.startSpan(`${agentType}.${jobName}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'job.id': job.id?.toString() || 'unknown',
        'job.name': jobName,
        'job.queue': job.queueName,
        'job.attempts': job.attemptsMade || 0,
        'agent.type': agentType,
        'story.id': storyId,
        'story.trace_id': storyTrace.traceId,
      },
    });

    const spanId = this.getSpanId(span);
    storyTrace.spans[`${agentType}.${jobName}`] = {
      spanId,
      startTime: new Date(),
      status: 'running',
      attributes: {
        'job.id': job.id?.toString() || 'unknown',
        'job.name': jobName,
        'agent.type': agentType,
      },
      events: []
    };

    // Record job start metric
    this.jobCounter.add(1, {
      'job.name': jobName,
      'agent.type': agentType,
      'status': 'started'
    });

    return span;
  }

  // Complete a job span
  completeJobSpan(
    storyId: string,
    jobName: string,
    agentType: string,
    span: any,
    success: boolean,
    result?: any,
    error?: Error
  ): void {
    const storyTrace = this.storyTraces.get(storyId);
    const spanKey = `${agentType}.${jobName}`;
    
    if (storyTrace && storyTrace.spans[spanKey]) {
      const spanData = storyTrace.spans[spanKey];
      spanData.endTime = new Date();
      spanData.status = success ? 'completed' : 'failed';
      
      const duration = spanData.endTime.getTime() - spanData.startTime.getTime();
      
      if (success) {
        span.setStatus({ code: SpanStatusCode.OK });
        span.addEvent('job.completed', {
          'duration_ms': duration,
          'result.size': result ? JSON.stringify(result).length : 0,
        });
        
        spanData.events.push({
          name: 'job.completed',
          timestamp: new Date(),
          attributes: { 'duration_ms': duration }
        });
      } else {
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error?.message || 'Job failed' 
        });
        span.addEvent('job.failed', {
          'error.message': error?.message || 'Unknown error',
          'error.type': error?.constructor.name || 'Error',
          'duration_ms': duration,
        });
        
        spanData.events.push({
          name: 'job.failed',
          timestamp: new Date(),
          attributes: { 
            'error.message': error?.message || 'Unknown error',
            'duration_ms': duration
          }
        });

        // Record error metric
        this.errorCounter.add(1, {
          'job.name': jobName,
          'agent.type': agentType,
          'error.type': error?.constructor.name || 'Error'
        });
      }
      
      // Record duration metric
      this.jobDurationHistogram.record(duration / 1000, {
        'job.name': jobName,
        'agent.type': agentType,
        'status': success ? 'success' : 'failure'
      });
      
      // Record completion metric
      this.jobCounter.add(1, {
        'job.name': jobName,
        'agent.type': agentType,
        'status': success ? 'completed' : 'failed'
      });
    }
    
    span.end();
  }

  // Complete a story trace
  completeStoryTrace(
    storyId: string,
    success: boolean,
    finalResult?: any,
    error?: Error
  ): void {
    const storyTrace = this.storyTraces.get(storyId);
    if (!storyTrace) {
      logger.warn('Story trace not found for completion', { storyId });
      return;
    }

    const rootSpan = storyTrace.spans['story.process'];
    if (rootSpan) {
      rootSpan.endTime = new Date();
      rootSpan.status = success ? 'completed' : 'failed';
      
      const totalDuration = rootSpan.endTime.getTime() - rootSpan.startTime.getTime();
      
      if (success) {
        rootSpan.events.push({
          name: 'story.completed',
          timestamp: new Date(),
          attributes: { 
            'total_duration_ms': totalDuration,
            'spans_count': Object.keys(storyTrace.spans).length
          }
        });
      } else {
        rootSpan.events.push({
          name: 'story.failed',
          timestamp: new Date(),
          attributes: { 
            'error.message': error?.message || 'Unknown error',
            'total_duration_ms': totalDuration,
            'spans_count': Object.keys(storyTrace.spans).length
          }
        });
      }
    }

    // Store trace in database for analytics
    this.persistStoryTrace(storyTrace, success, finalResult, error)
      .catch(err => logger.error('Error persisting story trace', { error: err.message }));

    // Clean up from memory
    this.storyTraces.delete(storyId);
    
    logger.info('Completed story trace', { 
      storyId, 
      traceId: storyTrace.traceId, 
      success,
      spansCount: Object.keys(storyTrace.spans).length
    });
  }

  // Record token usage
  recordTokenUsage(
    provider: string,
    model: string,
    tokens: number,
    cost: number,
    storyId?: string
  ): void {
    this.tokenUsageCounter.add(tokens, {
      'provider': provider,
      'model': model,
      'story.id': storyId || 'unknown'
    });

    if (storyId) {
      const storyTrace = this.storyTraces.get(storyId);
      if (storyTrace) {
        // Add token usage event to current span
        const activeSpanKey = Object.keys(storyTrace.spans)
          .find(key => storyTrace.spans[key].status === 'running');
        
        if (activeSpanKey) {
          storyTrace.spans[activeSpanKey].events.push({
            name: 'tokens.consumed',
            timestamp: new Date(),
            attributes: {
              'provider': provider,
              'model': model,
              'tokens': tokens,
              'cost': cost
            }
          });
        }
      }
    }
  }

  // Record retry attempt
  recordRetry(
    storyId: string,
    jobName: string,
    agentType: string,
    attempt: number,
    reason: string
  ): void {
    this.retryCounter.add(1, {
      'job.name': jobName,
      'agent.type': agentType,
      'retry.reason': reason
    });

    const storyTrace = this.storyTraces.get(storyId);
    if (storyTrace) {
      const spanKey = `${agentType}.${jobName}`;
      if (storyTrace.spans[spanKey]) {
        storyTrace.spans[spanKey].events.push({
          name: 'job.retry',
          timestamp: new Date(),
          attributes: {
            'retry.attempt': attempt,
            'retry.reason': reason
          }
        });
      }
    }
  }

  // Update queue size metrics
  updateQueueMetrics(queueSizes: Record<string, number>): void {
    for (const [queueName, size] of Object.entries(queueSizes)) {
      this.queueSizeGauge.addCallback((result) => {
        result.observe(size, { 'queue.name': queueName });
      });
    }
  }

  private async persistStoryTrace(
    storyTrace: StoryTrace,
    success: boolean,
    finalResult?: any,
    error?: Error
  ): Promise<void> {
    try {
      const rootSpan = storyTrace.spans['story.process'];
      const totalDuration = rootSpan?.endTime && rootSpan?.startTime 
        ? rootSpan.endTime.getTime() - rootSpan.startTime.getTime()
        : 0;

      await this.prisma.storyTrace.create({
        data: {
          storyId: storyTrace.storyId,
          traceId: storyTrace.traceId,
          success,
          totalDurationMs: totalDuration,
          spansCount: Object.keys(storyTrace.spans).length,
          metadata: storyTrace.metadata,
          spans: storyTrace.spans,
          finalResult: finalResult ? JSON.stringify(finalResult) : null,
          error: error?.message || null,
          createdAt: rootSpan?.startTime || new Date(),
          completedAt: rootSpan?.endTime || new Date()
        }
      });
    } catch (dbError) {
      logger.error('Error persisting story trace to database', {
        storyId: storyTrace.storyId,
        traceId: storyTrace.traceId,
        error: dbError.message
      });
    }
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private getSpanId(span: any): string {
    // Extract span ID from OpenTelemetry span
    return span.spanContext?.()?.spanId || 'unknown';
  }

  // Get telemetry analytics
  async getTelemetryAnalytics(hours: number = 24): Promise<any> {
    try {
      const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      const traces = await this.prisma.storyTrace.findMany({
        where: {
          createdAt: { gte: since }
        },
        select: {
          storyId: true,
          success: true,
          totalDurationMs: true,
          spansCount: true,
          metadata: true,
          createdAt: true,
          completedAt: true
        }
      });

      const analytics = {
        totalTraces: traces.length,
        successfulTraces: traces.filter(t => t.success).length,
        failedTraces: traces.filter(t => !t.success).length,
        averageDuration: traces.length > 0 
          ? traces.reduce((sum, t) => sum + t.totalDurationMs, 0) / traces.length
          : 0,
        averageSpansPerTrace: traces.length > 0
          ? traces.reduce((sum, t) => sum + t.spansCount, 0) / traces.length
          : 0,
        successRate: traces.length > 0
          ? (traces.filter(t => t.success).length / traces.length) * 100
          : 0,
        complexityDistribution: this.getComplexityDistribution(traces),
        durationPercentiles: this.getDurationPercentiles(traces)
      };

      return analytics;
    } catch (error) {
      logger.error('Error getting telemetry analytics', { error: error.message });
      return {
        totalTraces: 0,
        successfulTraces: 0,
        failedTraces: 0,
        averageDuration: 0,
        averageSpansPerTrace: 0,
        successRate: 0,
        complexityDistribution: {},
        durationPercentiles: {}
      };
    }
  }

  private getComplexityDistribution(traces: any[]): Record<string, number> {
    const distribution = { low: 0, medium: 0, high: 0, unknown: 0 };
    
    traces.forEach(trace => {
      const complexity = trace.metadata?.complexity || 0;
      if (complexity <= 3) distribution.low++;
      else if (complexity <= 7) distribution.medium++;
      else if (complexity <= 10) distribution.high++;
      else distribution.unknown++;
    });
    
    return distribution;
  }

  private getDurationPercentiles(traces: any[]): Record<string, number> {
    if (traces.length === 0) return {};
    
    const durations = traces.map(t => t.totalDurationMs).sort((a, b) => a - b);
    
    return {
      p50: durations[Math.floor(durations.length * 0.5)],
      p90: durations[Math.floor(durations.length * 0.9)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)]
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if SDK is running
      const isSDKRunning = this.sdk !== undefined;
      
      // Check if metrics are working
      const metricsWorking = this.meter !== undefined;
      
      // Check if tracer is working
      const tracerWorking = this.tracer !== undefined;
      
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      return isSDKRunning && metricsWorking && tracerWorking;
    } catch (error) {
      logger.error('TelemetryManager health check failed', { error: error.message });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.sdk.shutdown();
      await this.prisma.$disconnect();
      logger.info('TelemetryManager shutdown completed');
    } catch (error) {
      logger.error('Error during TelemetryManager shutdown', { error: error.message });
    }
  }
}

// Default telemetry configuration
export const defaultTelemetryConfig: TelemetryConfig = {
  serviceName: 'fe-manager',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  jaeger: {
    enabled: process.env.JAEGER_ENABLED === 'true',
    endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
  },
  prometheus: {
    enabled: process.env.PROMETHEUS_ENABLED === 'true',
    port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
    endpoint: '/metrics'
  },
  sampling: {
    ratio: parseFloat(process.env.TRACE_SAMPLING_RATIO || '0.1')
  },
  customMetrics: {
    enabled: true,
    collectInterval: 30000 // 30 seconds
  }
};

export { TelemetryManager };