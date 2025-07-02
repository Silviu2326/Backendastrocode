import express from 'express';
import { Worker } from 'bullmq';
import { logger } from '../../shared/utils/logger';
import { redis } from '../../shared/utils/redis';
import { validateJobData } from '../../shared/utils/validation';
import { tracer } from '../../shared/utils/tracing';
import { BeDraftJobData } from '../types/queues';
import { beDraftGenerator } from './generator';

const app = express();
const PORT = process.env.PORT || 3006;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'be-draft',
    timestamp: new Date().toISOString(),
    processed: beDraftGenerator.getProcessedCount(),
    errors: beDraftGenerator.getErrorCount()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    processed_jobs: beDraftGenerator.getProcessedCount(),
    error_count: beDraftGenerator.getErrorCount(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Worker for processing backend draft jobs
const worker = new Worker('be-draft', async (job) => {
  const span = tracer.startSpan('be-draft-job', {
    attributes: {
      'job.id': job.id,
      'job.name': job.name,
      'api.name': job.data.api?.name,
      'api.type': job.data.api?.type,
      'api.framework': job.data.api?.framework
    }
  });

  try {
    logger.info('Processing backend draft job', {
      jobId: job.id,
      apiName: job.data.api?.name,
      apiType: job.data.api?.type,
      framework: job.data.api?.framework,
      database: job.data.api?.database
    });

    // Validate job data
    const validationResult = validateJobData(job.data, 'be-draft');
    if (!validationResult.success) {
      throw new Error(`Invalid job data: ${validationResult.error}`);
    }

    const jobData = job.data as BeDraftJobData;

    // Generate backend API draft
    const result = await beDraftGenerator.generateApiDraft(jobData);

    if (!result.success) {
      throw new Error('Failed to generate backend draft');
    }

    logger.info('Backend draft generated successfully', {
      jobId: job.id,
      apiName: jobData.api.name,
      filesGenerated: result.metadata.generatedFiles.length,
      estimatedLines: result.metadata.estimatedLines,
      dependencies: result.dependencies.length,
      devDependencies: result.devDependencies.length
    });

    span.setAttributes({
      'result.success': true,
      'result.files_count': result.metadata.generatedFiles.length,
      'result.estimated_lines': result.metadata.estimatedLines,
      'result.dependencies_count': result.dependencies.length
    });

    return {
      success: true,
      data: result,
      metadata: {
        jobId: job.id,
        processedAt: new Date().toISOString(),
        processingTime: Date.now() - job.processedOn!,
        agent: 'be-draft'
      }
    };
  } catch (error) {
    logger.error('Error processing backend draft job', {
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
  concurrency: 3,
  removeOnComplete: 10,
  removeOnFail: 5
});

// Worker event handlers
worker.on('completed', (job, result) => {
  logger.info('Backend draft job completed', {
    jobId: job.id,
    duration: Date.now() - job.processedOn!,
    filesGenerated: result.data?.metadata?.generatedFiles?.length || 0
  });
});

worker.on('failed', (job, err) => {
  logger.error('Backend draft job failed', {
    jobId: job?.id,
    error: err.message,
    attempts: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts
  });
});

worker.on('error', (err) => {
  logger.error('Backend draft worker error', {
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
  logger.info(`Backend draft agent started on port ${PORT}`);
});

export { app, worker };