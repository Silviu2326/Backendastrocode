import express from 'express';
import { Worker } from 'bullmq';
import { logger } from '../../shared/utils/logger';
import { redis } from '../../shared/utils/redis';
import { validateJobData } from '../../shared/utils/validation';
import { tracer } from '../../shared/utils/tracing';
import { BeLogicJobData } from '../types/queues';
import { beLogicGenerator } from './generator';

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'be-logic',
    timestamp: new Date().toISOString(),
    processed: beLogicGenerator.getProcessedCount(),
    errors: beLogicGenerator.getErrorCount()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    processed_jobs: beLogicGenerator.getProcessedCount(),
    error_count: beLogicGenerator.getErrorCount(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Worker for processing backend logic jobs
const worker = new Worker('be-logic', async (job) => {
  const span = tracer.startSpan('be-logic-job', {
    attributes: {
      'job.id': job.id,
      'job.name': job.name,
      'api.name': job.data.api?.name,
      'business_rules_count': job.data.businessRules?.length || 0,
      'validation_rules_count': job.data.validationRules?.length || 0,
      'integrations_count': job.data.integrations?.length || 0
    }
  });

  try {
    logger.info('Processing backend logic job', {
      jobId: job.id,
      apiName: job.data.api?.name,
      businessRules: job.data.businessRules?.length || 0,
      validationRules: job.data.validationRules?.length || 0,
      integrations: job.data.integrations?.length || 0
    });

    // Validate job data
    const validationResult = validateJobData(job.data, 'be-logic');
    if (!validationResult.success) {
      throw new Error(`Invalid job data: ${validationResult.error}`);
    }

    const jobData = job.data as BeLogicJobData;

    // Generate backend business logic
    const result = await beLogicGenerator.generateBusinessLogic(jobData);

    if (!result.success) {
      throw new Error('Failed to generate backend logic');
    }

    logger.info('Backend logic generated successfully', {
      jobId: job.id,
      apiName: jobData.api.name,
      filesGenerated: result.metadata.generatedFiles.length,
      complexity: result.metadata.complexity,
      estimatedLines: result.metadata.estimatedLines,
      businessRules: result.metadata.businessRules.length,
      validationRules: result.metadata.validationRules.length,
      integrations: result.metadata.integrations.length
    });

    span.setAttributes({
      'result.success': true,
      'result.files_count': result.metadata.generatedFiles.length,
      'result.complexity': result.metadata.complexity,
      'result.estimated_lines': result.metadata.estimatedLines,
      'result.business_rules_count': result.metadata.businessRules.length,
      'result.validation_rules_count': result.metadata.validationRules.length,
      'result.integrations_count': result.metadata.integrations.length
    });

    return {
      success: true,
      data: result,
      metadata: {
        jobId: job.id,
        processedAt: new Date().toISOString(),
        processingTime: Date.now() - job.processedOn!,
        agent: 'be-logic'
      }
    };
  } catch (error) {
    logger.error('Error processing backend logic job', {
      jobId: job.id,
      error: error.message,
      stack: error.stack
    });

    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });

    throw error;
  } finally {
    span.end();
  }
}, {
  connection: redis,
  concurrency: 2,
  removeOnComplete: 10,
  removeOnFail: 5
});

// Worker event handlers
worker.on('completed', (job, result) => {
  logger.info('Backend logic job completed', {
    jobId: job.id,
    duration: Date.now() - job.processedOn!,
    filesGenerated: result.data?.metadata?.generatedFiles?.length || 0,
    complexity: result.data?.metadata?.complexity
  });
});

worker.on('failed', (job, err) => {
  logger.error('Backend logic job failed', {
    jobId: job?.id,
    error: err.message,
    attempts: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts
  });
});

worker.on('error', (err) => {
  logger.error('Backend logic worker error', {
    error: err.message,
    stack: err.stack
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Backend logic agent started on port ${PORT}`);
});

export { app, worker };