import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import winston from 'winston';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true
});

// Queue definitions
const queues = {
  'fe-draft': new Queue('fe-draft', { connection: redis }),
  'fe-logic': new Queue('fe-logic', { connection: redis }),
  'fe-style': new Queue('fe-style', { connection: redis }),
  'fe-typefix': new Queue('fe-typefix', { connection: redis }),
  'fe-a11y': new Queue('fe-a11y', { connection: redis }),
  'fe-test': new Queue('fe-test', { connection: redis }),
  'fe-report': new Queue('fe-report', { connection: redis })
};

// Express app setup
const app = express();
const port = process.env.QUEUE_MANAGER_PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Bull Board setup for monitoring
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: Object.values(queues).map(queue => new BullMQAdapter(queue)),
  serverAdapter: serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      redis: 'connected',
      queues: Object.keys(queues).length
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      error: 'Redis connection failed'
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metrics: Record<string, any> = {};
    
    for (const [name, queue] of Object.entries(queues)) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      const delayed = await queue.getDelayed();
      
      metrics[name] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length
      };
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      queues: metrics,
      redis: {
        status: 'connected',
        memory: await redis.memory('usage')
      }
    });
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

// Queue management endpoints
app.post('/queues/:queueName/pause', async (req, res) => {
  try {
    const { queueName } = req.params;
    const queue = queues[queueName];
    
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    
    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
    res.json({ message: `Queue ${queueName} paused successfully` });
  } catch (error) {
    logger.error('Failed to pause queue:', error);
    res.status(500).json({ error: 'Failed to pause queue' });
  }
});

app.post('/queues/:queueName/resume', async (req, res) => {
  try {
    const { queueName } = req.params;
    const queue = queues[queueName];
    
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    
    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
    res.json({ message: `Queue ${queueName} resumed successfully` });
  } catch (error) {
    logger.error('Failed to resume queue:', error);
    res.status(500).json({ error: 'Failed to resume queue' });
  }
});

app.delete('/queues/:queueName/clean', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { status = 'completed', limit = 100 } = req.query;
    const queue = queues[queueName];
    
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    
    const cleaned = await queue.clean(0, parseInt(limit as string), status as any);
    logger.info(`Cleaned ${cleaned.length} jobs from queue ${queueName}`);
    res.json({ 
      message: `Cleaned ${cleaned.length} ${status} jobs from queue ${queueName}`,
      cleaned: cleaned.length
    });
  } catch (error) {
    logger.error('Failed to clean queue:', error);
    res.status(500).json({ error: 'Failed to clean queue' });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    // Close all queues
    await Promise.all(Object.values(queues).map(queue => queue.close()));
    
    // Close Redis connection
    await redis.quit();
    
    logger.info('All connections closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await Promise.all(Object.values(queues).map(queue => queue.close()));
    await redis.quit();
    logger.info('All connections closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
app.listen(port, () => {
  logger.info(`Queue Manager running on port ${port}`);
  logger.info(`Bull Board available at http://localhost:${port}/admin/queues`);
  logger.info(`Metrics available at http://localhost:${port}/metrics`);
});

export { queues, redis, app };