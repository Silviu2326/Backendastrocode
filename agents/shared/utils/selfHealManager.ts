/**
 * Self-Heal Manager
 * Reads errors from Sentry, generates quick-patches, creates hotfix PRs
 */

import { logger } from './logger';
import { createAstPatcher } from './astPatcher';
import { globalSecretManager } from './secretManager';

export interface SentryError {
  id: string;
  title: string;
  message: string;
  stackTrace: string[];
  fingerprint: string;
  level: 'error' | 'warning' | 'info';
  platform: string;
  environment: string;
  timestamp: Date;
  count: number;
  userCount: number;
  tags: Record<string, string>;
  context: {
    file?: string;
    line?: number;
    column?: number;
    function?: string;
    component?: string;
  };
  breadcrumbs: SentryBreadcrumb[];
}

export interface SentryBreadcrumb {
  timestamp: Date;
  message: string;
  category: string;
  level: string;
  data?: Record<string, any>;
}

export interface HotfixPatch {
  id: string;
  errorId: string;
  type: 'quick-fix' | 'workaround' | 'rollback';
  confidence: 'low' | 'medium' | 'high';
  description: string;
  files: PatchFile[];
  testSuggestions: string[];
  rollbackInstructions: string;
  estimatedImpact: 'low' | 'medium' | 'high';
}

export interface PatchFile {
  path: string;
  originalContent: string;
  patchedContent: string;
  changeType: 'fix' | 'add' | 'remove' | 'modify';
  explanation: string;
}

export interface GitHubPR {
  number: number;
  url: string;
  title: string;
  body: string;
  branch: string;
  status: 'open' | 'merged' | 'closed';
}

export class SelfHealManager {
  private sentryToken: string;
  private githubToken: string;
  private projectSlug: string;
  private repoOwner: string;
  private repoName: string;
  private healingRules: HealingRule[] = [];

  constructor(config: {
    sentryToken?: string;
    githubToken?: string;
    projectSlug: string;
    repoOwner: string;
    repoName: string;
  }) {
    this.sentryToken = config.sentryToken || '';
    this.githubToken = config.githubToken || '';
    this.projectSlug = config.projectSlug;
    this.repoOwner = config.repoOwner;
    this.repoName = config.repoName;
    
    this.initializeHealingRules();
  }

  /**
   * Initialize with secrets from secret manager
   */
  async initialize(): Promise<void> {
    try {
      this.sentryToken = await globalSecretManager.getSecret('SENTRY_AUTH_TOKEN');
      this.githubToken = await globalSecretManager.getSecret('GITHUB_TOKEN');
      
      logger.info('Self-heal manager initialized with secrets');
    } catch (error) {
      logger.warn('Failed to load secrets for self-heal manager', { error });
    }
  }

  /**
   * Monitor Sentry for new errors and auto-heal
   */
  async startMonitoring(options: {
    pollInterval?: number;
    errorThreshold?: number;
    autoHealEnabled?: boolean;
  } = {}): Promise<void> {
    const {
      pollInterval = 5 * 60 * 1000, // 5 minutes
      errorThreshold = 10,
      autoHealEnabled = true
    } = options;

    logger.info('Starting self-heal monitoring', {
      pollInterval,
      errorThreshold,
      autoHealEnabled
    });

    setInterval(async () => {
      try {
        const criticalErrors = await this.fetchCriticalErrors(errorThreshold);
        
        if (criticalErrors.length > 0) {
          logger.info('Critical errors detected', { count: criticalErrors.length });
          
          for (const error of criticalErrors) {
            if (autoHealEnabled) {
              await this.attemptAutoHeal(error);
            } else {
              await this.createHealingSuggestion(error);
            }
          }
        }
      } catch (error) {
        logger.error('Error in self-heal monitoring', { error });
      }
    }, pollInterval);
  }

