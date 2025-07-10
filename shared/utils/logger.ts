import winston from 'winston';
import { config } from '../config/env';

// Configuración de formatos
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      service: service || 'unknown',
      message,
      ...meta
    });
  })
);

// Configuración de transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${service || 'unknown'}] ${level}: ${message} ${metaStr}`;
      })
    )
  })
];

// File transport para producción
if (config.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat
    })
  );
}

// Crear logger
const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'backend-service'
  },
  // Manejo de excepciones no capturadas
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(config.NODE_ENV === 'production' ? [
      new winston.transports.File({ filename: 'logs/exceptions.log' })
    ] : [])
  ],
  // Manejo de rechazos de promesas no capturadas
  rejectionHandlers: [
    new winston.transports.Console(),
    ...(config.NODE_ENV === 'production' ? [
      new winston.transports.File({ filename: 'logs/rejections.log' })
    ] : [])
  ]
});

// Wrapper para agregar contexto automáticamente
class ContextualLogger {
  private baseLogger: winston.Logger;
  private defaultContext: Record<string, any>;

  constructor(baseLogger: winston.Logger, defaultContext: Record<string, any> = {}) {
    this.baseLogger = baseLogger;
    this.defaultContext = defaultContext;
  }

  private log(level: string, message: string, meta: Record<string, any> = {}) {
    const correlationId = this.generateCorrelationId();
    this.baseLogger.log(level, message, {
      ...this.defaultContext,
      correlationId,
      ...meta
    });
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  info(message: string, meta?: Record<string, any>) {
    this.log('info', message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.log('error', message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log('warn', message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log('debug', message, meta);
  }

  verbose(message: string, meta?: Record<string, any>) {
    this.log('verbose', message, meta);
  }

  // Métodos específicos para diferentes contextos
  job(jobId: string, message: string, meta?: Record<string, any>) {
    this.info(message, { jobId, context: 'job', ...meta });
  }

  api(method: string, path: string, message: string, meta?: Record<string, any>) {
    this.info(message, { method, path, context: 'api', ...meta });
  }

  worker(workerName: string, message: string, meta?: Record<string, any>) {
    this.info(message, { workerName, context: 'worker', ...meta });
  }

  llm(model: string, message: string, meta?: Record<string, any>) {
    this.info(message, { model, context: 'llm', ...meta });
  }

  // Método para crear un logger con contexto específico
  child(context: Record<string, any>): ContextualLogger {
    return new ContextualLogger(this.baseLogger, {
      ...this.defaultContext,
      ...context
    });
  }

  // Método para medir tiempo de ejecución
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`Timer: ${label}`, { duration, unit: 'ms' });
    };
  }

  // Método para logging estructurado de errores
  logError(error: Error, context?: Record<string, any>) {
    this.error('Error occurred', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      ...context
    });
  }

  // Método para logging de métricas
  metric(name: string, value: number, unit?: string, tags?: Record<string, string>) {
    this.info('Metric recorded', {
      metricName: name,
      metricValue: value,
      metricUnit: unit,
      metricTags: tags,
      context: 'metric'
    });
  }
}

// Exportar logger contextual
export const logger = new ContextualLogger(logger);

// Exportar logger base para casos especiales
export const baseLogger = logger;

// Middleware para Express (opcional)
export const expressLogger = (serviceName: string) => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    req.logger = logger.child({
      requestId,
      service: serviceName,
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      req.logger.api(req.method, req.path, 'Request completed', {
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length')
      });
    });
    
    next();
  };
};

export default logger;