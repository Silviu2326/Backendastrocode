import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Redis } from 'ioredis';
import { logger } from '../../../../shared/utils/logger';
import { Request, Response, NextFunction } from 'express';

export interface SecurityConfig {
  mtls: {
    enabled: boolean;
    certPath: string;
    keyPath: string;
    caPath: string;
    requireClientCert: boolean;
  };
  rbac: {
    enabled: boolean;
    roles: {
      [roleName: string]: {
        permissions: string[];
        queues: string[];
        resources: string[];
      };
    };
  };
  redis: {
    aclEnabled: boolean;
    username: string;
    password: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
}

export interface AuthContext {
  userId: string;
  role: string;
  permissions: string[];
  clientCert?: {
    subject: string;
    issuer: string;
    fingerprint: string;
  };
  sessionId: string;
  expiresAt: Date;
}

export interface SecurityAuditLog {
  timestamp: Date;
  event: string;
  userId?: string;
  role?: string;
  resource: string;
  action: string;
  success: boolean;
  clientIp: string;
  userAgent: string;
  metadata?: any;
}

class SecurityManager {
  private config: SecurityConfig;
  private redis: Redis;
  private auditLogs: SecurityAuditLog[] = [];
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  constructor(config: SecurityConfig, redis: Redis) {
    this.config = config;
    this.redis = redis;
    this.initializeRedisACL();
  }

  private async initializeRedisACL(): Promise<void> {
    if (!this.config.rbac.enabled || !this.config.redis.aclEnabled) {
      return;
    }

    try {
      // Create ACL users for different roles
      for (const [roleName, roleConfig] of Object.entries(this.config.rbac.roles)) {
        const username = `fe-${roleName}`;
        const password = this.generateSecurePassword();
        
        // Build queue patterns for this role
        const queuePatterns = roleConfig.queues.map(queue => `~${queue}:*`).join(' ');
        
        // Create ACL rule
        const aclRule = [
          `+@read`,
          `+@write`,
          `-@dangerous`,
          queuePatterns || '~*',
          `>${password}`
        ].join(' ');

        await this.redis.call('ACL', 'SETUSER', username, 'on', aclRule);
        
        // Store credentials securely
        await this.redis.hset(
          'security:credentials',
          `${roleName}:username`,
          username,
          `${roleName}:password`,
          password
        );

        logger.info('Created Redis ACL user', { username, role: roleName });
      }
    } catch (error) {
      logger.error('Error initializing Redis ACL', { error: error.message });
    }
  }

  // mTLS Certificate validation middleware
  validateClientCertificate() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.mtls.enabled) {
        return next();
      }

      const clientCert = (req as any).connection?.getPeerCertificate?.();
      
      if (!clientCert || !clientCert.subject) {
        this.auditLog({
          event: 'mtls.cert_missing',
          resource: req.path,
          action: req.method,
          success: false,
          clientIp: req.ip,
          userAgent: req.get('User-Agent') || 'unknown'
        });
        
        return res.status(401).json({ error: 'Client certificate required' });
      }

      // Validate certificate against CA
      if (!this.validateCertificateChain(clientCert)) {
        this.auditLog({
          event: 'mtls.cert_invalid',
          resource: req.path,
          action: req.method,
          success: false,
          clientIp: req.ip,
          userAgent: req.get('User-Agent') || 'unknown',
          metadata: { certSubject: clientCert.subject }
        });
        
        return res.status(403).json({ error: 'Invalid client certificate' });
      }

      // Extract role from certificate
      const role = this.extractRoleFromCertificate(clientCert);
      if (!role || !this.config.rbac.roles[role]) {
        this.auditLog({
          event: 'mtls.role_invalid',
          resource: req.path,
          action: req.method,
          success: false,
          clientIp: req.ip,
          userAgent: req.get('User-Agent') || 'unknown',
          metadata: { certSubject: clientCert.subject, extractedRole: role }
        });
        
        return res.status(403).json({ error: 'Invalid role in certificate' });
      }