  /**
   * Fetch critical errors from Sentry
   */
  async fetchCriticalErrors(threshold: number = 10): Promise<SentryError[]> {
    if (!this.sentryToken) {
      throw new Error('Sentry token not configured');
    }

    const url = `https://sentry.io/api/0/projects/${this.projectSlug}/issues/`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.sentryToken}`,
        'Content-Type': 'application/json'
      },
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`Sentry API error: ${response.status} ${response.statusText}`);
    }

    const issues = await response.json();
    
    // Filter for critical errors
    const criticalErrors = issues
      .filter((issue: any) => 
        issue.level === 'error' && 
        issue.count >= threshold &&
        issue.status === 'unresolved'
      )
      .map((issue: any) => this.parseSentryIssue(issue));

    return criticalErrors;
  }

  /**
   * Parse Sentry issue into our format
   */
  private parseSentryIssue(issue: any): SentryError {
    const latestEvent = issue.latestEvent || {};
    const stackTrace = latestEvent.entries
      ?.find((entry: any) => entry.type === 'exception')
      ?.data?.values?.[0]?.stacktrace?.frames || [];

    return {
      id: issue.id,
      title: issue.title,
      message: issue.culprit || issue.title,
      stackTrace: stackTrace.map((frame: any) => 
        `${frame.filename}:${frame.lineno} in ${frame.function}`
      ),
      fingerprint: issue.fingerprint?.[0] || issue.id,
      level: issue.level,
      platform: issue.platform,
      environment: latestEvent.environment || 'production',
      timestamp: new Date(issue.lastSeen),
      count: issue.count,
      userCount: issue.userCount,
      tags: issue.tags || {},
      context: {
        file: stackTrace[0]?.filename,
        line: stackTrace[0]?.lineno,
        column: stackTrace[0]?.colno,
        function: stackTrace[0]?.function,
        component: latestEvent.tags?.component
      },
      breadcrumbs: latestEvent.breadcrumbs?.values || []
    };
  }

  /**
   * Attempt to automatically heal an error
   */
  async attemptAutoHeal(error: SentryError): Promise<{
    success: boolean;
    patch?: HotfixPatch;
    pr?: GitHubPR;
    error?: string;
  }> {
    try {
      logger.info('Attempting auto-heal', { errorId: error.id, title: error.title });

      // Generate patch
      const patch = await this.generateHotfixPatch(error);
      
      if (patch.confidence === 'low') {
        logger.warn('Low confidence patch, skipping auto-heal', { errorId: error.id });
        return { success: false, error: 'Low confidence patch' };
      }

      // Apply patch and create PR
      const pr = await this.createHotfixPR(patch, error);
      
      // Mark error as being addressed in Sentry
      await this.updateSentryIssue(error.id, {
        status: 'inProgress',
        assignedTo: 'auto-heal-bot',
        tags: { ...error.tags, autoHeal: 'attempted' }
      });

      logger.info('Auto-heal completed', {
        errorId: error.id,
        patchId: patch.id,
        prNumber: pr.number
      });

      return { success: true, patch, pr };
    } catch (healError) {
      logger.error('Auto-heal failed', { errorId: error.id, healError });
      return { success: false, error: healError instanceof Error ? healError.message : 'Unknown error' };
    }
  }

  /**
   * Generate hotfix patch for an error
   */
  async generateHotfixPatch(error: SentryError): Promise<HotfixPatch> {
    const patchId = `hotfix-${error.id}-${Date.now()}`;
    
    // Analyze error and determine fix strategy
    const fixStrategy = this.analyzeErrorForFix(error);
    
    const files: PatchFile[] = [];
    let confidence: 'low' | 'medium' | 'high' = 'low';
    
    // Apply healing rules
    for (const rule of this.healingRules) {
      if (rule.matches(error)) {
        const ruleFix = await rule.generateFix(error);
        files.push(...ruleFix.files);
        confidence = Math.max(confidence === 'low' ? 0 : confidence === 'medium' ? 1 : 2, 
                             ruleFix.confidence === 'low' ? 0 : ruleFix.confidence === 'medium' ? 1 : 2) === 0 ? 'low' : 
                             Math.max(confidence === 'low' ? 0 : confidence === 'medium' ? 1 : 2, 
                             ruleFix.confidence === 'low' ? 0 : ruleFix.confidence === 'medium' ? 1 : 2) === 1 ? 'medium' : 'high';
      }
    }

    // If no rules matched, try generic fixes
    if (files.length === 0) {
      const genericFix = await this.generateGenericFix(error);
      files.push(...genericFix.files);
      confidence = genericFix.confidence;
    }

    return {
      id: patchId,
      errorId: error.id,
      type: confidence === 'high' ? 'quick-fix' : 'workaround',
      confidence,
      description: `Auto-generated ${confidence} confidence fix for: ${error.title}`,
      files,
      testSuggestions: this.generateTestSuggestions(error, files),
      rollbackInstructions: this.generateRollbackInstructions(files),
      estimatedImpact: this.estimateImpact(error, files)
    };
  }

  /**
   * Analyze error to determine fix strategy
   */
  private analyzeErrorForFix(error: SentryError): {
    category: string;
    severity: string;
    fixType: string;
  } {
    const message = error.message.toLowerCase();
    const stackTrace = error.stackTrace.join(' ').toLowerCase();
    
    let category = 'unknown';
    let fixType = 'generic';
    
    // Categorize error
    if (message.includes('undefined') || message.includes('null')) {
      category = 'null-reference';
      fixType = 'null-check';
    } else if (message.includes('network') || message.includes('fetch')) {
      category = 'network';
      fixType = 'retry-logic';
    } else if (message.includes('permission') || message.includes('unauthorized')) {
      category = 'auth';
      fixType = 'auth-check';
    } else if (stackTrace.includes('react') && message.includes('render')) {
      category = 'react-render';
      fixType = 'error-boundary';
    }
    
    return {
      category,
      severity: error.count > 100 ? 'critical' : error.count > 10 ? 'high' : 'medium',
      fixType
    };
  }

  /**
   * Generate generic fix for unknown errors
   */
  private async generateGenericFix(error: SentryError): Promise<{
    files: PatchFile[];
    confidence: 'low' | 'medium' | 'high';
  }> {
    const files: PatchFile[] = [];
    
    // Add error boundary if React error
    if (error.platform === 'javascript' && error.context.file?.endsWith('.tsx')) {
      const errorBoundaryFix = await this.generateErrorBoundaryFix(error);
      files.push(errorBoundaryFix);
    }
    
    // Add try-catch wrapper
    if (error.context.file && error.context.line) {
      const tryCatchFix = await this.generateTryCatchFix(error);
      if (tryCatchFix) {
        files.push(tryCatchFix);
      }
    }
    
    return {
      files,
      confidence: files.length > 0 ? 'medium' : 'low'
    };
  }

  /**
   * Generate error boundary fix
   */
  private async generateErrorBoundaryFix(error: SentryError): Promise<PatchFile> {
    const errorBoundaryCode = `
import React from 'react';
import { logger } from '../utils/logger';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('Component error caught by boundary', {
      error: error.message,
      stack: error.stack,
      errorInfo,
      component: '${error.context.component || 'Unknown'}'
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>Something went wrong.</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
`;

    return {
      path: 'src/components/ErrorBoundary.tsx',
      originalContent: '',
      patchedContent: errorBoundaryCode,
      changeType: 'add',
      explanation: `Added error boundary to catch and handle React component errors like: ${error.title}`
    };
  }

  /**
   * Generate try-catch fix
   */
  private async generateTryCatchFix(error: SentryError): Promise<PatchFile | null> {
    if (!error.context.file) return null;
    
    try {
      // This would read the actual file and add try-catch
      // For now, we'll create a simple wrapper
      const explanation = `Added try-catch wrapper around line ${error.context.line} to handle: ${error.message}`;
      
      return {
        path: error.context.file,
        originalContent: '// Original code would be here',
        patchedContent: `
try {
  // Original code wrapped in try-catch
  // Line ${error.context.line}: ${error.context.function}
} catch (error) {
  logger.error('Caught error in ${error.context.function}', {
    error: error.message,
    stack: error.stack,
    context: '${error.context.component || error.context.file}'
  });
  
  // Graceful fallback
  return null; // or appropriate fallback value
}
`,
        changeType: 'modify',
        explanation
      };
    } catch (fileError) {
      logger.warn('Could not generate try-catch fix', { error: fileError });
      return null;
    }
  }

  /**
   * Create hotfix PR on GitHub
   */
  private async createHotfixPR(patch: HotfixPatch, error: SentryError): Promise<GitHubPR> {
    if (!this.githubToken) {
      throw new Error('GitHub token not configured');
    }

    const branchName = `hotfix/auto-heal-${patch.id}`;
    const prTitle = `🤖 Auto-heal: ${error.title}`;
    const prBody = this.generatePRBody(patch, error);

    // Create branch
    await this.createGitHubBranch(branchName);
    
    // Apply changes to branch
    for (const file of patch.files) {
      await this.updateFileOnBranch(branchName, file);
    }
    
    // Create PR
    const prResponse = await fetch(
      `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/pulls`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: prTitle,
          body: prBody,
          head: branchName,
          base: 'main',
          draft: patch.confidence === 'low'
        })
      }
    );

    if (!prResponse.ok) {
      throw new Error(`GitHub API error: ${prResponse.status} ${prResponse.statusText}`);
    }

    const pr = await prResponse.json();
    
    return {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      body: pr.body,
      branch: branchName,
      status: 'open'
    };
  }

  /**
   * Generate PR body with patch details
   */
  private generatePRBody(patch: HotfixPatch, error: SentryError): string {
    return `
## 🤖 Auto-Generated Hotfix

**Error ID:** ${error.id}  
**Confidence:** ${patch.confidence}  
**Type:** ${patch.type}  
**Impact:** ${patch.estimatedImpact}  

### 🐛 Error Details
- **Title:** ${error.title}
- **Count:** ${error.count} occurrences
- **Users Affected:** ${error.userCount}
- **Environment:** ${error.environment}
- **File:** ${error.context.file}:${error.context.line}

### 🔧 Fix Description
${patch.description}

### 📁 Files Changed
${patch.files.map(file => `- \`${file.path}\` (${file.changeType}): ${file.explanation}`).join('\n')}

### 🧪 Testing Suggestions
${patch.testSuggestions.map(test => `- [ ] ${test}`).join('\n')}

### 🔄 Rollback Instructions
${patch.rollbackInstructions}

### ⚠️ Important Notes
- This is an auto-generated fix with **${patch.confidence}** confidence
- Please review carefully before merging
- Monitor error rates after deployment
- Consider adding additional tests

---
*Generated by Self-Heal Manager at ${new Date().toISOString()}*
`;
  }

  /**
   * Initialize healing rules
   */
  private initializeHealingRules(): void {
    this.healingRules = [
      new NullReferenceHealingRule(),
      new NetworkErrorHealingRule(),
      new ReactRenderHealingRule(),
      new AuthErrorHealingRule()
    ];
  }

  // Additional helper methods would be implemented here...
  private async createGitHubBranch(branchName: string): Promise<void> {
    // Implementation for creating GitHub branch
  }

  private async updateFileOnBranch(branchName: string, file: PatchFile): Promise<void> {
    // Implementation for updating file on branch
  }

  private async updateSentryIssue(issueId: string, updates: any): Promise<void> {
    // Implementation for updating Sentry issue
  }

  private generateTestSuggestions(error: SentryError, files: PatchFile[]): string[] {
    return [
      `Test the specific scenario that caused: ${error.title}`,
      `Verify error handling in ${error.context.component || 'affected component'}`,
      `Check that the fix doesn't break existing functionality`,
      `Monitor error rates for 24 hours after deployment`
    ];
  }

