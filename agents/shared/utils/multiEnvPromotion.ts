/**
 * Multi-Environment Promotion System
 * Automatic promotion to staging using ArgoCD + labels after fe-report + be-report
 */

import { logger } from './logger';
import { globalSecretManager } from './secretManager';
import yaml from 'js-yaml';

export interface EnvironmentConfig {
  name: string;
  namespace: string;
  cluster: string;
  autoPromote: boolean;
  requiresApproval: boolean;
  promotionRules: PromotionRule[];
  argocdApp: string;
  healthChecks: HealthCheck[];
}

export interface PromotionRule {
  id: string;
  name: string;
  type: 'label' | 'status' | 'test' | 'approval';
  condition: string;
  required: boolean;
  timeout?: number; // minutes
}

export interface HealthCheck {
  name: string;
  type: 'http' | 'tcp' | 'command';
  endpoint?: string;
  command?: string;
  expectedStatus?: number;
  timeout: number;
  retries: number;
}

export interface DeploymentStatus {
  environment: string;
  version: string;
  status: 'pending' | 'deploying' | 'healthy' | 'failed' | 'rollback';
  timestamp: Date;
  promotedFrom?: string;
  healthChecks: HealthCheckResult[];
  argocdSync?: ArgocdSyncStatus;
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'timeout';
  message: string;
  duration: number;
  timestamp: Date;
}

export interface ArgocdSyncStatus {
  phase: string;
  message: string;
  startedAt: Date;
  finishedAt?: Date;
  revision: string;
}

export interface PromotionRequest {
  id: string;
  fromEnvironment: string;
  toEnvironment: string;
  version: string;
  triggeredBy: string;
  reason: string;
  labels: Record<string, string>;
  reports: {
    feReport?: ReportStatus;
    beReport?: ReportStatus;
  };
  status: 'pending' | 'approved' | 'rejected' | 'deploying' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface ReportStatus {
  status: 'pass' | 'fail' | 'pending';
  score: number;
  issues: string[];
  timestamp: Date;
  reportUrl?: string;
}

export class MultiEnvPromotionManager {
  private argocdToken: string = '';
  private argocdUrl: string = '';
  private kubernetesToken: string = '';
  private environments: Map<string, EnvironmentConfig> = new Map();
  private activePromotions: Map<string, PromotionRequest> = new Map();

  constructor(config: {
    argocdUrl?: string;
    environments?: EnvironmentConfig[];
  } = {}) {
    this.argocdUrl = config.argocdUrl || process.env.ARGOCD_URL || '';
    
    // Initialize default environments
    this.initializeDefaultEnvironments();
    
    // Add custom environments
    if (config.environments) {
      config.environments.forEach(env => {
        this.environments.set(env.name, env);
      });
    }
  }

  /**
   * Initialize with secrets from secret manager
   */
  async initialize(): Promise<void> {
    try {
      this.argocdToken = await globalSecretManager.getSecret('ARGOCD_TOKEN');
      this.kubernetesToken = await globalSecretManager.getSecret('KUBERNETES_TOKEN');
      
      logger.info('Multi-env promotion manager initialized with secrets');
    } catch (error) {
      logger.warn('Failed to load secrets for promotion manager', { error });
    }
  }

  /**
   * Start monitoring for promotion triggers
   */
  async startMonitoring(options: {
    pollInterval?: number;
    enableAutoPromotion?: boolean;
  } = {}): Promise<void> {
    const {
      pollInterval = 2 * 60 * 1000, // 2 minutes
      enableAutoPromotion = true
    } = options;

    logger.info('Starting multi-env promotion monitoring', {
      pollInterval,
      enableAutoPromotion
    });

    setInterval(async () => {
      try {
        if (enableAutoPromotion) {
          await this.checkPromotionTriggers();
        }
        await this.updateActivePromotions();
      } catch (error) {
        logger.error('Error in promotion monitoring', { error });
      }
    }, pollInterval);
  }

