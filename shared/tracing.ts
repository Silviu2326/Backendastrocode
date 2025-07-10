import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { logger } from './utils/logger';

// Configuration for OpenTelemetry
const JAEGER_ENDPOINT = process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces';
const SERVICE_NAME = process.env.SERVICE_NAME || 'fe-agents-backend';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// Jaeger exporter configuration
const jaegerExporter = new JaegerExporter({
  endpoint: JAEGER_ENDPOINT,
});

// Create and configure the SDK
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
  }),
  traceExporter: jaegerExporter,
  instrumentations: [
    new HttpInstrumentation({
      // Ignore health check endpoints
      ignoreIncomingRequestHook: (req) => {
        return req.url?.includes('/health') || req.url?.includes('/metrics');
      },
    }),
    new ExpressInstrumentation(),
    new RedisInstrumentation({
      // Add custom attributes for Redis operations
      dbStatementSerializer: (cmdName, cmdArgs) => {
        return `${cmdName} ${cmdArgs.slice(0, 2).join(' ')}`;
      },
    }),
  ],
});

// Initialize tracing
export function initializeTracing(): void {
  try {
    sdk.start();
    logger.info('OpenTelemetry tracing initialized successfully', {
      serviceName: SERVICE_NAME,
      jaegerEndpoint: JAEGER_ENDPOINT,
      environment: ENVIRONMENT,
    });
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', { error: error.message });
  }
}

// Graceful shutdown
export async function shutdownTracing(): Promise<void> {
  try {
    await sdk.shutdown();
    logger.info('OpenTelemetry tracing shut down successfully');
  } catch (error) {
    logger.error('Error during OpenTelemetry shutdown', { error: error.message });
  }
}

// Utility functions for manual tracing
export class TracingUtils {
  private static tracer = trace.getTracer('fe-agents', '1.0.0');

  /**
   * Create a new span for job processing
   */
  static createJobSpan(jobId: string, queueName: string, operation: string) {
    return this.tracer.startSpan(`${queueName}.${operation}`, {
      kind: SpanKind.CONSUMER,
      attributes: {
        'job.id': jobId,
        'job.queue': queueName,
        'job.operation': operation,
      },
    });
  }

  /**
   * Create a span for LLM operations
   */
  static createLLMSpan(provider: string, model: string, operation: string) {
    return this.tracer.startSpan(`llm.${provider}.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'llm.provider': provider,
        'llm.model': model,
        'llm.operation': operation,
      },
    });
  }

  /**
   * Create a span for Redis operations
   */
  static createRedisSpan(operation: string, key?: string) {
    return this.tracer.startSpan(`redis.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'redis',
        'db.operation': operation,
        ...(key && { 'db.redis.key': key }),
      },
    });
  }

  /**
   * Create a span for file operations
   */
  static createFileSpan(operation: string, filePath: string) {
    return this.tracer.startSpan(`file.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'file.operation': operation,
        'file.path': filePath,
      },
    });
  }

  /**
   * Add attributes to the current span
   */
  static addSpanAttributes(attributes: Record<string, string | number | boolean>) {
    const span = trace.getActiveSpan();
    if (span) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttributes({ [key]: value });
      });
    }
  }

  /**
   * Set span status
   */
  static setSpanStatus(code: SpanStatusCode, message?: string) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setStatus({ code, message });
    }
  }

  /**
   * Record an exception in the current span
   */
  static recordException(error: Error) {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
  }

  /**
   * Execute a function within a span context
   */
  static async withSpan<T>(
    spanName: string,
    fn: () => Promise<T>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    const span = this.tracer.startSpan(spanName, {
      attributes,
    });

    try {
      return await context.with(trace.setSpan(context.active(), span), fn);
    } catch (error) {
      this.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get the current trace ID for correlation
   */
  static getCurrentTraceId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().traceId;
  }

  /**
   * Get the current span ID
   */
  static getCurrentSpanId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().spanId;
  }
}

// Export the tracer for direct use if needed
export const tracer = trace.getTracer('fe-agents', '1.0.0');

// Process cleanup
process.on('SIGTERM', async () => {
  await shutdownTracing();
});

process.on('SIGINT', async () => {
  await shutdownTracing();
});