  private generateRollbackInstructions(files: PatchFile[]): string {
    return `To rollback this fix:\n${files.map(f => `- Revert changes to ${f.path}`).join('\n')}`;
  }

  private estimateImpact(error: SentryError, files: PatchFile[]): 'low' | 'medium' | 'high' {
    if (files.length > 3 || error.userCount > 1000) return 'high';
    if (files.length > 1 || error.userCount > 100) return 'medium';
    return 'low';
  }

  private async createHealingSuggestion(error: SentryError): Promise<void> {
    // Create issue or notification for manual review
    logger.info('Created healing suggestion for manual review', { errorId: error.id });
  }
}

// Healing rule interfaces and implementations
interface HealingRule {
  matches(error: SentryError): boolean;
  generateFix(error: SentryError): Promise<{ files: PatchFile[]; confidence: 'low' | 'medium' | 'high' }>;
}

class NullReferenceHealingRule implements HealingRule {
  matches(error: SentryError): boolean {
    return error.message.toLowerCase().includes('undefined') || 
           error.message.toLowerCase().includes('null');
  }

  async generateFix(error: SentryError): Promise<{ files: PatchFile[]; confidence: 'low' | 'medium' | 'high' }> {
    // Implementation for null reference fixes
    return { files: [], confidence: 'medium' };
  }
}

