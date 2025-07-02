import { logger } from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * Dry-run mode system for previewing changes without writing to disk
 * Allows PMs to see changes before spending tokens on style/test phases
 */
export class DryRunMode {
  private changes: Map<string, {
    originalContent: string;
    modifiedContent: string;
    operation: 'create' | 'update' | 'delete';
    timestamp: Date;
    metadata: Record<string, any>;
  }> = new Map();
  
  private enabled: boolean = false;
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || this.generateSessionId();
  }

  /**
   * Enable dry-run mode
   */
  enable(): void {
    this.enabled = true;
    this.changes.clear();
    logger.info('Dry-run mode enabled', { sessionId: this.sessionId });
  }

  /**
   * Disable dry-run mode
   */
  disable(): void {
    this.enabled = false;
    logger.info('Dry-run mode disabled', { 
      sessionId: this.sessionId,
      changesCount: this.changes.size,
    });
  }

  /**
   * Check if dry-run mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `dryrun_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record a file operation (instead of actually performing it)
   */
  async recordFileOperation(
    filePath: string,
    operation: 'create' | 'update' | 'delete',
    newContent?: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!this.enabled) {
      throw new Error('Dry-run mode is not enabled');
    }

    try {
      const absolutePath = path.resolve(filePath);
      let originalContent = '';

      // Get original content if file exists
      if (operation === 'update' || operation === 'delete') {
        try {
          originalContent = await fs.readFile(absolutePath, 'utf-8');
        } catch (error) {
          if (operation === 'update') {
            // File doesn't exist, treat as create
            operation = 'create';
          }
        }
      }

      this.changes.set(absolutePath, {
        originalContent,
        modifiedContent: newContent || '',
        operation,
        timestamp: new Date(),
        metadata: {
          ...metadata,
          sessionId: this.sessionId,
        },
      });

      logger.info('File operation recorded in dry-run', {
        filePath: absolutePath,
        operation,
        sessionId: this.sessionId,
        contentLength: newContent?.length || 0,
      });
    } catch (error) {
      logger.error('Failed to record file operation', {
        filePath,
        operation,
        error: error.message,
        sessionId: this.sessionId,
      });
      throw error;
    }
  }

  /**
   * Get all recorded changes
   */
  getChanges(): Array<{
    filePath: string;
    originalContent: string;
    modifiedContent: string;
    operation: 'create' | 'update' | 'delete';
    timestamp: Date;
    metadata: Record<string, any>;
    diff: string;
    stats: {
      linesAdded: number;
      linesRemoved: number;
      linesModified: number;
    };
  }> {
    const changes: Array<any> = [];

    for (const [filePath, change] of this.changes.entries()) {
      const diff = this.generateDiff(
        change.originalContent,
        change.modifiedContent,
        change.operation
      );
      
      const stats = this.calculateStats(
        change.originalContent,
        change.modifiedContent,
        change.operation
      );

      changes.push({
        filePath,
        ...change,
        diff,
        stats,
      });
    }

    return changes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get changes summary
   */
  getChangesSummary(): {
    sessionId: string;
    totalFiles: number;
    operations: {
      create: number;
      update: number;
      delete: number;
    };
    totalLines: {
      added: number;
      removed: number;
      modified: number;
    };
    fileTypes: Record<string, number>;
    estimatedImpact: 'low' | 'medium' | 'high';
  } {
    const changes = this.getChanges();
    
    const summary = {
      sessionId: this.sessionId,
      totalFiles: changes.length,
      operations: {
        create: 0,
        update: 0,
        delete: 0,
      },
      totalLines: {
        added: 0,
        removed: 0,
        modified: 0,
      },
      fileTypes: {} as Record<string, number>,
      estimatedImpact: 'low' as 'low' | 'medium' | 'high',
    };

    for (const change of changes) {
      // Count operations
      summary.operations[change.operation]++;
      
      // Count lines
      summary.totalLines.added += change.stats.linesAdded;
      summary.totalLines.removed += change.stats.linesRemoved;
      summary.totalLines.modified += change.stats.linesModified;
      
      // Count file types
      const ext = path.extname(change.filePath).toLowerCase();
      summary.fileTypes[ext] = (summary.fileTypes[ext] || 0) + 1;
    }

    // Estimate impact
    const totalChangedLines = summary.totalLines.added + 
                             summary.totalLines.removed + 
                             summary.totalLines.modified;
    
    if (totalChangedLines > 500 || summary.totalFiles > 20) {
      summary.estimatedImpact = 'high';
    } else if (totalChangedLines > 100 || summary.totalFiles > 5) {
      summary.estimatedImpact = 'medium';
    }

    return summary;
  }

  /**
   * Generate diff between original and modified content
   */
  private generateDiff(
    original: string,
    modified: string,
    operation: 'create' | 'update' | 'delete'
  ): string {
    if (operation === 'create') {
      return modified.split('\n')
        .map(line => `+ ${line}`)
        .join('\n');
    }
    
    if (operation === 'delete') {
      return original.split('\n')
        .map(line => `- ${line}`)
        .join('\n');
    }

    // For updates, generate line-by-line diff
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const diff: string[] = [];
    
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i];
      const modifiedLine = modifiedLines[i];
      
      if (originalLine === undefined) {
        // Line added
        diff.push(`+ ${modifiedLine}`);
      } else if (modifiedLine === undefined) {
        // Line removed
        diff.push(`- ${originalLine}`);
      } else if (originalLine !== modifiedLine) {
        // Line modified
        diff.push(`- ${originalLine}`);
        diff.push(`+ ${modifiedLine}`);
      } else {
        // Line unchanged (show context)
        diff.push(`  ${originalLine}`);
      }
    }
    
    return diff.join('\n');
  }

  /**
   * Calculate change statistics
   */
  private calculateStats(
    original: string,
    modified: string,
    operation: 'create' | 'update' | 'delete'
  ): {
    linesAdded: number;
    linesRemoved: number;
    linesModified: number;
  } {
    if (operation === 'create') {
      return {
        linesAdded: modified.split('\n').length,
        linesRemoved: 0,
        linesModified: 0,
      };
    }
    
    if (operation === 'delete') {
      return {
        linesAdded: 0,
        linesRemoved: original.split('\n').length,
        linesModified: 0,
      };
    }

    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    let linesAdded = 0;
    let linesRemoved = 0;
    let linesModified = 0;
    
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i];
      const modifiedLine = modifiedLines[i];
      
      if (originalLine === undefined) {
        linesAdded++;
      } else if (modifiedLine === undefined) {
        linesRemoved++;
      } else if (originalLine !== modifiedLine) {
        linesModified++;
      }
    }
    
    return { linesAdded, linesRemoved, linesModified };
  }

  /**
   * Export changes as JSON
   */
  exportChanges(): string {
    const changes = this.getChanges();
    const summary = this.getChangesSummary();
    
    return JSON.stringify({
      summary,
      changes: changes.map(change => ({
        ...change,
        timestamp: change.timestamp.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(): string {
    const changes = this.getChanges();
    const summary = this.getChangesSummary();
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dry Run Report - ${this.sessionId}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { padding: 20px; border-bottom: 1px solid #eee; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px 8px 0 0; }
        .summary { padding: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #495057; }
        .stat-label { color: #6c757d; margin-top: 5px; }
        .changes { padding: 20px; }
        .change-item { margin-bottom: 20px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; }
        .change-header { padding: 15px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; display: flex; justify-content: space-between; align-items: center; }
        .change-path { font-family: monospace; font-weight: bold; }
        .change-operation { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
        .op-create { background: #d4edda; color: #155724; }
        .op-update { background: #d1ecf1; color: #0c5460; }
        .op-delete { background: #f8d7da; color: #721c24; }
        .change-diff { padding: 15px; background: #f8f9fa; font-family: monospace; font-size: 0.9em; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
        .diff-line { margin: 2px 0; }
        .diff-add { background: #d4edda; color: #155724; }
        .diff-remove { background: #f8d7da; color: #721c24; }
        .diff-context { color: #6c757d; }
        .impact-low { color: #28a745; }
        .impact-medium { color: #ffc107; }
        .impact-high { color: #dc3545; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Dry Run Report</h1>
            <p>Session: ${this.sessionId}</p>
            <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="stat-card">
                <div class="stat-number">${summary.totalFiles}</div>
                <div class="stat-label">Files Changed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${summary.totalLines.added}</div>
                <div class="stat-label">Lines Added</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${summary.totalLines.removed}</div>
                <div class="stat-label">Lines Removed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number impact-${summary.estimatedImpact}">${summary.estimatedImpact.toUpperCase()}</div>
                <div class="stat-label">Estimated Impact</div>
            </div>
        </div>
        
        <div class="changes">
            <h2>File Changes</h2>
            ${changes.map(change => `
                <div class="change-item">
                    <div class="change-header">
                        <span class="change-path">${change.filePath}</span>
                        <span class="change-operation op-${change.operation}">${change.operation.toUpperCase()}</span>
                    </div>
                    <div class="change-diff">${this.formatDiffForHtml(change.diff)}</div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
    
    return html;
  }

  /**
   * Format diff for HTML display
   */
  private formatDiffForHtml(diff: string): string {
    return diff.split('\n')
      .map(line => {
        if (line.startsWith('+ ')) {
          return `<div class="diff-line diff-add">${this.escapeHtml(line)}</div>`;
        } else if (line.startsWith('- ')) {
          return `<div class="diff-line diff-remove">${this.escapeHtml(line)}</div>`;
        } else {
          return `<div class="diff-line diff-context">${this.escapeHtml(line)}</div>`;
        }
      })
      .join('');
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const div = { innerHTML: '' } as any;
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Apply all recorded changes to disk
   */
  async applyChanges(): Promise<{
    success: boolean;
    appliedFiles: string[];
    errors: string[];
  }> {
    if (this.enabled) {
      throw new Error('Cannot apply changes while dry-run mode is enabled');
    }

    const result = {
      success: true,
      appliedFiles: [] as string[],
      errors: [] as string[],
    };

    try {
      for (const [filePath, change] of this.changes.entries()) {
        try {
          switch (change.operation) {
            case 'create':
            case 'update':
              // Ensure directory exists
              await fs.mkdir(path.dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, change.modifiedContent, 'utf-8');
              result.appliedFiles.push(filePath);
              break;
              
            case 'delete':
              await fs.unlink(filePath);
              result.appliedFiles.push(filePath);
              break;
          }
        } catch (error) {
          const errorMsg = `Failed to apply change to ${filePath}: ${error.message}`;
          result.errors.push(errorMsg);
          result.success = false;
        }
      }

      logger.info('Dry-run changes applied', {
        sessionId: this.sessionId,
        appliedFiles: result.appliedFiles.length,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to apply changes: ${error.message}`);
      return result;
    }
  }

  /**
   * Clear all recorded changes
   */
  clear(): void {
    this.changes.clear();
    logger.info('Dry-run changes cleared', { sessionId: this.sessionId });
  }
}

// Export factory function
export function createDryRunMode(sessionId?: string): DryRunMode {
  return new DryRunMode(sessionId);
}

// Export singleton for global use
export const globalDryRun = new DryRunMode();