  /**
   * Check for promotion triggers (labels, reports, etc.)
   */
  async checkPromotionTriggers(): Promise<void> {
    // Check for ready=true labels after reports
    const readyDeployments = await this.findReadyDeployments();
    
    for (const deployment of readyDeployments) {
      const fromEnv = deployment.environment;
      const toEnv = this.getNextEnvironment(fromEnv);
      
      if (toEnv && this.environments.get(toEnv)?.autoPromote) {
        await this.triggerPromotion({
          fromEnvironment: fromEnv,
          toEnvironment: toEnv,
          version: deployment.version,
          triggeredBy: 'auto-promotion',
          reason: 'Ready label detected after successful reports',
          labels: deployment.labels || {}
        });
      }
    }
  }

  /**
   * Find deployments with ready=true label
   */
  async findReadyDeployments(): Promise<Array<{
    environment: string;
    version: string;
    labels: Record<string, string>;
    reports: { feReport?: ReportStatus; beReport?: ReportStatus };
  }>> {
    const readyDeployments = [];
    
    for (const [envName, envConfig] of this.environments) {
      try {
        const deployments = await this.getKubernetesDeployments(envConfig.namespace);
        
        for (const deployment of deployments) {
          const labels = deployment.metadata?.labels || {};
          
          // Check if ready=true and has both reports
          if (labels.ready === 'true') {
            const reports = await this.getDeploymentReports(deployment);
            
            if (this.areReportsReady(reports)) {
              readyDeployments.push({
                environment: envName,
                version: labels.version || deployment.metadata?.name || 'unknown',
                labels,
                reports
              });
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to check deployments in environment', { 
          environment: envName, 
          error 
        });
      }
    }
    
    return readyDeployments;
  }

  /**
   * Check if both fe-report and be-report are ready
   */
  private areReportsReady(reports: {
    feReport?: ReportStatus;
    beReport?: ReportStatus;
  }): boolean {
    return (
      reports.feReport?.status === 'pass' &&
      reports.beReport?.status === 'pass' &&
      reports.feReport.score >= 80 && // Minimum score threshold
      reports.beReport.score >= 80
    );
  }

  /**
   * Get deployment reports from annotations or external service
   */
  private async getDeploymentReports(deployment: any): Promise<{
    feReport?: ReportStatus;
    beReport?: ReportStatus;
  }> {
    const annotations = deployment.metadata?.annotations || {};
    const reports: { feReport?: ReportStatus; beReport?: ReportStatus } = {};
    
    // Check for report annotations
    if (annotations['reports.fe-report.status']) {
      reports.feReport = {
        status: annotations['reports.fe-report.status'] as 'pass' | 'fail' | 'pending',
        score: parseInt(annotations['reports.fe-report.score'] || '0'),
        issues: JSON.parse(annotations['reports.fe-report.issues'] || '[]'),
        timestamp: new Date(annotations['reports.fe-report.timestamp'] || Date.now()),
        reportUrl: annotations['reports.fe-report.url']
      };
    }
    
    if (annotations['reports.be-report.status']) {
      reports.beReport = {
        status: annotations['reports.be-report.status'] as 'pass' | 'fail' | 'pending',
        score: parseInt(annotations['reports.be-report.score'] || '0'),
        issues: JSON.parse(annotations['reports.be-report.issues'] || '[]'),
        timestamp: new Date(annotations['reports.be-report.timestamp'] || Date.now()),
        reportUrl: annotations['reports.be-report.url']
      };
    }
    
    return reports;
  }

  /**
   * Trigger promotion between environments
   */
  async triggerPromotion(request: {
    fromEnvironment: string;
    toEnvironment: string;
    version: string;
    triggeredBy: string;
    reason: string;
    labels: Record<string, string>;
  }): Promise<PromotionRequest> {
    const promotionId = `promotion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const promotion: PromotionRequest = {
      id: promotionId,
      ...request,
      status: 'pending',
      reports: {},
      createdAt: new Date()
    };
    
    this.activePromotions.set(promotionId, promotion);
    
    logger.info('Promotion triggered', {
      promotionId,
      from: request.fromEnvironment,
      to: request.toEnvironment,
      version: request.version,
      triggeredBy: request.triggeredBy
    });
    
    // Check promotion rules
    const toEnvConfig = this.environments.get(request.toEnvironment);
    if (!toEnvConfig) {
      throw new Error(`Environment ${request.toEnvironment} not found`);
    }
    
    // Validate promotion rules
    const rulesValid = await this.validatePromotionRules(promotion, toEnvConfig);
    
    if (rulesValid) {
      if (toEnvConfig.requiresApproval) {
        await this.requestApproval(promotion);
      } else {
        await this.executePromotion(promotion);
      }
    } else {
      promotion.status = 'rejected';
      logger.warn('Promotion rejected due to failed rules', { promotionId });
    }
    
    return promotion;
  }

  /**
   * Validate promotion rules
   */
  private async validatePromotionRules(
    promotion: PromotionRequest,
    envConfig: EnvironmentConfig
  ): Promise<boolean> {
    for (const rule of envConfig.promotionRules) {
      const isValid = await this.validateRule(promotion, rule);
      
      if (!isValid && rule.required) {
        logger.warn('Required promotion rule failed', {
          promotionId: promotion.id,
          rule: rule.name,
          condition: rule.condition
        });
        return false;
      }
    }
    
    return true;
  }

  /**
   * Validate individual promotion rule
   */
  private async validateRule(promotion: PromotionRequest, rule: PromotionRule): Promise<boolean> {
    switch (rule.type) {
      case 'label':
        return this.validateLabelRule(promotion, rule);
      case 'status':
        return this.validateStatusRule(promotion, rule);
      case 'test':
        return await this.validateTestRule(promotion, rule);
      case 'approval':
        return await this.validateApprovalRule(promotion, rule);
      default:
        logger.warn('Unknown rule type', { type: rule.type });
        return false;
    }
  }

  /**
   * Execute promotion to target environment
   */
  private async executePromotion(promotion: PromotionRequest): Promise<void> {
    try {
      promotion.status = 'deploying';
      
      logger.info('Executing promotion', {
        promotionId: promotion.id,
        from: promotion.fromEnvironment,
        to: promotion.toEnvironment
      });
      
      // Update ArgoCD application
      await this.updateArgocdApplication(promotion);
      
      // Wait for deployment to complete
      await this.waitForDeployment(promotion);
      
      // Run health checks
      const healthResults = await this.runHealthChecks(promotion.toEnvironment);
      
      if (healthResults.every(result => result.status === 'pass')) {
        promotion.status = 'completed';
        promotion.completedAt = new Date();
        
        // Update deployment labels
        await this.updateDeploymentLabels(promotion);
        
        logger.info('Promotion completed successfully', {
          promotionId: promotion.id,
          duration: promotion.completedAt.getTime() - promotion.createdAt.getTime()
        });
      } else {
        throw new Error('Health checks failed after deployment');
      }
    } catch (error) {
      promotion.status = 'failed';
      logger.error('Promotion failed', {
        promotionId: promotion.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Consider rollback
      await this.considerRollback(promotion);
    }
  }

  /**
   * Update ArgoCD application for promotion
   */
  private async updateArgocdApplication(promotion: PromotionRequest): Promise<void> {
    const envConfig = this.environments.get(promotion.toEnvironment);
    if (!envConfig) {
      throw new Error(`Environment config not found: ${promotion.toEnvironment}`);
    }
    
    const appName = envConfig.argocdApp;
    const url = `${this.argocdUrl}/api/v1/applications/${appName}`;
    
    // Get current application
    const getResponse = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.argocdToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!getResponse.ok) {
      throw new Error(`Failed to get ArgoCD app: ${getResponse.statusText}`);
    }
    
    const app = await getResponse.json();
    
    // Update target revision/version
    app.spec.source.targetRevision = promotion.version;
    
    // Add promotion labels
    app.metadata.labels = {
      ...app.metadata.labels,
      'promotion.id': promotion.id,
      'promotion.from': promotion.fromEnvironment,
      'promotion.version': promotion.version,
      'promotion.timestamp': new Date().toISOString()
    };
    
    // Update application
    const updateResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.argocdToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(app)
    });
    
    if (!updateResponse.ok) {
      throw new Error(`Failed to update ArgoCD app: ${updateResponse.statusText}`);
    }
    
    // Trigger sync
    await this.syncArgocdApplication(appName);
  }

  /**
   * Sync ArgoCD application
   */
  private async syncArgocdApplication(appName: string): Promise<void> {
    const url = `${this.argocdUrl}/api/v1/applications/${appName}/sync`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.argocdToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prune: true,
        dryRun: false,
        strategy: {
          apply: {
            force: false
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to sync ArgoCD app: ${response.statusText}`);
    }
  }

