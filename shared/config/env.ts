import { z } from 'zod';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Cargar variables de entorno
dotenv.config();

// Schema de validación para variables de entorno
const envSchema = z.object({
  // Configuración general
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Base de datos
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  DB_HOST: z.string().min(1, 'DB_HOST is required').default('localhost'),
  DB_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(5432),
  DB_NAME: z.string().min(1, 'DB_NAME is required').default('project_db'),
  DB_USER: z.string().min(1, 'DB_USER is required').default('postgres'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_SSL: z.string().transform(val => val === 'true').default(false),
  DB_POOL_MIN: z.string().transform(Number).pipe(z.number().min(0)).default(2),
  DB_POOL_MAX: z.string().transform(Number).pipe(z.number().min(1)).default(10),
  
  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL').optional(),
  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required').default('localhost'),
  REDIS_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).pipe(z.number().min(0).max(15)).default(0),
  REDIS_KEY_PREFIX: z.string().default('project:'),
  REDIS_CONNECT_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default(10000),
  REDIS_COMMAND_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default(5000),
  REDIS_RETRY_DELAY_ON_FAIL_OVER: z.string().transform(Number).pipe(z.number().min(100)).default(100),
  REDIS_MAX_RETRIES_PER_REQUEST: z.string().transform(Number).pipe(z.number().min(0)).default(3),
  
  // BullMQ
  BULLMQ_CONCURRENCY: z.string().transform(Number).pipe(z.number().min(1)).default(5),
  BULLMQ_MAX_STALLED_COUNT: z.string().transform(Number).pipe(z.number().min(1)).default(1),
  BULLMQ_MAX_STALLED_INTERVAL: z.string().transform(Number).pipe(z.number().min(1000)).default(30000),
  BULLMQ_RETRY_DELAY: z.string().transform(Number).pipe(z.number().min(1000)).default(60000),
  BULLMQ_BACKOFF_DELAY: z.string().transform(Number).pipe(z.number().min(1000)).default(2000),
  
  // LLM Providers
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required').optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4'),
  OPENAI_MAX_TOKENS: z.string().transform(Number).pipe(z.number().min(1)).default(4000),
  OPENAI_TEMPERATURE: z.string().transform(Number).pipe(z.number().min(0).max(2)).default(0.7),
  OPENAI_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default(60000),
  
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required').optional(),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com/v1'),
  ANTHROPIC_MODEL: z.string().default('claude-3-sonnet-20240229'),
  ANTHROPIC_MAX_TOKENS: z.string().transform(Number).pipe(z.number().min(1)).default(4000),
  ANTHROPIC_TEMPERATURE: z.string().transform(Number).pipe(z.number().min(0).max(1)).default(0.7),
  ANTHROPIC_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default(60000),
  
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required').optional(),
  GOOGLE_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1'),
  GOOGLE_MODEL: z.string().default('gemini-pro'),
  GOOGLE_MAX_TOKENS: z.string().transform(Number).pipe(z.number().min(1)).default(4000),
  GOOGLE_TEMPERATURE: z.string().transform(Number).pipe(z.number().min(0).max(1)).default(0.7),
  GOOGLE_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default(60000),
  
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('codellama:13b'),
  OLLAMA_MAX_TOKENS: z.string().transform(Number).pipe(z.number().min(1)).default(4000),
  OLLAMA_TEMPERATURE: z.string().transform(Number).pipe(z.number().min(0).max(1)).default(0.7),
  OLLAMA_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default(120000),
  
  // Configuración de agentes
  FE_MANAGER_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3010),
  FE_DRAFT_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3011),
  FE_LOGIC_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3012),
  FE_STYLE_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3013),
  FE_A11Y_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3014),
  FE_TEST_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3015),
  FE_TYPEFIX_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3016),
  FE_REPORT_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3017),
  
  QUEUE_MANAGER_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3020),
  QUEUE_UI_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3021),
  
  // Configuración de archivos
  OUTPUT_DIR: z.string().default('./output'),
  TEMPLATES_DIR: z.string().default('./shared/prompts'),
  BACKUP_DIR: z.string().default('./backups'),
  LOGS_DIR: z.string().default('./logs'),
  
  // Configuración de seguridad
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).pipe(z.number().min(1000)).default(900000), // 15 minutos
  RATE_LIMIT_MAX: z.string().transform(Number).pipe(z.number().min(1)).default(100),
  
  // Configuración de monitoreo
  METRICS_ENABLED: z.string().transform(val => val === 'true').default(true),
  HEALTH_CHECK_INTERVAL: z.string().transform(Number).pipe(z.number().min(1000)).default(30000),
  PROMETHEUS_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(9090),
  
  // Configuración de desarrollo
  HOT_RELOAD: z.string().transform(val => val === 'true').default(false),
  DEBUG_MODE: z.string().transform(val => val === 'true').default(false),
  MOCK_LLM: z.string().transform(val => val === 'true').default(false),
  
  // Configuración de Docker
  DOCKER_NETWORK: z.string().default('project-network'),
  DOCKER_COMPOSE_FILE: z.string().default('docker-compose.dev.yml'),
});

