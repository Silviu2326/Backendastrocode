const Log = require('../models/Logs');
const os = require('os');

class LogHelper {
  /**
   * Crea una entrada de log
   * @param {Object} logData - Datos del log
   * @returns {Promise<Object>} - Log creado
   */
  static async createLog(logData) {
    try {
      const {
        projectId,
        level,
        service,
        component = null,
        message,
        context = {},
        environment = process.env.NODE_ENV || 'development',
        tags = [],
        correlationId = null
      } = logData;

      const logEntry = new Log({
        projectId,
        level,
        service,
        component,
        message,
        context,
        environment,
        tags,
        correlationId,
        instance: {
          hostname: os.hostname(),
          pid: process.pid,
          version: process.env.npm_package_version || '1.0.0',
          nodeVersion: process.version
        }
      });

      const savedLog = await logEntry.save();
      
      // Solo mostrar en consola si es error o fatal
      if (['error', 'fatal'].includes(level)) {
        console.error(`🚨 ${level.toUpperCase()}: ${message}`);
      }
      
      return savedLog;
    } catch (error) {
      console.error('❌ Error creating log entry:', error);
      // No lanzar error para evitar loops infinitos
      return null;
    }
  }

  /**
   * Log de debug
   */
  static async debug(projectId, service, message, context = {}) {
    return this.createLog({
      projectId,
      level: 'debug',
      service,
      message,
      context
    });
  }

  /**
   * Log de información
   */
  static async info(projectId, service, message, context = {}) {
    return this.createLog({
      projectId,
      level: 'info',
      service,
      message,
      context
    });
  }

  /**
   * Log de advertencia
   */
  static async warn(projectId, service, message, context = {}) {
    return this.createLog({
      projectId,
      level: 'warn',
      service,
      message,
      context
    });
  }

  /**
   * Log de error
   */
  static async error(projectId, service, message, context = {}) {
    return this.createLog({
      projectId,
      level: 'error',
      service,
      message,
      context
    });
  }

  /**
   * Log de error fatal
   */
  static async fatal(projectId, service, message, context = {}) {
    return this.createLog({
      projectId,
      level: 'fatal',
      service,
      message,
      context
    });
  }

  /**
   * Log de request HTTP
   */
  static async logRequest(projectId, req, res, responseTime) {
    const context = {
      requestId: req.id || req.headers['x-request-id'],
      userId: req.user?.userId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress
    };

    const level = res.statusCode >= 500 ? 'error' : 
                 res.statusCode >= 400 ? 'warn' : 'info';

    return this.createLog({
      projectId,
      level,
      service: 'api',
      component: 'http',
      message: `${req.method} ${req.originalUrl} - ${res.statusCode}`,
      context,
      tags: ['http', 'request']
    });
  }

  /**
   * Log de error de base de datos
   */
  static async logDatabaseError(projectId, operation, error, context = {}) {
    return this.createLog({
      projectId,
      level: 'error',
      service: 'database',
      component: 'mongodb',
      message: `Database error in ${operation}: ${error.message}`,
      context: {
        ...context,
        errorCode: error.code,
        errorType: error.name,
        stackTrace: error.stack
      },
      tags: ['database', 'mongodb', 'error']
    });
  }

  /**
   * Log de performance
   */
  static async logPerformance(projectId, operation, duration, context = {}) {
    const level = duration > 5000 ? 'warn' : 
                 duration > 1000 ? 'info' : 'debug';

    return this.createLog({
      projectId,
      level,
      service: 'performance',
      message: `Operation ${operation} took ${duration}ms`,
      context: {
        ...context,
        duration,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
      },
      tags: ['performance', operation]
    });
  }

  /**
   * Log de integración con servicios externos
   */
  static async logExternalService(projectId, service, operation, success, context = {}) {
    const level = success ? 'info' : 'error';
    const message = `${service} ${operation} ${success ? 'succeeded' : 'failed'}`;

    return this.createLog({
      projectId,
      level,
      service: 'external',
      component: service,
      message,
      context,
      tags: ['external', service, operation]
    });
  }

  /**
   * Obtiene logs con filtros
   */
  static async getLogs(projectId, options = {}) {
    return Log.getLogs(projectId, options);
  }

  /**
   * Obtiene estadísticas de logs
   */
  static async getLogStats(projectId, timeRange = '24h') {
    return Log.getLogStats(projectId, timeRange);
  }

  /**
   * Middleware para logging automático de requests
   */
  static requestLogger(projectId) {
    return (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        this.logRequest(projectId, req, res, responseTime);
      });
      
      next();
    };
  }
}

module.exports = LogHelper;