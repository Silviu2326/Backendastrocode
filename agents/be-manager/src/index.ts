import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { logger } from '@shared/utils/logger';
import { redis } from '@shared/utils/redis';
import { validateJobData } from '@shared/utils/validation';
import { tracer } from '@shared/utils/tracing';
import { metrics } from '@shared/utils/metrics';
import { beManagerOrchestrator } from './orchestrator';
import type { BeManagerJobData } from '@shared/types/queues';

const app = express();
const PORT = process.env.PORT || 3010;
const prisma = new PrismaClient();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    await redis.ping();
    
    res.json({ 
      status: 'ok', 
      service: 'be-manager', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: 'connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'be-manager', 
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const queueStats = await beManagerOrchestrator.getQueueStats();
    
    res.json({
      processed: beManagerOrchestrator.getProcessedCount(),
      errors: beManagerOrchestrator.getErrorCount(),
      uptime: process.uptime(),
      queues: queueStats,
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Queue status endpoint
app.get('/queues/status', async (req, res) => {
  try {
    const queueStats = await beManagerOrchestrator.getQueueStats();
    res.json(queueStats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get queue status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual orchestration endpoint (for testing)
app.post('/orchestrate', async (req, res) => {
  try {
    const jobData: BeManagerJobData = req.body;
    
    // Validate job data
    const validationResult = validateJobData('be-manager', jobData);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid job data',
        details: validationResult.error
      });
    }

    const result = await beManagerOrchestrator.orchestrate(jobData);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Manual orchestration failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Orchestration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create worker for be-manager queue
const worker = new Worker<BeManagerJobData>(
  'be-manager',
  async (job) => {
    const span = tracer.startSpan('be-manager-job', {
      attributes: {
        'job.id': job.id!,
        'job.name': job.name,
        'stories.count': job.data.stories.length
      }
    });

    try {
      logger.info('Processing be-manager job', {
        jobId: job.id,
        storiesCount: job.data.stories.length,
        projectId: job.data.project.id,
        apiImpact: job.data.apiImpact
      });

      // Validate job data
      const validationResult = validateJobData('be-manager', job.data);
      if (!validationResult.success) {
        throw new Error(`Invalid job data: ${validationResult.error}`);
      }

      // Update job progress
      await job.updateProgress(10);

      // Orchestrate backend generation
      const result = await beManagerOrchestrator.orchestrate(job.data);

      await job.updateProgress(90);

      logger.info('Successfully orchestrated backend generation', {
        jobId: job.id,
        projectId: job.data.project.id,
        success: result.success,
        processedStories: result.summary.processedStories,
        totalJobs: result.summary.totalJobs,
        errors: result.errors.length
      });

      // Record metrics
      metrics.increment('be_manager.jobs.completed');
      metrics.histogram('be_manager.orchestration.duration', Date.now() - job.timestamp);
      metrics.gauge('be_manager.stories.processed', result.summary.processedStories);
      metrics.gauge('be_manager.jobs.created', result.summary.totalJobs);

      await job.updateProgress(100);
      span.setStatus({ code: 1 }); // OK
      
      return result;
    } catch (error) {
      logger.error('Error processing be-manager job', {
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      metrics.increment('be_manager.jobs.failed');
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      
      throw error;
    } finally {
      span.end();
    }
  },
  {
    connection: redis,
    concurrency: parseInt(process.env.BE_MANAGER_CONCURRENCY || '1'),
    removeOnComplete: parseInt(process.env.REMOVE_ON_COMPLETE || '100'),
    removeOnFail: parseInt(process.env.REMOVE_ON_FAIL || '50')
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  logger.info('Be-manager job completed', {
    jobId: job.id,
    duration: Date.now() - job.timestamp
  });
});

worker.on('failed', (job, err) => {
  logger.error('Be-manager job failed', {
    jobId: job?.id,
    error: err.message,
    stack: err.stack
  });
});

worker.on('error', (err) => {
  logger.error('Be-manager worker error', {
    error: err.message,
    stack: err.stack
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

// Initialize database connection
prisma.$connect()
  .then(() => {
    logger.info('Connected to database');
  })
  .catch((error) => {
    logger.error('Failed to connect to database', {
      error: error.message
    });
    process.exit(1);
  });

// Start server
app.listen(PORT, () => {
  logger.info(`Be-manager agent listening on port ${PORT}`);
});

export { app, worker, prisma };