      // Add auth context to request
      (req as any).authContext = {
        userId: clientCert.subject.CN,
        role,
        permissions: this.config.rbac.roles[role].permissions,
        clientCert: {
          subject: clientCert.subject,
          issuer: clientCert.issuer,
          fingerprint: clientCert.fingerprint
        },
        sessionId: this.generateSessionId(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };

      this.auditLog({
        event: 'mtls.auth_success',
        userId: clientCert.subject.CN,
        role,
        resource: req.path,
        action: req.method,
        success: true,
        clientIp: req.ip,
        userAgent: req.get('User-Agent') || 'unknown'
      });

      next();
    };
  }

  // RBAC authorization middleware
  requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.rbac.enabled) {
        return next();
      }

      const authContext = (req as any).authContext as AuthContext;
      
      if (!authContext) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!authContext.permissions.includes(permission) && !authContext.permissions.includes('*')) {
        this.auditLog({
          event: 'rbac.permission_denied',
          userId: authContext.userId,
          role: authContext.role,
          resource: req.path,
          action: req.method,
          success: false,
          clientIp: req.ip,
          userAgent: req.get('User-Agent') || 'unknown',
          metadata: { requiredPermission: permission, userPermissions: authContext.permissions }
        });
        
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permission,
          granted: authContext.permissions
        });
      }

      next();
    };
  }

  // Queue access control
  async authorizeQueueAccess(
    authContext: AuthContext,
    queueName: string,
    operation: 'read' | 'write' | 'admin'
  ): Promise<boolean> {
    if (!this.config.rbac.enabled) {
      return true;
    }

    const roleConfig = this.config.rbac.roles[authContext.role];
    if (!roleConfig) {
      return false;
    }

    // Check if user has access to this queue
    const hasQueueAccess = roleConfig.queues.includes(queueName) || 
                          roleConfig.queues.includes('*');
    
    if (!hasQueueAccess) {
      this.auditLog({
        event: 'rbac.queue_access_denied',
        userId: authContext.userId,
        role: authContext.role,
        resource: `queue:${queueName}`,
        action: operation,
        success: false,
        clientIp: 'internal',
        userAgent: 'queue-manager'
      });
      return false;
    }

    // Check operation permissions
    const requiredPermission = `queue:${operation}`;
    const hasPermission = authContext.permissions.includes(requiredPermission) ||
                         authContext.permissions.includes('queue:*') ||
                         authContext.permissions.includes('*');

    if (!hasPermission) {
      this.auditLog({
        event: 'rbac.operation_denied',
        userId: authContext.userId,
        role: authContext.role,
        resource: `queue:${queueName}`,
        action: operation,
        success: false,
        clientIp: 'internal',
        userAgent: 'queue-manager',
        metadata: { requiredPermission }
      });
      return false;
    }

    return true;
  }

  // Rate limiting middleware
  rateLimit() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getRateLimitKey(req);
      const now = Date.now();
      const windowStart = now - this.config.rateLimit.windowMs;
      
      // Clean old entries
      for (const [k, v] of this.rateLimitStore.entries()) {
        if (v.resetTime < now) {
          this.rateLimitStore.delete(k);
        }
      }

      const current = this.rateLimitStore.get(key) || { count: 0, resetTime: now + this.config.rateLimit.windowMs };
      
      if (current.count >= this.config.rateLimit.maxRequests) {
        this.auditLog({
          event: 'rate_limit.exceeded',
          resource: req.path,
          action: req.method,
          success: false,
          clientIp: req.ip,
          userAgent: req.get('User-Agent') || 'unknown',
          metadata: { 
            currentCount: current.count,
            limit: this.config.rateLimit.maxRequests,
            resetTime: new Date(current.resetTime)
          }
        });
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          limit: this.config.rateLimit.maxRequests,
          resetTime: new Date(current.resetTime)
        });
      }

      current.count++;
      this.rateLimitStore.set(key, current);
      
      res.setHeader('X-RateLimit-Limit', this.config.rateLimit.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.config.rateLimit.maxRequests - current.count));
      res.setHeader('X-RateLimit-Reset', new Date(current.resetTime).toISOString());
      
      next();
    };
  }

  private validateCertificateChain(clientCert: any): boolean {
    try {
      if (!fs.existsSync(this.config.mtls.caPath)) {
        logger.warn('CA certificate file not found', { path: this.config.mtls.caPath });
        return false;
      }

      const caCert = fs.readFileSync(this.config.mtls.caPath, 'utf8');
      
      // Basic validation - in production, use proper certificate validation
      return clientCert.issuer && clientCert.subject && !clientCert.expired;
    } catch (error) {
      logger.error('Error validating certificate chain', { error: error.message });
      return false;
    }
  }

  private extractRoleFromCertificate(clientCert: any): string | null {
    try {
      // Extract role from certificate subject or extensions
      // Format: CN=fe-manager,OU=fe-orchestrator,O=MyOrg
      const subject = clientCert.subject;
      
      if (subject.OU) {
        return subject.OU;
      }
      
      if (subject.CN && subject.CN.startsWith('fe-')) {
        return subject.CN.substring(3); // Remove 'fe-' prefix
      }
      
      return null;
    } catch (error) {
      logger.error('Error extracting role from certificate', { error: error.message });
      return null;
    }
  }

  private getRateLimitKey(req: Request): string {
    const authContext = (req as any).authContext as AuthContext;
    
    if (authContext) {
      return `user:${authContext.userId}`;
    }
    
    return `ip:${req.ip}`;
  }

  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateSecurePassword(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  private auditLog(log: Omit<SecurityAuditLog, 'timestamp'>): void {
    const auditEntry: SecurityAuditLog = {
      timestamp: new Date(),
      ...log
    };
    
    this.auditLogs.push(auditEntry);
    
    // Keep only last 10000 entries in memory
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-5000);
    }
    
    // Log security events
    logger.info('Security audit', auditEntry);
    
    // Store in Redis for persistence
    this.redis.lpush(
      'security:audit_log',
      JSON.stringify(auditEntry)
    ).catch(error => {
      logger.error('Error storing audit log', { error: error.message });
    });
  }

  // Generate client certificates for development
  async generateClientCertificate(
    commonName: string,
    role: string,
    validDays: number = 365
  ): Promise<{ cert: string; key: string; fingerprint: string }> {
    try {
      const { spawn } = require('child_process');
      const certDir = path.join(process.cwd(), 'certs', 'clients');
      
      // Ensure directory exists
      fs.mkdirSync(certDir, { recursive: true });
      
      const keyPath = path.join(certDir, `${commonName}.key`);
      const certPath = path.join(certDir, `${commonName}.crt`);
      const csrPath = path.join(certDir, `${commonName}.csr`);
      
      // Generate private key
      await this.execCommand(`openssl genrsa -out ${keyPath} 2048`);
      
      // Generate certificate signing request
      const subject = `/C=US/ST=CA/L=SF/O=MyOrg/OU=${role}/CN=${commonName}`;
      await this.execCommand(`openssl req -new -key ${keyPath} -out ${csrPath} -subj "${subject}"`);
      
      // Sign certificate with CA
      await this.execCommand(
        `openssl x509 -req -in ${csrPath} -CA ${this.config.mtls.caPath} ` +
        `-CAkey ${this.config.mtls.keyPath} -CAcreateserial -out ${certPath} -days ${validDays}`
      );
      
      // Read generated files
      const cert = fs.readFileSync(certPath, 'utf8');
      const key = fs.readFileSync(keyPath, 'utf8');
      
      // Calculate fingerprint
      const fingerprint = crypto
        .createHash('sha256')
        .update(cert)
        .digest('hex')
        .match(/.{2}/g)!
        .join(':');
      
      // Cleanup CSR
      fs.unlinkSync(csrPath);
      
      logger.info('Generated client certificate', { 
        commonName, 
        role, 
        fingerprint,
        certPath,
        keyPath
      });
      
      return { cert, key, fingerprint };
    } catch (error) {
      logger.error('Error generating client certificate', { 
        commonName, 
        role, 
        error: error.message 
      });
      throw error;
    }
  }

  private execCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(command, (error: any, stdout: any, stderr: any) => {
        if (error) {
          reject(new Error(`Command failed: ${command}\n${stderr}`));
        } else {
          resolve();
        }
      });
    });
  }

  // Get security metrics
  async getSecurityMetrics(hours: number = 24): Promise<any> {
    try {
      const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
      const recentLogs = this.auditLogs.filter(log => log.timestamp >= since);
      
      const metrics = {
        totalEvents: recentLogs.length,
        successfulAuth: recentLogs.filter(log => log.event.includes('auth_success')).length,
        failedAuth: recentLogs.filter(log => log.event.includes('auth') && !log.success).length,
        permissionDenials: recentLogs.filter(log => log.event.includes('permission_denied')).length,
        rateLimitHits: recentLogs.filter(log => log.event.includes('rate_limit')).length,
        uniqueUsers: new Set(recentLogs.map(log => log.userId).filter(Boolean)).size,
        topEvents: this.getTopEvents(recentLogs),
        topUsers: this.getTopUsers(recentLogs)
      };
      
      return metrics;
    } catch (error) {
      logger.error('Error getting security metrics', { error: error.message });
      return {
        totalEvents: 0,
        successfulAuth: 0,
        failedAuth: 0,
        permissionDenials: 0,
        rateLimitHits: 0,
        uniqueUsers: 0,
        topEvents: [],
        topUsers: []
      };
    }
  }

  private getTopEvents(logs: SecurityAuditLog[]): Array<{ event: string; count: number }> {
    const eventCounts = logs.reduce((acc, log) => {
      acc[log.event] = (acc[log.event] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(eventCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));
  }

  private getTopUsers(logs: SecurityAuditLog[]): Array<{ userId: string; count: number }> {
    const userCounts = logs
      .filter(log => log.userId)
      .reduce((acc, log) => {
        acc[log.userId!] = (acc[log.userId!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    return Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      
      if (this.config.mtls.enabled) {
        const certExists = fs.existsSync(this.config.mtls.certPath);
        const keyExists = fs.existsSync(this.config.mtls.keyPath);
        const caExists = fs.existsSync(this.config.mtls.caPath);
        
        if (!certExists || !keyExists || !caExists) {
          logger.error('mTLS certificates missing', {
            certExists,
            keyExists,
            caExists
          });
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logger.error('SecurityManager health check failed', { error: error.message });
      return false;
    }
  }
}

// Default security configuration
export const defaultSecurityConfig: SecurityConfig = {
  mtls: {
    enabled: process.env.NODE_ENV === 'production',
    certPath: process.env.MTLS_CERT_PATH || './certs/server.crt',
    keyPath: process.env.MTLS_KEY_PATH || './certs/server.key',
    caPath: process.env.MTLS_CA_PATH || './certs/ca.crt',
    requireClientCert: true
  },
  rbac: {
    enabled: true,
    roles: {
      'fe-orchestrator': {
        permissions: ['*'],
        queues: ['*'],
        resources: ['*']
      },
      'fe-manager': {
        permissions: ['queue:read', 'queue:write', 'metrics:read'],
        queues: ['fe-draft', 'fe-logic', 'fe-style', 'fe-a11y', 'fe-test', 'fe-typefix', 'fe-report'],
        resources: ['jobs', 'metrics']
      },
      'fe-agent': {
        permissions: ['queue:read', 'queue:write'],
        queues: ['fe-draft', 'fe-logic', 'fe-style', 'fe-a11y', 'fe-test', 'fe-typefix', 'fe-report'],
        resources: ['jobs']
      },
      'dashboard': {
        permissions: ['metrics:read', 'queue:read'],
        queues: ['*'],
        resources: ['metrics', 'jobs']
      }
    }
  },
  redis: {
    aclEnabled: process.env.REDIS_ACL_ENABLED === 'true',
    username: process.env.REDIS_USERNAME || 'fe-orchestrator',
    password: process.env.REDIS_PASSWORD || 'secure-password'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: '24h',
    issuer: 'fe-manager'
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    skipSuccessfulRequests: false
  }
};

export { SecurityManager };