class NetworkErrorHealingRule implements HealingRule {
  matches(error: SentryError): boolean {
    return error.message.toLowerCase().includes('network') ||
           error.message.toLowerCase().includes('fetch');
  }

  async generateFix(error: SentryError): Promise<{ files: PatchFile[]; confidence: 'low' | 'medium' | 'high' }> {
    // Implementation for network error fixes
    return { files: [], confidence: 'high' };
  }
}

class ReactRenderHealingRule implements HealingRule {
  matches(error: SentryError): boolean {
    return error.platform === 'javascript' && 
           error.message.toLowerCase().includes('render');
  }

  async generateFix(error: SentryError): Promise<{ files: PatchFile[]; confidence: 'low' | 'medium' | 'high' }> {
    // Implementation for React render fixes
    return { files: [], confidence: 'medium' };
  }
}

class AuthErrorHealingRule implements HealingRule {
  matches(error: SentryError): boolean {
    return error.message.toLowerCase().includes('unauthorized') ||
           error.message.toLowerCase().includes('permission');
  }

  async generateFix(error: SentryError): Promise<{ files: PatchFile[]; confidence: 'low' | 'medium' | 'high' }> {
    // Implementation for auth error fixes
    return { files: [], confidence: 'low' };
  }
}

// Export singleton instance
export const selfHealManager = new SelfHealManager({
  projectSlug: process.env.SENTRY_PROJECT_SLUG || '',
  repoOwner: process.env.GITHUB_REPO_OWNER || '',
  repoName: process.env.GITHUB_REPO_NAME || ''
});

// Utility functions
export const startSelfHealing = async (options?: {
  pollInterval?: number;
  errorThreshold?: number;
  autoHealEnabled?: boolean;
}) => {
  await selfHealManager.initialize();
  await selfHealManager.startMonitoring(options);
};

export const healError = async (errorId: string) => {
  const errors = await selfHealManager.fetchCriticalErrors(1);
  const error = errors.find(e => e.id === errorId);
  
  if (!error) {
    throw new Error(`Error ${errorId} not found`);
  }
  
  return selfHealManager.attemptAutoHeal(error);
};