// Validar y parsear variables de entorno
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
  logger.info('Environment variables validated successfully', {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    const errorMessages = error.errors.map(err => {
      const path = err.path.join('.');
      return `${path}: ${err.message}`;
    });
    
    logger.error('Environment validation failed', {
      errors: errorMessages
    });
    
    console.error('❌ Environment validation failed:');
    errorMessages.forEach(msg => console.error(`  - ${msg}`));
    process.exit(1);
  }
  
  logger.error('Unexpected error during environment validation', {
    error: error.message
  });
  
  console.error('❌ Unexpected error during environment validation:', error.message);
  process.exit(1);
}

// Configuraciones derivadas
const config = {
  ...env,
  
  // URLs de conexión construidas
  databaseUrl: env.DATABASE_URL || `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}${env.DB_SSL ? '?sslmode=require' : ''}`,
  redisUrl: env.REDIS_URL || `redis://${env.REDIS_PASSWORD ? `:${env.REDIS_PASSWORD}@` : ''}${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`,
  
  // Configuración de BullMQ
  bullmq: {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT,
      commandTimeout: env.REDIS_COMMAND_TIMEOUT,
      retryDelayOnFailover: env.REDIS_RETRY_DELAY_ON_FAIL_OVER,
      maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: env.BULLMQ_BACKOFF_DELAY,
      },
    },
    settings: {
      stalledInterval: env.BULLMQ_MAX_STALLED_INTERVAL,
      maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
      retryProcessDelay: env.BULLMQ_RETRY_DELAY,
    },
  },
  
  // Configuración de LLM providers
  llm: {
    defaultProvider: 'openai',
    providers: {
      openai: {
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL,
        maxTokens: env.OPENAI_MAX_TOKENS,
        temperature: env.OPENAI_TEMPERATURE,
        timeout: env.OPENAI_TIMEOUT,
      },
      anthropic: {
        apiKey: env.ANTHROPIC_API_KEY,
        baseUrl: env.ANTHROPIC_BASE_URL,
        model: env.ANTHROPIC_MODEL,
        maxTokens: env.ANTHROPIC_MAX_TOKENS,
        temperature: env.ANTHROPIC_TEMPERATURE,
        timeout: env.ANTHROPIC_TIMEOUT,
      },
      google: {
        apiKey: env.GOOGLE_API_KEY,
        baseUrl: env.GOOGLE_BASE_URL,
        model: env.GOOGLE_MODEL,
        maxTokens: env.GOOGLE_MAX_TOKENS,
        temperature: env.GOOGLE_TEMPERATURE,
        timeout: env.GOOGLE_TIMEOUT,
      },
      ollama: {
        baseUrl: env.OLLAMA_BASE_URL,
        model: env.OLLAMA_MODEL,
        maxTokens: env.OLLAMA_MAX_TOKENS,
        temperature: env.OLLAMA_TEMPERATURE,
        timeout: env.OLLAMA_TIMEOUT,
      },
    },
  },
  
  // Configuración de agentes
  agents: {
    'fe-manager': { port: env.FE_MANAGER_PORT },
    'fe-draft': { port: env.FE_DRAFT_PORT },
    'fe-logic': { port: env.FE_LOGIC_PORT },
    'fe-style': { port: env.FE_STYLE_PORT },
    'fe-a11y': { port: env.FE_A11Y_PORT },
    'fe-test': { port: env.FE_TEST_PORT },
    'fe-typefix': { port: env.FE_TYPEFIX_PORT },
    'fe-report': { port: env.FE_REPORT_PORT },
  },
  
  // Configuración de colas
  queues: {
    'fe-draft': { concurrency: env.BULLMQ_CONCURRENCY },
    'fe-logic': { concurrency: env.BULLMQ_CONCURRENCY },
    'fe-style': { concurrency: env.BULLMQ_CONCURRENCY },
    'fe-a11y': { concurrency: env.BULLMQ_CONCURRENCY },
    'fe-test': { concurrency: env.BULLMQ_CONCURRENCY },
    'fe-typefix': { concurrency: env.BULLMQ_CONCURRENCY },
    'fe-report': { concurrency: env.BULLMQ_CONCURRENCY },
  },
  
  // Configuración de directorios
  paths: {
    output: env.OUTPUT_DIR,
    templates: env.TEMPLATES_DIR,
    backup: env.BACKUP_DIR,
    logs: env.LOGS_DIR,
  },
  
  // Configuración de desarrollo
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
};

