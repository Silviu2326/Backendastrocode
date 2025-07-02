import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@shared/utils/logger';
import type { StaticScanJobData } from '@shared/types/queues';

const execAsync = promisify(exec);

interface ScanResult {
  success: boolean;
  issues: ScanIssue[];
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    securityIssues: number;
  };
  recommendations: string[];
  fixPatches: FixPatch[];
}

interface ScanIssue {
  tool: 'eslint' | 'typescript' | 'npm-audit' | 'depcheck';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'quality' | 'performance' | 'maintainability' | 'dependency';
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  message: string;
  description?: string;
  fixable: boolean;
}

interface FixPatch {
  file: string;
  changes: {
    line: number;
    oldCode: string;
    newCode: string;
  }[];
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

class StaticScanner {
  private processedCount = 0;
  private errorCount = 0;

  async performScan(data: StaticScanJobData): Promise<ScanResult> {
    try {
      logger.info('Starting static code analysis', {
        projectId: data.project.id,
        projectPath: data.projectPath,
        scanTypes: data.scanTypes
      });

      const issues: ScanIssue[] = [];
      const recommendations: string[] = [];
      const fixPatches: FixPatch[] = [];

      // Run each scan type
      for (const scanType of data.scanTypes) {
        try {
          const scanIssues = await this.runScan(scanType, data);
          issues.push(...scanIssues);
        } catch (error) {
          logger.warn(`Failed to run ${scanType} scan`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Generate fix patches for fixable issues
      for (const issue of issues.filter(i => i.fixable)) {
        const patch = await this.generateFixPatch(issue, data);
        if (patch) {
          fixPatches.push(patch);
        }
      }

      // Generate recommendations
      recommendations.push(...this.generateRecommendations(issues, data));

      const summary = this.generateSummary(issues);
      const success = summary.criticalIssues === 0 && summary.securityIssues === 0;

      this.processedCount++;
      
      logger.info('Static scan completed', {
        projectId: data.project.id,
        success,
        totalIssues: summary.totalIssues,
        criticalIssues: summary.criticalIssues,
        securityIssues: summary.securityIssues,
        fixPatches: fixPatches.length
      });

      return {
        success,
        issues,
        summary,
        recommendations,
        fixPatches
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Error performing static scan', {
        projectId: data.project.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async runScan(scanType: string, data: StaticScanJobData): Promise<ScanIssue[]> {
    switch (scanType) {
      case 'eslint':
        return await this.runESLintScan(data);
      case 'typescript':
        return await this.runTypeScriptScan(data);
      case 'npm-audit':
        return await this.runNpmAuditScan(data);
      case 'depcheck':
        return await this.runDepCheckScan(data);
      default:
        logger.warn(`Unknown scan type: ${scanType}`);
        return [];
    }
  }

  private async runESLintScan(data: StaticScanJobData): Promise<ScanIssue[]> {
    try {
      const eslintConfig = await this.getESLintConfig(data.projectPath);
      const command = `npx eslint ${data.projectPath} --format json --ext .js,.ts,.jsx,.tsx`;
      
      const { stdout } = await execAsync(command, {
        cwd: data.projectPath,
        timeout: 60000 // 1 minute timeout
      });

      const eslintResults = JSON.parse(stdout);
      const issues: ScanIssue[] = [];

      for (const result of eslintResults) {
        for (const message of result.messages) {
          issues.push({
            tool: 'eslint',
            severity: this.mapESLintSeverity(message.severity),
            category: this.categorizeESLintRule(message.ruleId),
            file: result.filePath,
            line: message.line,
            column: message.column,
            rule: message.ruleId,
            message: message.message,
            fixable: message.fix !== undefined
          });
        }
      }

      return issues;
    } catch (error) {
      logger.error('ESLint scan failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  private async runTypeScriptScan(data: StaticScanJobData): Promise<ScanIssue[]> {
    try {
      const command = 'npx tsc --noEmit --pretty false';
      
      const { stderr } = await execAsync(command, {
        cwd: data.projectPath,
        timeout: 120000 // 2 minutes timeout
      });

      const issues: ScanIssue[] = [];
      const lines = stderr.split('\n').filter(line => line.trim());

      for (const line of lines) {
        const match = line.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/);
        if (match) {
          const [, file, lineNum, column, severity, code, message] = match;
          
          issues.push({
            tool: 'typescript',
            severity: severity === 'error' ? 'high' : 'medium',
            category: 'quality',
            file: path.resolve(data.projectPath, file),
            line: parseInt(lineNum),
            column: parseInt(column),
            rule: `TS${code}`,
            message,
            fixable: this.isTypeScriptErrorFixable(code)
          });
        }
      }

      return issues;
    } catch (error) {
      // TypeScript errors are expected, parse them from stderr
      if (error instanceof Error && 'stderr' in error) {
        return this.parseTypeScriptErrors(error.stderr as string, data.projectPath);
      }
      return [];
    }
  }

  private async runNpmAuditScan(data: StaticScanJobData): Promise<ScanIssue[]> {
    try {
      const command = 'npm audit --json';
      
      const { stdout } = await execAsync(command, {
        cwd: data.projectPath,
        timeout: 60000
      });

      const auditResult = JSON.parse(stdout);
      const issues: ScanIssue[] = [];

      if (auditResult.vulnerabilities) {
        for (const [packageName, vulnerability] of Object.entries(auditResult.vulnerabilities)) {
          const vuln = vulnerability as any;
          
          issues.push({
            tool: 'npm-audit',
            severity: this.mapAuditSeverity(vuln.severity),
            category: 'security',
            message: `${packageName}: ${vuln.title}`,
            description: vuln.url,
            fixable: vuln.fixAvailable !== false
          });
        }
      }

      return issues;
    } catch (error) {
      logger.error('npm audit scan failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  private async runDepCheckScan(data: StaticScanJobData): Promise<ScanIssue[]> {
    try {
      const command = 'npx depcheck --json';
      
      const { stdout } = await execAsync(command, {
        cwd: data.projectPath,
        timeout: 60000
      });

      const depcheckResult = JSON.parse(stdout);
      const issues: ScanIssue[] = [];

      // Unused dependencies
      for (const dep of depcheckResult.dependencies || []) {
        issues.push({
          tool: 'depcheck',
          severity: 'low',
          category: 'dependency',
          message: `Unused dependency: ${dep}`,
          fixable: true
        });
      }

      // Missing dependencies
      for (const [file, deps] of Object.entries(depcheckResult.missing || {})) {
        for (const dep of deps as string[]) {
          issues.push({
            tool: 'depcheck',
            severity: 'medium',
            category: 'dependency',
            file,
            message: `Missing dependency: ${dep}`,
            fixable: true
          });
        }
      }

      return issues;
    } catch (error) {
      logger.error('depcheck scan failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  private async generateFixPatch(issue: ScanIssue, data: StaticScanJobData): Promise<FixPatch | null> {
    try {
      switch (issue.tool) {
        case 'eslint':
          return await this.generateESLintFixPatch(issue, data);
        case 'typescript':
          return await this.generateTypeScriptFixPatch(issue, data);
        case 'depcheck':
          return await this.generateDepCheckFixPatch(issue, data);
        default:
          return null;
      }
    } catch (error) {
      logger.warn('Failed to generate fix patch', {
        tool: issue.tool,
        message: issue.message,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private async generateESLintFixPatch(issue: ScanIssue, data: StaticScanJobData): Promise<FixPatch | null> {
    if (!issue.file || !issue.line) {
      return null;
    }

    // Simple fixes for common ESLint rules
    const fixes: Record<string, { newCode: string; confidence: 'high' | 'medium' | 'low' }> = {
      'no-unused-vars': { newCode: '', confidence: 'high' },
      'no-console': { newCode: '// console.log removed', confidence: 'high' },
      'prefer-const': { newCode: 'const', confidence: 'high' },
      'no-var': { newCode: 'let', confidence: 'high' }
    };

    const fix = fixes[issue.rule || ''];
    if (!fix) {
      return null;
    }

    const fileContent = await fs.readFile(issue.file, 'utf-8');
    const lines = fileContent.split('\n');
    const oldCode = lines[issue.line - 1] || '';

    return {
      file: issue.file,
      changes: [{
        line: issue.line,
        oldCode,
        newCode: fix.newCode
      }],
      description: `Fix ${issue.rule}: ${issue.message}`,
      confidence: fix.confidence
    };
  }

  private async generateTypeScriptFixPatch(issue: ScanIssue, data: StaticScanJobData): Promise<FixPatch | null> {
    // TypeScript fixes are more complex and would require AST manipulation
    // For now, return null - this could be enhanced with ts-morph or similar
    return null;
  }

  private async generateDepCheckFixPatch(issue: ScanIssue, data: StaticScanJobData): Promise<FixPatch | null> {
    const packageJsonPath = path.join(data.projectPath, 'package.json');
    
    if (issue.message.includes('Unused dependency:')) {
      const dep = issue.message.replace('Unused dependency: ', '');
      
      return {
        file: packageJsonPath,
        changes: [{
          line: 0, // Would need to find actual line
          oldCode: `"${dep}": "*",`,
          newCode: ''
        }],
        description: `Remove unused dependency: ${dep}`,
        confidence: 'medium'
      };
    }

    return null;
  }

  private generateRecommendations(issues: ScanIssue[], data: StaticScanJobData): string[] {
    const recommendations: string[] = [];
    const issuesByCategory = this.groupIssuesByCategory(issues);

    if (issuesByCategory.security.length > 0) {
      recommendations.push('Run npm audit fix to address security vulnerabilities');
      recommendations.push('Consider using npm ci instead of npm install in production');
    }

    if (issuesByCategory.dependency.length > 0) {
      recommendations.push('Review and clean up unused dependencies');
      recommendations.push('Add missing dependencies to package.json');
    }

    if (issuesByCategory.quality.length > 5) {
      recommendations.push('Consider enabling stricter TypeScript compiler options');
      recommendations.push('Add pre-commit hooks to catch issues early');
    }

    return recommendations;
  }

  private generateSummary(issues: ScanIssue[]) {
    return {
      totalIssues: issues.length,
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      warningIssues: issues.filter(i => i.severity === 'medium' || i.severity === 'low').length,
      infoIssues: issues.filter(i => i.severity === 'info').length,
      securityIssues: issues.filter(i => i.category === 'security').length
    };
  }

  private groupIssuesByCategory(issues: ScanIssue[]) {
    return {
      security: issues.filter(i => i.category === 'security'),
      quality: issues.filter(i => i.category === 'quality'),
      performance: issues.filter(i => i.category === 'performance'),
      maintainability: issues.filter(i => i.category === 'maintainability'),
      dependency: issues.filter(i => i.category === 'dependency')
    };
  }

  private mapESLintSeverity(severity: number): ScanIssue['severity'] {
    switch (severity) {
      case 2: return 'high';
      case 1: return 'medium';
      default: return 'info';
    }
  }

  private mapAuditSeverity(severity: string): ScanIssue['severity'] {
    switch (severity.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'moderate': return 'medium';
      case 'low': return 'low';
      default: return 'info';
    }
  }

  private categorizeESLintRule(ruleId: string | null): ScanIssue['category'] {
    if (!ruleId) return 'quality';
    
    if (ruleId.includes('security') || ruleId.includes('xss')) {
      return 'security';
    }
    if (ruleId.includes('performance')) {
      return 'performance';
    }
    if (ruleId.includes('complexity') || ruleId.includes('maintainability')) {
      return 'maintainability';
    }
    
    return 'quality';
  }

  private isTypeScriptErrorFixable(code: string): boolean {
    // Some TypeScript errors that can be auto-fixed
    const fixableCodes = ['2304', '2307', '2339', '7006'];
    return fixableCodes.includes(code);
  }

  private parseTypeScriptErrors(stderr: string, projectPath: string): ScanIssue[] {
    const issues: ScanIssue[] = [];
    const lines = stderr.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const match = line.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/);
      if (match) {
        const [, file, lineNum, column, severity, code, message] = match;
        
        issues.push({
          tool: 'typescript',
          severity: severity === 'error' ? 'high' : 'medium',
          category: 'quality',
          file: path.resolve(projectPath, file),
          line: parseInt(lineNum),
          column: parseInt(column),
          rule: `TS${code}`,
          message,
          fixable: this.isTypeScriptErrorFixable(code)
        });
      }
    }

    return issues;
  }

  private async getESLintConfig(projectPath: string): Promise<any> {
    const configFiles = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml'];
    
    for (const configFile of configFiles) {
      try {
        const configPath = path.join(projectPath, configFile);
        await fs.access(configPath);
        return configPath;
      } catch {
        // File doesn't exist, try next
      }
    }
    
    return null;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }
}

export const staticScanner = new StaticScanner();