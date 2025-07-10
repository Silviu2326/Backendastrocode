import Redis from 'ioredis';
import { logger } from '../utils/logger';
import config from './env';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  connectTimeout: number;
  commandTimeout: number;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
  keepAlive: number;
  family: number;
  enableReadyCheck: boolean;
  maxLoadingTimeout: number;
}

interface RedisClusterConfig {
  nodes: Array<{ host: string; port: number }>;
  options: {
    password?: string;
    keyPrefix: string;
    enableReadyCheck: boolean;
    redisOptions: {
      connectTimeout: number;
      commandTimeout: number;
      lazyConnect: boolean;
      keepAlive: number;
      family: number;
    };
  };
}

class RedisManager {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private cluster: Redis.Cluster | null = null;
  private isCluster: boolean = false;
  private connectionConfig: RedisConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;

  constructor() {
    this.connectionConfig = this.buildRedisConfig();
    this.setupEventHandlers();
  }

  /**
   * Construye la configuración de Redis desde las variables de entorno
   */
  private buildRedisConfig(): RedisConfig {
    return {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      db: config.REDIS_DB,
      keyPrefix: config.REDIS_KEY_PREFIX,
      connectTimeout: config.REDIS_CONNECT_TIMEOUT,
      commandTimeout: config.REDIS_COMMAND_TIMEOUT,
      retryDelayOnFailover: config.REDIS_RETRY_DELAY_ON_FAIL_OVER,
      maxRetriesPerRequest: config.REDIS_MAX_RETRIES_PER_REQUEST,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000
    };
  }

  /**
   * Configura los manejadores de eventos para las conexiones Redis
   */
  private setupEventHandlers(): void {
    const handleConnect = (type: string) => {
      logger.info(`Redis ${type} connected`, {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        db: this.connectionConfig.db
      });
      this.reconnectAttempts = 0;
    };

    const handleError = (type: string) => (error: Error) => {
      logger.error(`Redis ${type} error`, {
        error: error.message,
        host: this.connectionConfig.host,
        port: this.connectionConfig.port
      });
    };

    const handleClose = (type: string) => () => {
      logger.warn(`Redis ${type} connection closed`, {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port
      });
    };

    const handleReconnecting = (type: string) => (time: number) => {
      this.reconnectAttempts++;
      logger.info(`Redis ${type} reconnecting`, {
        attempt: this.reconnectAttempts,
        delay: time,
        maxAttempts: this.maxReconnectAttempts
      });

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error(`Redis ${type} max reconnection attempts reached`, {
          attempts: this.reconnectAttempts
        });
      }
    };