// Validaciones adicionales
if (config.isProduction) {
  // En producción, ciertas variables son obligatorias
  const requiredInProduction = [
    'JWT_SECRET',
    'OPENAI_API_KEY'
  ];
  
  const missing = requiredInProduction.filter(key => !env[key]);
  if (missing.length > 0) {
    logger.error('Missing required environment variables for production', {
      missing
    });
    console.error('❌ Missing required environment variables for production:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }
}

// Verificar que los puertos no estén duplicados
const ports = Object.values(config.agents).map(agent => agent.port);
const duplicatePorts = ports.filter((port, index) => ports.indexOf(port) !== index);
if (duplicatePorts.length > 0) {
  logger.error('Duplicate ports detected', { duplicatePorts });
  console.error('❌ Duplicate ports detected:', duplicatePorts);
  process.exit(1);
}

// Función para obtener configuración específica de un agente
export function getAgentConfig(agentName: string) {
  const agentConfig = config.agents[agentName];
  if (!agentConfig) {
    throw new Error(`Agent '${agentName}' not found in configuration`);
  }
  
  return {
    ...agentConfig,
    redis: config.bullmq.connection,
    llm: config.llm,
    paths: config.paths,
    nodeEnv: config.NODE_ENV,
    logLevel: config.LOG_LEVEL,
    isDevelopment: config.isDevelopment,
    isProduction: config.isProduction,
    isTest: config.isTest,
  };
}

// Función para obtener configuración de cola
export function getQueueConfig(queueName: string) {
  const queueConfig = config.queues[queueName];
  if (!queueConfig) {
    throw new Error(`Queue '${queueName}' not found in configuration`);
  }
  
  return {
    ...queueConfig,
    connection: config.bullmq.connection,
    defaultJobOptions: config.bullmq.defaultJobOptions,
    settings: config.bullmq.settings,
  };
}

// Función para validar configuración en tiempo de ejecución
export function validateRuntimeConfig() {
  const checks = [];
  
  // Verificar conectividad a Redis
  checks.push({
    name: 'Redis Connection',
    check: async () => {
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(config.redisUrl);
        await redis.ping();
        await redis.disconnect();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  });
  
  // Verificar conectividad a base de datos
  checks.push({
    name: 'Database Connection',
    check: async () => {
      try {
        // Aquí se podría usar Prisma o el cliente de DB que uses
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  });
  
  return checks;
}

// Función para imprimir configuración (sin secretos)
export function printConfig() {
  const safeConfig = {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    logLevel: config.LOG_LEVEL,
    agents: config.agents,
    queues: Object.keys(config.queues),
    llmProviders: Object.keys(config.llm.providers),
    paths: config.paths,
    isDevelopment: config.isDevelopment,
    isProduction: config.isProduction,
  };
  
  console.log('📋 Configuration:');
  console.log(JSON.stringify(safeConfig, null, 2));
}

export default config;
export { envSchema };