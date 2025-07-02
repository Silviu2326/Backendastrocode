import { logger } from '../../../../shared/utils/logger';
import { UserStory } from '../orchestrator';
import { StoryMetadata } from '../mapper';

export interface PriorityScore {
  storyId: string;
  score: number;
  factors: {
    complexity: number;
    risk: number;
    sprintValue: number;
    dependencies: number;
    businessImpact: number;
  };
  reasoning: string;
}

export interface SprintContext {
  sprintGoals: string[];
  availableHours: number;
  teamVelocity: number;
  riskTolerance: 'low' | 'medium' | 'high';
  businessPriorities: string[];
}

class SmartPrioritizer {
  private complexityWeights = {
    simple: 1,
    medium: 2,
    complex: 4
  };

  private riskFactors = {
    // Technical risk factors
    newTechnology: 1.5,
    apiIntegration: 1.3,
    complexLogic: 1.4,
    stateManagement: 1.2,
    
    // Business risk factors
    criticalPath: 2.0,
    customerFacing: 1.6,
    dataIntegrity: 1.8,
    security: 1.7
  };

  calculatePriorityScore(
    story: UserStory,
    metadata: StoryMetadata,
    sprintContext: SprintContext
  ): PriorityScore {
    const complexity = this.calculateComplexityScore(metadata);
    const risk = this.calculateRiskScore(story, metadata);
    const sprintValue = this.calculateSprintValue(story, metadata, sprintContext);
    const dependencies = this.calculateDependencyScore(metadata);
    const businessImpact = this.calculateBusinessImpact(story, sprintContext);

    // Core formula: (complexity * risk) / sprint_value
    // Modified with dependency and business impact factors
    const baseScore = (complexity * risk) / Math.max(sprintValue, 0.1);
    const adjustedScore = baseScore * (1 + dependencies) * businessImpact;

    const reasoning = this.generateReasoning({
      complexity,
      risk,
      sprintValue,
      dependencies,
      businessImpact
    }, adjustedScore);

    return {
      storyId: story.id,
      score: Math.round(adjustedScore * 100) / 100,
      factors: {
        complexity,
        risk,
        sprintValue,
        dependencies,
        businessImpact
      },
      reasoning
    };
  }

  private calculateComplexityScore(metadata: StoryMetadata): number {
    const baseComplexity = this.complexityWeights[metadata.complexity];
    
    // Adjust based on estimated hours
    let hoursFactor = 1;
    if (metadata.estimatedHours) {
      if (metadata.estimatedHours > 16) hoursFactor = 1.5;
      else if (metadata.estimatedHours > 8) hoursFactor = 1.2;
      else if (metadata.estimatedHours < 2) hoursFactor = 0.8;
    }

    // Adjust based on dependencies count
    const depsFactor = 1 + (metadata.pageMetadata.dependencies.length * 0.1);

    return baseComplexity * hoursFactor * depsFactor;
  }

  private calculateRiskScore(story: UserStory, metadata: StoryMetadata): number {
    let riskScore = 1.0;
    const description = story.description.toLowerCase();
    const tags = metadata.tags.map(tag => tag.toLowerCase());

    // Technical risks
    if (this.containsKeywords(description, ['new', 'experimental', 'prototype'])) {
      riskScore *= this.riskFactors.newTechnology;
    }

    if (this.containsKeywords(description, ['api', 'integration', 'external'])) {
      riskScore *= this.riskFactors.apiIntegration;
    }

    if (this.containsKeywords(description, ['algorithm', 'calculation', 'complex logic'])) {
      riskScore *= this.riskFactors.complexLogic;
    }

    if (this.containsKeywords(description, ['state', 'redux', 'context', 'global'])) {
      riskScore *= this.riskFactors.stateManagement;
    }

    // Business risks
    if (tags.includes('critical') || story.priority === 'high') {
      riskScore *= this.riskFactors.criticalPath;
    }

    if (this.containsKeywords(description, ['user interface', 'customer', 'public'])) {
      riskScore *= this.riskFactors.customerFacing;
    }

    if (this.containsKeywords(description, ['data', 'database', 'persistence'])) {
      riskScore *= this.riskFactors.dataIntegrity;
    }

    if (this.containsKeywords(description, ['auth', 'security', 'permission', 'access'])) {
      riskScore *= this.riskFactors.security;
    }

    return Math.min(riskScore, 5.0); // Cap at 5x
  }

  private calculateSprintValue(
    story: UserStory,
    metadata: StoryMetadata,
    sprintContext: SprintContext
  ): number {
    let value = 1.0;

    // Alignment with sprint goals
    const goalAlignment = this.calculateGoalAlignment(
      story.description + ' ' + metadata.tags.join(' '),
      sprintContext.sprintGoals
    );
    value *= (1 + goalAlignment);

    // Business priority alignment
    const businessAlignment = this.calculateBusinessAlignment(
      story.description + ' ' + metadata.tags.join(' '),
      sprintContext.businessPriorities
    );
    value *= (1 + businessAlignment);

    // User story priority
    const priorityMultiplier = {
      high: 1.5,
      medium: 1.0,
      low: 0.7
    };
    value *= priorityMultiplier[story.priority];

    // Time efficiency (stories that fit well in available time)
    if (metadata.estimatedHours && sprintContext.availableHours > 0) {
      const timeEfficiency = Math.min(
        metadata.estimatedHours / sprintContext.availableHours,
        1.0
      );
      value *= (0.5 + timeEfficiency);
    }

    return Math.max(value, 0.1); // Minimum value to avoid division by zero
  }

