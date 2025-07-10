/**
 * Preview Deploy System
 * Generates Docker Compose configurations for batch previews
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from './logger';

export interface PreviewDeployConfig {
  batchId: string;
  projectId: string;
  services: PreviewService[];
  environment: 'preview' | 'staging' | 'production';
  domain?: string;
  port?: number;
}

export interface PreviewService {
  name: string;
  image: string;
  tag: string;
  ports: number[];
  environment: Record<string, string>;
  volumes?: string[];
  depends_on?: string[];
}

export class PreviewDeployManager {
  private previewsDir: string;

  constructor(previewsDir: string = './previews') {
    this.previewsDir = previewsDir;
  }

  /**
   * Generate Docker Compose configuration for preview deployment
   */
  async generatePreviewCompose(config: PreviewDeployConfig): Promise<string> {
    const composeConfig = {
      version: '3.8',
      services: this.buildServices(config),
      networks: {
        [`${config.batchId}-network`]: {
          driver: 'bridge'
        }
      },
      volumes: this.buildVolumes(config)
    };

    const yamlContent = this.convertToYaml(composeConfig);
    const filePath = await this.saveComposeFile(config.batchId, yamlContent);
    
    logger.info('Preview compose generated', {
      batchId: config.batchId,
      filePath,
      services: config.services.length
    });

    return filePath;
  }

  /**
   * Build services configuration for Docker Compose
   */
  private buildServices(config: PreviewDeployConfig): Record<string, any> {
    const services: Record<string, any> = {};

    // Add reverse proxy (Traefik)
    services.traefik = {
      image: 'traefik:v2.10',
      command: [
        '--api.insecure=true',
        '--providers.docker=true',
        '--providers.docker.exposedbydefault=false',
        '--entrypoints.web.address=:80'
      ],
      ports: ['80:80', '8080:8080'],
      volumes: ['/var/run/docker.sock:/var/run/docker.sock:ro'],
      networks: [`${config.batchId}-network`]
    };

    // Add application services
    config.services.forEach(service => {
      const serviceConfig: any = {
        image: `${service.image}:${service.tag}`,
        environment: {
          ...service.environment,
          BATCH_ID: config.batchId,
          PREVIEW_MODE: 'true'
        },
        networks: [`${config.batchId}-network`],
        labels: {
          'traefik.enable': 'true',
          [`traefik.http.routers.${service.name}.rule`]: `Host(\`${service.name}-${config.batchId}.preview.local\`)`,
          [`traefik.http.services.${service.name}.loadbalancer.server.port`]: service.ports[0]?.toString() || '3000'
        }
      };

      if (service.volumes) {
        serviceConfig.volumes = service.volumes;
      }

      if (service.depends_on) {
        serviceConfig.depends_on = service.depends_on;
      }

      services[service.name] = serviceConfig;
    });

    return services;
  }

  /**
   * Build volumes configuration
   */
  private buildVolumes(config: PreviewDeployConfig): Record<string, any> {
    return {
      [`${config.batchId}-data`]: {
        driver: 'local'
      },
      [`${config.batchId}-cache`]: {
        driver: 'local'
      }
    };
  }

  /**
   * Convert configuration object to YAML format
   */
  private convertToYaml(config: any): string {
    // Simple YAML converter for Docker Compose
    const yamlLines: string[] = [];
    
    const addToYaml = (obj: any, indent: number = 0) => {
      const spaces = '  '.repeat(indent);
      
      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) {
          yamlLines.push(`${spaces}${key}: null`);
        } else if (typeof value === 'string') {
          yamlLines.push(`${spaces}${key}: "${value}"`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          yamlLines.push(`${spaces}${key}: ${value}`);
        } else if (Array.isArray(value)) {
          yamlLines.push(`${spaces}${key}:`);
          value.forEach(item => {
            if (typeof item === 'string') {
              yamlLines.push(`${spaces}  - "${item}"`);
            } else {
              yamlLines.push(`${spaces}  - ${item}`);
            }
          });
        } else if (typeof value === 'object') {
          yamlLines.push(`${spaces}${key}:`);
          addToYaml(value, indent + 1);
        }
      }
    };

    addToYaml(config);
    return yamlLines.join('\n');
  }

  /**
   * Save Docker Compose file to disk
   */
  private async saveComposeFile(batchId: string, content: string): Promise<string> {
    const batchDir = join(this.previewsDir, batchId);
    await mkdir(batchDir, { recursive: true });
    
    const filePath = join(batchDir, 'docker-compose.preview.yml');
    await writeFile(filePath, content, 'utf8');
    
    return filePath;
  }

  /**
   * Generate deployment script
   */
  async generateDeployScript(config: PreviewDeployConfig): Promise<string> {
    const scriptContent = `#!/bin/bash

# Preview Deploy Script for Batch ${config.batchId}
# Generated automatically - do not edit manually

set -e

BATCH_ID="${config.batchId}"
PROJECT_ID="${config.projectId}"
COMPOSE_FILE="./docker-compose.preview.yml"

echo "🚀 Starting preview deployment for batch $BATCH_ID"

# Pull latest images
echo "📦 Pulling images..."
docker-compose -f $COMPOSE_FILE pull

# Stop existing preview if running
echo "🛑 Stopping existing preview..."
docker-compose -f $COMPOSE_FILE down --remove-orphans || true

# Start preview environment
echo "▶️ Starting preview environment..."
docker-compose -f $COMPOSE_FILE up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Health check
echo "🔍 Running health checks..."
for service in ${config.services.map(s => s.name).join(' ')}; do
  echo "Checking $service..."
  docker-compose -f $COMPOSE_FILE exec -T $service curl -f http://localhost:${config.port || 3000}/health || echo "Warning: $service health check failed"
done

echo "✅ Preview deployment completed!"
echo "🌐 Access your preview at:"
${config.services.map(s => `echo "   - ${s.name}: http://${s.name}-${config.batchId}.preview.local"`).join('\n')}
echo ""
echo "📊 View logs: docker-compose -f $COMPOSE_FILE logs -f"
echo "🛑 Stop preview: docker-compose -f $COMPOSE_FILE down"
`;

    const scriptPath = join(this.previewsDir, config.batchId, 'deploy.sh');
    await writeFile(scriptPath, scriptContent, 'utf8');
    
    // Make script executable (on Unix systems)
    try {
      const { exec } = require('child_process');
      exec(`chmod +x ${scriptPath}`);
    } catch (error) {
      // Ignore on Windows
    }

    return scriptPath;
  }

  /**
   * Get preview URL for a service
   */
  getPreviewUrl(batchId: string, serviceName: string, domain: string = 'preview.local'): string {
    return `http://${serviceName}-${batchId}.${domain}`;
  }

  /**
   * List active previews
   */
  async listActivePreviews(): Promise<string[]> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('docker ps --format "table {{.Names}}" | grep preview');
      return stdout.split('\n').filter(line => line.trim());
    } catch (error) {
      logger.warn('Failed to list active previews', { error });
      return [];
    }
  }

  /**
   * Cleanup old previews
   */
  async cleanupOldPreviews(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Remove containers older than maxAge
      const cutoffDate = new Date(Date.now() - maxAge).toISOString();
      await execAsync(`docker container prune -f --filter "until=${cutoffDate}"`);
      
      // Remove unused images
      await execAsync('docker image prune -f');
      
      logger.info('Preview cleanup completed', { maxAge });
    } catch (error) {
      logger.error('Preview cleanup failed', { error });
    }
  }
}

// Export singleton instance
export const previewDeployManager = new PreviewDeployManager();

// Export utility functions
export const createPreviewDeploy = (config: PreviewDeployConfig) => {
  return previewDeployManager.generatePreviewCompose(config);
};

export const deployPreview = async (batchId: string) => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  const scriptPath = join('./previews', batchId, 'deploy.sh');
  const { stdout, stderr } = await execAsync(`bash ${scriptPath}`);
  
  logger.info('Preview deployed', { batchId, stdout, stderr });
  return { stdout, stderr };
};