  /**
   * Wait for deployment to complete
   */
  private async waitForDeployment(promotion: PromotionRequest, timeoutMinutes: number = 10): Promise<void> {
    const envConfig = this.environments.get(promotion.toEnvironment);
    if (!envConfig) return;
    
    const startTime = Date.now();
    const timeout = timeoutMinutes * 60 * 1000;
    
    while (Date.now() - startTime < timeout) {
      try {
        const syncStatus = await this.getArgocdSyncStatus(envConfig.argocdApp);
        
        if (syncStatus.phase === 'Succeeded') {
          logger.info('Deployment completed', {
            promotionId: promotion.id,
            app: envConfig.argocdApp
          });
          return;
        }
        
        if (syncStatus.phase === 'Failed' || syncStatus.phase === 'Error') {
          throw new Error(`Deployment failed: ${syncStatus.message}`);
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
      } catch (error) {
        logger.warn('Error checking deployment status', { error });
      }
    }
    
    throw new Error('Deployment timeout');
  }

  /**
   * Run health checks for environment
   */
  private async runHealthChecks(environment: string): Promise<HealthCheckResult[]> {
    const envConfig = this.environments.get(environment);
    if (!envConfig) {
      throw new Error(`Environment config not found: ${environment}`);
    }
    
    const results: HealthCheckResult[] = [];
    
    for (const healthCheck of envConfig.healthChecks) {
      const startTime = Date.now();
      
      try {
        const result = await this.executeHealthCheck(healthCheck);
        results.push({
          name: healthCheck.name,
          status: result ? 'pass' : 'fail',
          message: result ? 'Health check passed' : 'Health check failed',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      } catch (error) {
        results.push({
          name: healthCheck.name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }
    }
    
    return results;
  }

  /**
   * Execute individual health check
   */
  private async executeHealthCheck(healthCheck: HealthCheck): Promise<boolean> {
    switch (healthCheck.type) {
      case 'http':
        return this.executeHttpHealthCheck(healthCheck);
      case 'tcp':
        return this.executeTcpHealthCheck(healthCheck);
      case 'command':
        return this.executeCommandHealthCheck(healthCheck);
      default:
        throw new Error(`Unknown health check type: ${healthCheck.type}`);
    }
  }

  /**
   * Initialize default environments
   */
  private initializeDefaultEnvironments(): void {
    const defaultEnvironments: EnvironmentConfig[] = [
      {
        name: 'development',
        namespace: 'dev',
        cluster: 'dev-cluster',
        autoPromote: true,
        requiresApproval: false,
        argocdApp: 'app-dev',
        promotionRules: [
          {
            id: 'basic-tests',
            name: 'Basic Tests Pass',
            type: 'test',
            condition: 'unit-tests=pass',
            required: true
          }
        ],
        healthChecks: [
          {
            name: 'API Health',
            type: 'http',
            endpoint: '/health',
            expectedStatus: 200,
            timeout: 30,
            retries: 3
          }
        ]
      },
      {
        name: 'staging',
        namespace: 'staging',
        cluster: 'staging-cluster',
        autoPromote: false,
        requiresApproval: true,
        argocdApp: 'app-staging',
        promotionRules: [
          {
            id: 'reports-ready',
            name: 'FE and BE Reports Ready',
            type: 'label',
            condition: 'ready=true',
            required: true
          },
          {
            id: 'integration-tests',
            name: 'Integration Tests Pass',
            type: 'test',
            condition: 'integration-tests=pass',
            required: true
          }
        ],
        healthChecks: [
          {
            name: 'API Health',
            type: 'http',
            endpoint: '/health',
            expectedStatus: 200,
            timeout: 60,
            retries: 5
          },
          {
            name: 'Database Connection',
            type: 'http',
            endpoint: '/health/db',
            expectedStatus: 200,
            timeout: 30,
            retries: 3
          }
        ]
      },
      {
        name: 'production',
        namespace: 'prod',
        cluster: 'prod-cluster',
        autoPromote: false,
        requiresApproval: true,
        argocdApp: 'app-prod',
        promotionRules: [
          {
            id: 'staging-approval',
            name: 'Staging Approval',
            type: 'approval',
            condition: 'staging-approved=true',
            required: true
          },
          {
            id: 'security-scan',
            name: 'Security Scan Pass',
            type: 'test',
            condition: 'security-scan=pass',
            required: true
          }
        ],
        healthChecks: [
          {
            name: 'API Health',
            type: 'http',
            endpoint: '/health',
            expectedStatus: 200,
            timeout: 60,
            retries: 5
          },
          {
            name: 'Database Connection',
            type: 'http',
            endpoint: '/health/db',
            expectedStatus: 200,
            timeout: 30,
            retries: 3
          },
          {
            name: 'Cache Health',
            type: 'http',
            endpoint: '/health/cache',
            expectedStatus: 200,
            timeout: 30,
            retries: 3
          }
        ]
      }
    ];
    
    defaultEnvironments.forEach(env => {
      this.environments.set(env.name, env);
    });
  }

  // Helper methods
  private getNextEnvironment(currentEnv: string): string | null {
    const envOrder = ['development', 'staging', 'production'];
    const currentIndex = envOrder.indexOf(currentEnv);
    return currentIndex >= 0 && currentIndex < envOrder.length - 1 
      ? envOrder[currentIndex + 1] 
      : null;
  }

  private async getKubernetesDeployments(namespace: string): Promise<any[]> {
    // Implementation would use Kubernetes API
    return [];
  }

  private async updateActivePromotions(): Promise<void> {
    // Update status of active promotions
  }

  private async requestApproval(promotion: PromotionRequest): Promise<void> {
    // Implementation for approval workflow
  }

  private validateLabelRule(promotion: PromotionRequest, rule: PromotionRule): boolean {
    // Implementation for label validation
    return true;
  }

  private validateStatusRule(promotion: PromotionRequest, rule: PromotionRule): boolean {
    // Implementation for status validation
    return true;
  }

  private async validateTestRule(promotion: PromotionRequest, rule: PromotionRule): Promise<boolean> {
    // Implementation for test validation
    return true;
  }

  private async validateApprovalRule(promotion: PromotionRequest, rule: PromotionRule): Promise<boolean> {
    // Implementation for approval validation
    return true;
  }

  private async updateDeploymentLabels(promotion: PromotionRequest): Promise<void> {
    // Implementation for updating deployment labels
  }

  private async considerRollback(promotion: PromotionRequest): Promise<void> {
    // Implementation for rollback logic
  }

  private async getArgocdSyncStatus(appName: string): Promise<ArgocdSyncStatus> {
    // Implementation for getting ArgoCD sync status
    return {
      phase: 'Succeeded',
      message: 'Sync completed',
      startedAt: new Date(),
      revision: 'main'
    };
  }

  private async executeHttpHealthCheck(healthCheck: HealthCheck): Promise<boolean> {
    // Implementation for HTTP health check
    return true;
  }

  private async executeTcpHealthCheck(healthCheck: HealthCheck): Promise<boolean> {
    // Implementation for TCP health check
    return true;
  }

  private async executeCommandHealthCheck(healthCheck: HealthCheck): Promise<boolean> {
    // Implementation for command health check
    return true;
  }
}

// Export singleton instance
export const multiEnvPromotionManager = new MultiEnvPromotionManager();

// Utility functions
export const startPromotionMonitoring = async (options?: {
  pollInterval?: number;
  enableAutoPromotion?: boolean;
}) => {
  await multiEnvPromotionManager.initialize();
  await multiEnvPromotionManager.startMonitoring(options);
};

export const promoteToStaging = async (version: string, fromEnv: string = 'development') => {
  return multiEnvPromotionManager.triggerPromotion({
    fromEnvironment: fromEnv,
    toEnvironment: 'staging',
    version,
    triggeredBy: 'manual',
    reason: 'Manual promotion request',
    labels: { manual: 'true' }
  });
};

export const promoteToProduction = async (version: string) => {
  return multiEnvPromotionManager.triggerPromotion({
    fromEnvironment: 'staging',
    toEnvironment: 'production',
    version,
    triggeredBy: 'manual',
    reason: 'Manual production promotion',
    labels: { manual: 'true', production: 'true' }
  });
};