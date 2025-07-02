import { logger } from './logger';

/**
 * Dependency-based job ordering system
 * Calculates dependency graph and enqueues leaf nodes first
 */
export class DependencyOrdering {
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();
  private nodeMetadata: Map<string, any> = new Map();

  constructor() {
    this.clear();
  }

  /**
   * Add a node to the dependency graph
   */
  addNode(nodeId: string, metadata: any = {}): void {
    if (!this.dependencyGraph.has(nodeId)) {
      this.dependencyGraph.set(nodeId, new Set());
      this.reverseDependencyGraph.set(nodeId, new Set());
      this.nodeMetadata.set(nodeId, metadata);
      
      logger.debug('Node added to dependency graph', {
        nodeId,
        metadata,
      });
    }
  }

  /**
   * Add a dependency relationship
   * @param nodeId The node that depends on something
   * @param dependsOn The node that this node depends on
   */
  addDependency(nodeId: string, dependsOn: string): void {
    // Ensure both nodes exist
    this.addNode(nodeId);
    this.addNode(dependsOn);
    
    // Add forward dependency
    this.dependencyGraph.get(nodeId)!.add(dependsOn);
    
    // Add reverse dependency
    this.reverseDependencyGraph.get(dependsOn)!.add(nodeId);
    
    logger.debug('Dependency added', {
      nodeId,
      dependsOn,
    });
  }

  /**
   * Remove a dependency relationship
   */
  removeDependency(nodeId: string, dependsOn: string): void {
    if (this.dependencyGraph.has(nodeId)) {
      this.dependencyGraph.get(nodeId)!.delete(dependsOn);
    }
    
    if (this.reverseDependencyGraph.has(dependsOn)) {
      this.reverseDependencyGraph.get(dependsOn)!.delete(nodeId);
    }
    
    logger.debug('Dependency removed', {
      nodeId,
      dependsOn,
    });
  }

  /**
   * Remove a node and all its dependencies
   */
  removeNode(nodeId: string): void {
    if (!this.dependencyGraph.has(nodeId)) {
      return;
    }
    
    // Remove all dependencies from this node
    const dependencies = this.dependencyGraph.get(nodeId)!;
    for (const dep of dependencies) {
      this.removeDependency(nodeId, dep);
    }
    
    // Remove all reverse dependencies to this node
    const reverseDeps = this.reverseDependencyGraph.get(nodeId)!;
    for (const revDep of reverseDeps) {
      this.removeDependency(revDep, nodeId);
    }
    
    // Remove the node itself
    this.dependencyGraph.delete(nodeId);
    this.reverseDependencyGraph.delete(nodeId);
    this.nodeMetadata.delete(nodeId);
    
    logger.debug('Node removed from dependency graph', { nodeId });
  }

  /**
   * Get all dependencies of a node
   */
  getDependencies(nodeId: string): string[] {
    return Array.from(this.dependencyGraph.get(nodeId) || []);
  }

  /**
   * Get all nodes that depend on this node
   */
  getDependents(nodeId: string): string[] {
    return Array.from(this.reverseDependencyGraph.get(nodeId) || []);
  }