    // Aplicar eventos a todas las conexiones cuando se creen
    this.applyEventHandlers = (redis: Redis, type: string) => {
      redis.on('connect', () => handleConnect(type));
      redis.on('error', handleError(type));
      redis.on('close', handleClose(type));
      redis.on('reconnecting', (time) => handleReconnecting(type)(time));
      redis.on('ready', () => {
        logger.info(`Redis ${type} ready`, {
          host: this.connectionConfig.host,
          port: this.connectionConfig.port
        });
      });
    };
  }

  private applyEventHandlers: (redis: Redis, type: string) => void;

  /**
   * Inicializa la conexión principal de Redis
   */
  async connect(): Promise<Redis> {
    if (this.client && this.client.status === 'ready') {
      return this.client;
    }

    try {
      logger.info('Connecting to Redis', {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        db: this.connectionConfig.db
      });

      this.client = new Redis({
        ...this.connectionConfig,
        retryDelayOnFailover: this.connectionConfig.retryDelayOnFailover,
        enableOfflineQueue: false,
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          return err.message.includes(targetError);
        }
      });

      this.applyEventHandlers(this.client, 'client');

      // Esperar a que la conexión esté lista
      await this.client.connect();

      // Verificar la conexión
      await this.client.ping();

      // Iniciar health check
      this.startHealthCheck();

      logger.info('Redis client connected successfully');
      return this.client;

    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error.message,
        host: this.connectionConfig.host,
        port: this.connectionConfig.port
      });
      throw error;
    }
  }

  /**
   * Inicializa la conexión de suscriptor para pub/sub
   */
  async getSubscriber(): Promise<Redis> {
    if (this.subscriber && this.subscriber.status === 'ready') {
      return this.subscriber;
    }

    try {
      this.subscriber = new Redis({
        ...this.connectionConfig,
        enableOfflineQueue: false
      });

      this.applyEventHandlers(this.subscriber, 'subscriber');
      await this.subscriber.connect();

      logger.info('Redis subscriber connected successfully');
      return this.subscriber;

    } catch (error) {
      logger.error('Failed to connect Redis subscriber', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Inicializa la conexión de publicador para pub/sub
   */
  async getPublisher(): Promise<Redis> {
    if (this.publisher && this.publisher.status === 'ready') {
      return this.publisher;
    }

    try {
      this.publisher = new Redis({
        ...this.connectionConfig,
        enableOfflineQueue: false
      });

      this.applyEventHandlers(this.publisher, 'publisher');
      await this.publisher.connect();

      logger.info('Redis publisher connected successfully');
      return this.publisher;

    } catch (error) {
      logger.error('Failed to connect Redis publisher', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Obtiene la configuración para BullMQ
   */
  getBullMQConnection(): RedisConfig {
    return {
      ...this.connectionConfig,
      maxRetriesPerRequest: null, // BullMQ maneja sus propios reintentos
    };
  }

  /**
   * Inicializa un cluster de Redis
   */
  async connectCluster(nodes: Array<{ host: string; port: number }>): Promise<Redis.Cluster> {
    if (this.cluster && this.cluster.status === 'ready') {
      return this.cluster;
    }

    try {
      const clusterConfig: RedisClusterConfig = {
        nodes,
        options: {
          password: this.connectionConfig.password,
          keyPrefix: this.connectionConfig.keyPrefix,
          enableReadyCheck: true,
          redisOptions: {
            connectTimeout: this.connectionConfig.connectTimeout,
            commandTimeout: this.connectionConfig.commandTimeout,
            lazyConnect: true,
            keepAlive: this.connectionConfig.keepAlive,
            family: this.connectionConfig.family
          }
        }
      };

      this.cluster = new Redis.Cluster(clusterConfig.nodes, clusterConfig.options);
      this.isCluster = true;

      this.cluster.on('connect', () => {
        logger.info('Redis cluster connected', { nodes });
      });

      this.cluster.on('error', (error) => {
        logger.error('Redis cluster error', {
          error: error.message,
          nodes
        });
      });

      this.cluster.on('ready', () => {
        logger.info('Redis cluster ready', { nodes });
      });

      await this.cluster.connect();
      logger.info('Redis cluster connected successfully');
      return this.cluster;

    } catch (error) {
      logger.error('Failed to connect to Redis cluster', {
        error: error.message,
        nodes
      });
      throw error;
    }
  }

  /**
   * Inicia el health check periódico
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        if (this.client) {
          await this.client.ping();
        }
        if (this.subscriber) {
          await this.subscriber.ping();
        }
        if (this.publisher) {
          await this.publisher.ping();
        }
        if (this.cluster) {
          await this.cluster.ping();
        }
      } catch (error) {
        logger.warn('Redis health check failed', {
          error: error.message
        });
      }
    }, config.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Obtiene estadísticas de Redis
   */
  async getStats(): Promise<Record<string, any>> {
    try {
      const stats: Record<string, any> = {};

      if (this.client && this.client.status === 'ready') {
        const info = await this.client.info();
        const memory = await this.client.info('memory');
        const keyspace = await this.client.info('keyspace');
        
        stats.client = {
          status: this.client.status,
          info: this.parseRedisInfo(info),
          memory: this.parseRedisInfo(memory),
          keyspace: this.parseRedisInfo(keyspace)
        };
      }

      if (this.cluster && this.cluster.status === 'ready') {
        const nodes = this.cluster.nodes();
        stats.cluster = {
          status: this.cluster.status,
          nodesCount: nodes.length,
          nodes: nodes.map(node => ({
            host: node.options.host,
            port: node.options.port,
            status: node.status
          }))
        };
      }

      stats.config = {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        db: this.connectionConfig.db,
        keyPrefix: this.connectionConfig.keyPrefix,
        isCluster: this.isCluster
      };

      return stats;

    } catch (error) {
      logger.error('Error getting Redis stats', {
        error: error.message
      });
      return { error: error.message };
    }
  }

  /**
   * Parsea la información de Redis INFO
   */
  private parseRedisInfo(info: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          // Intentar convertir números
          const numValue = Number(value);
          result[key] = isNaN(numValue) ? value : numValue;
        }
      }
    }
    
    return result;
  }

  /**
   * Verifica la salud de las conexiones
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    connections: Record<string, { status: string; latency?: number }>;
  }> {
    const connections: Record<string, { status: string; latency?: number }> = {};
    let healthy = true;

    // Verificar cliente principal
    if (this.client) {
      try {
        const start = Date.now();
        await this.client.ping();
        const latency = Date.now() - start;
        connections.client = { status: 'healthy', latency };
      } catch (error) {
        connections.client = { status: 'unhealthy' };
        healthy = false;
      }
    }

    // Verificar suscriptor
    if (this.subscriber) {
      try {
        const start = Date.now();
        await this.subscriber.ping();
        const latency = Date.now() - start;
        connections.subscriber = { status: 'healthy', latency };
      } catch (error) {
        connections.subscriber = { status: 'unhealthy' };
        healthy = false;
      }
    }

    // Verificar publicador
    if (this.publisher) {
      try {
        const start = Date.now();
        await this.publisher.ping();
        const latency = Date.now() - start;
        connections.publisher = { status: 'healthy', latency };
      } catch (error) {
        connections.publisher = { status: 'unhealthy' };
        healthy = false;
      }
    }

    // Verificar cluster
    if (this.cluster) {
      try {
        const start = Date.now();
        await this.cluster.ping();
        const latency = Date.now() - start;
        connections.cluster = { status: 'healthy', latency };
      } catch (error) {
        connections.cluster = { status: 'unhealthy' };
        healthy = false;
      }
    }

    return { healthy, connections };
  }

  /**
   * Limpia las claves con un patrón específico
   */
  async cleanupKeys(pattern: string): Promise<number> {
    try {
      const redis = this.client || await this.connect();
      const keys = await redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await redis.del(...keys);
      
      logger.info('Redis keys cleaned up', {
        pattern,
        keysFound: keys.length,
        keysDeleted: deleted
      });
      
      return deleted;

    } catch (error) {
      logger.error('Error cleaning up Redis keys', {
        pattern,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cierra todas las conexiones
   */
  async disconnect(): Promise<void> {
    logger.info('Disconnecting from Redis');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const disconnectPromises = [];

    if (this.client) {
      disconnectPromises.push(this.client.disconnect());
    }

    if (this.subscriber) {
      disconnectPromises.push(this.subscriber.disconnect());
    }

    if (this.publisher) {
      disconnectPromises.push(this.publisher.disconnect());
    }

    if (this.cluster) {
      disconnectPromises.push(this.cluster.disconnect());
    }

    try {
      await Promise.all(disconnectPromises);
      logger.info('All Redis connections closed');
    } catch (error) {
      logger.error('Error closing Redis connections', {
        error: error.message
      });
    }

    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.cluster = null;
  }

  /**
   * Obtiene el cliente Redis principal
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Verifica si está conectado
   */
  isConnected(): boolean {
    return this.client?.status === 'ready' || this.cluster?.status === 'ready' || false;
  }

  /**
   * Obtiene información de configuración (sin secretos)
   */
  getConnectionInfo(): Record<string, any> {
    return {
      host: this.connectionConfig.host,
      port: this.connectionConfig.port,
      db: this.connectionConfig.db,
      keyPrefix: this.connectionConfig.keyPrefix,
      isCluster: this.isCluster,
      isConnected: this.isConnected(),
      clientStatus: this.client?.status || 'disconnected',
      subscriberStatus: this.subscriber?.status || 'disconnected',
      publisherStatus: this.publisher?.status || 'disconnected',
      clusterStatus: this.cluster?.status || 'disconnected'
    };
  }
}

// Instancia singleton
export const redisManager = new RedisManager();

// Función de conveniencia para obtener la conexión BullMQ
export function getBullMQConnection() {
  return redisManager.getBullMQConnection();
}

// Función de conveniencia para obtener el cliente Redis
export async function getRedisClient(): Promise<Redis> {
  return await redisManager.connect();
}

// Función de conveniencia para health check
export async function checkRedisHealth() {
  return await redisManager.healthCheck();
}

// Export connection for utilities
export const redisConnection = redisManager.connect();

export { RedisConfig, RedisClusterConfig };