  private calculateDependencyScore(metadata: StoryMetadata): number {
    // Higher dependency count increases complexity
    const relatedStoriesCount = metadata.relatedStories.length;
    const dependenciesCount = metadata.pageMetadata.dependencies.length;
    
    return (relatedStoriesCount * 0.1) + (dependenciesCount * 0.05);
  }

  private calculateBusinessImpact(
    story: UserStory,
    sprintContext: SprintContext
  ): number {
    let impact = 1.0;
    const description = story.description.toLowerCase();

    // Revenue impact
    if (this.containsKeywords(description, ['revenue', 'sales', 'conversion', 'payment'])) {
      impact *= 1.8;
    }

    // User experience impact
    if (this.containsKeywords(description, ['ux', 'user experience', 'usability', 'accessibility'])) {
      impact *= 1.4;
    }

    // Performance impact
    if (this.containsKeywords(description, ['performance', 'speed', 'optimization', 'loading'])) {
      impact *= 1.3;
    }

    // Compliance/Security impact
    if (this.containsKeywords(description, ['compliance', 'gdpr', 'security', 'audit'])) {
      impact *= 1.6;
    }

    return impact;
  }

  private calculateGoalAlignment(text: string, goals: string[]): number {
    if (goals.length === 0) return 0;

    let maxAlignment = 0;
    const textLower = text.toLowerCase();

    for (const goal of goals) {
      const goalWords = goal.toLowerCase().split(' ');
      const matchingWords = goalWords.filter(word => 
        textLower.includes(word) && word.length > 3
      );
      const alignment = matchingWords.length / goalWords.length;
      maxAlignment = Math.max(maxAlignment, alignment);
    }

    return maxAlignment;
  }

  private calculateBusinessAlignment(text: string, priorities: string[]): number {
    if (priorities.length === 0) return 0;

    let maxAlignment = 0;
    const textLower = text.toLowerCase();

    for (const priority of priorities) {
      const priorityWords = priority.toLowerCase().split(' ');
      const matchingWords = priorityWords.filter(word => 
        textLower.includes(word) && word.length > 3
      );
      const alignment = matchingWords.length / priorityWords.length;
      maxAlignment = Math.max(maxAlignment, alignment);
    }

    return maxAlignment * 0.5; // Weight business alignment less than sprint goals
  }

  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private generateReasoning(factors: PriorityScore['factors'], finalScore: number): string {
    const reasons: string[] = [];

    if (factors.complexity > 2) {
      reasons.push(`Alta complejidad (${factors.complexity.toFixed(1)})`);
    }

    if (factors.risk > 1.5) {
      reasons.push(`Riesgo elevado (${factors.risk.toFixed(1)}x)`);
    }

    if (factors.sprintValue > 1.5) {
      reasons.push(`Alto valor para el sprint (${factors.sprintValue.toFixed(1)})`);
    }

    if (factors.dependencies > 0.3) {
      reasons.push(`Múltiples dependencias (+${(factors.dependencies * 100).toFixed(0)}%)`);
    }

    if (factors.businessImpact > 1.4) {
      reasons.push(`Alto impacto de negocio (${factors.businessImpact.toFixed(1)}x)`);
    }

    if (reasons.length === 0) {
      reasons.push('Historia estándar sin factores especiales');
    }

    return `Score: ${finalScore} - ${reasons.join(', ')}`;
  }

  // Batch prioritization for multiple stories
  prioritizeStories(
    stories: UserStory[],
    metadataMap: Map<string, StoryMetadata>,
    sprintContext: SprintContext
  ): PriorityScore[] {
    const scores: PriorityScore[] = [];

    for (const story of stories) {
      const metadata = metadataMap.get(story.id);
      if (metadata) {
        const score = this.calculatePriorityScore(story, metadata, sprintContext);
        scores.push(score);
      }
    }

    // Sort by score (higher score = higher priority)
    return scores.sort((a, b) => b.score - a.score);
  }

  // Get recommended batch size based on sprint context
  getRecommendedBatchSize(sprintContext: SprintContext): number {
    const baseSize = Math.floor(sprintContext.availableHours / 8); // Assume 8 hours per story average
    
    // Adjust based on risk tolerance
    const riskMultiplier = {
      low: 0.7,
      medium: 1.0,
      high: 1.3
    };

    return Math.max(1, Math.floor(baseSize * riskMultiplier[sprintContext.riskTolerance]));
  }
}

export const smartPrioritizer = new SmartPrioritizer();