  /**
   * Check if there are circular dependencies
   */
  detectCycles(): {
    hasCycles: boolean;
    cycles: string[][];
  } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];
    
    const dfs = (nodeId: string, path: string[]): boolean => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        cycles.push(path.slice(cycleStart).concat([nodeId]));
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const dependencies = this.dependencyGraph.get(nodeId) || new Set();
      for (const dep of dependencies) {
        if (dfs(dep, [...path, nodeId])) {
          // Continue to find all cycles, don't return early
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const nodeId of this.dependencyGraph.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }
    
    return {
      hasCycles: cycles.length > 0,
      cycles,
    };
  }

  /**
   * Get topological ordering of nodes (leaf nodes first)
   */
  getTopologicalOrder(): {
    success: boolean;
    order: string[];
    cycles?: string[][];
  } {
    // First check for cycles
    const cycleDetection = this.detectCycles();
    if (cycleDetection.hasCycles) {
      logger.error('Circular dependencies detected', {
        cycles: cycleDetection.cycles,
      });
      return {
        success: false,
        order: [],
        cycles: cycleDetection.cycles,
      };
    }
    
    // Kahn's algorithm for topological sorting
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];
    
    // Initialize in-degree count
    for (const nodeId of this.dependencyGraph.keys()) {
      inDegree.set(nodeId, this.dependencyGraph.get(nodeId)!.size);
    }
    
    // Find all nodes with no dependencies (leaf nodes)
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }
    
    // Process nodes
    while (queue.length > 0) {
      // Sort queue by priority if metadata contains priority
      queue.sort((a, b) => {
        const priorityA = this.nodeMetadata.get(a)?.priority || 0;
        const priorityB = this.nodeMetadata.get(b)?.priority || 0;
        return priorityB - priorityA; // Higher priority first
      });
      
      const nodeId = queue.shift()!;
      result.push(nodeId);
      
      // Reduce in-degree for all dependents
      const dependents = this.reverseDependencyGraph.get(nodeId) || new Set();
      for (const dependent of dependents) {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);
        
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }
    
    // Check if all nodes were processed
    if (result.length !== this.dependencyGraph.size) {
      logger.error('Failed to process all nodes in topological sort', {
        processed: result.length,
        total: this.dependencyGraph.size,
      });
      return {
        success: false,
        order: result,
      };
    }
    
    logger.info('Topological order calculated', {
      nodeCount: result.length,
      order: result,
    });
    
    return {
      success: true,
      order: result,
    };
  }

  /**
   * Get nodes that are ready to be processed (no pending dependencies)
   */
  getReadyNodes(completedNodes: Set<string> = new Set()): string[] {
    const readyNodes: string[] = [];
    
    for (const [nodeId, dependencies] of this.dependencyGraph.entries()) {
      // Skip if already completed
      if (completedNodes.has(nodeId)) {
        continue;
      }
      
      // Check if all dependencies are completed
      const allDependenciesCompleted = Array.from(dependencies)
        .every(dep => completedNodes.has(dep));
      
      if (allDependenciesCompleted) {
        readyNodes.push(nodeId);
      }
    }
    
    // Sort by priority
    readyNodes.sort((a, b) => {
      const priorityA = this.nodeMetadata.get(a)?.priority || 0;
      const priorityB = this.nodeMetadata.get(b)?.priority || 0;
      return priorityB - priorityA;
    });
    
    return readyNodes;
  }

  /**
   * Get dependency levels (nodes at the same level can be processed in parallel)
   */
  getDependencyLevels(): {
    success: boolean;
    levels: string[][];
    cycles?: string[][];
  } {
    const topologicalResult = this.getTopologicalOrder();
    if (!topologicalResult.success) {
      return {
        success: false,
        levels: [],
        cycles: topologicalResult.cycles,
      };
    }
    
    const levels: string[][] = [];
    const nodeLevel = new Map<string, number>();
    
    // Calculate level for each node
    for (const nodeId of topologicalResult.order) {
      const dependencies = this.dependencyGraph.get(nodeId) || new Set();
      
      let maxDepLevel = -1;
      for (const dep of dependencies) {
        const depLevel = nodeLevel.get(dep) || 0;
        maxDepLevel = Math.max(maxDepLevel, depLevel);
      }
      
      const currentLevel = maxDepLevel + 1;
      nodeLevel.set(nodeId, currentLevel);
      
      // Ensure levels array is large enough
      while (levels.length <= currentLevel) {
        levels.push([]);
      }
      
      levels[currentLevel].push(nodeId);
    }
    
    // Sort nodes within each level by priority
    for (const level of levels) {
      level.sort((a, b) => {
        const priorityA = this.nodeMetadata.get(a)?.priority || 0;
        const priorityB = this.nodeMetadata.get(b)?.priority || 0;
        return priorityB - priorityA;
      });
    }
    
    logger.info('Dependency levels calculated', {
      levelCount: levels.length,
      levels: levels.map((level, index) => ({
        level: index,
        nodes: level,
      })),
    });
    
    return {
      success: true,
      levels,
    };
  }

  /**
   * Build dependency graph from story data
   */
  buildFromStories(
    stories: Array<{
      id: string;
      dependencies?: string[];
      priority?: number;
      metadata?: any;
    }>
  ): void {
    this.clear();
    
    // Add all nodes first
    for (const story of stories) {
      this.addNode(story.id, {
        priority: story.priority || 0,
        ...story.metadata,
      });
    }
    
    // Add dependencies
    for (const story of stories) {
      if (story.dependencies) {
        for (const dep of story.dependencies) {
          this.addDependency(story.id, dep);
        }
      }
    }
    
    logger.info('Dependency graph built from stories', {
      storyCount: stories.length,
      nodeCount: this.dependencyGraph.size,
    });
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    leafNodes: string[];
    rootNodes: string[];
    maxDepth: number;
    averageDependencies: number;
  } {
    const nodeCount = this.dependencyGraph.size;
    let edgeCount = 0;
    const leafNodes: string[] = [];
    const rootNodes: string[] = [];
    
    for (const [nodeId, dependencies] of this.dependencyGraph.entries()) {
      edgeCount += dependencies.size;
      
      // Leaf nodes have no dependencies
      if (dependencies.size === 0) {
        leafNodes.push(nodeId);
      }
      
      // Root nodes have no dependents
      const dependents = this.reverseDependencyGraph.get(nodeId) || new Set();
      if (dependents.size === 0) {
        rootNodes.push(nodeId);
      }
    }
    
    // Calculate max depth
    const levels = this.getDependencyLevels();
    const maxDepth = levels.success ? levels.levels.length : 0;
    
    const averageDependencies = nodeCount > 0 ? edgeCount / nodeCount : 0;
    
    return {
      nodeCount,
      edgeCount,
      leafNodes,
      rootNodes,
      maxDepth,
      averageDependencies,
    };
  }

  /**
   * Export graph as DOT format for visualization
   */
  exportToDot(): string {
    const lines = ['digraph DependencyGraph {'];
    lines.push('  rankdir=TB;');
    lines.push('  node [shape=box, style=rounded];');
    
    // Add nodes with metadata
    for (const [nodeId, metadata] of this.nodeMetadata.entries()) {
      const priority = metadata.priority || 0;
      const color = priority > 5 ? 'red' : priority > 2 ? 'orange' : 'lightblue';
      lines.push(`  "${nodeId}" [fillcolor=${color}, style=filled];`);
    }
    
    // Add edges
    for (const [nodeId, dependencies] of this.dependencyGraph.entries()) {
      for (const dep of dependencies) {
        lines.push(`  "${dep}" -> "${nodeId}";`);
      }
    }
    
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Clear the entire graph
   */
  clear(): void {
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();
    this.nodeMetadata.clear();
  }

  /**
   * Clone the current graph
   */
  clone(): DependencyOrdering {
    const cloned = new DependencyOrdering();
    
    // Copy nodes and metadata
    for (const [nodeId, metadata] of this.nodeMetadata.entries()) {
      cloned.addNode(nodeId, { ...metadata });
    }
    
    // Copy dependencies
    for (const [nodeId, dependencies] of this.dependencyGraph.entries()) {
      for (const dep of dependencies) {
        cloned.addDependency(nodeId, dep);
      }
    }
    
    return cloned;
  }
}

// Export factory function
export function createDependencyOrdering(): DependencyOrdering {
  return new DependencyOrdering();
}

// Helper function to create ordering from stories
export function createOrderingFromStories(
  stories: Array<{
    id: string;
    dependencies?: string[];
    priority?: number;
    metadata?: any;
  }>
): DependencyOrdering {
  const ordering = new DependencyOrdering();
  ordering.buildFromStories(stories);
  return ordering;
}