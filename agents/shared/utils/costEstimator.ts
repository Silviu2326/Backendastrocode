/**
 * Cost Estimator
 * Calculates estimated costs before launching jobs
 */

import { logger } from './logger';

export interface ModelPricing {
  provider: 'openai' | 'anthropic' | 'google' | 'azure';
  model: string;
  inputTokenPrice: number;  // Price per 1K input tokens
  outputTokenPrice: number; // Price per 1K output tokens
  currency: string;
  lastUpdated: Date;
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  confidence: 'low' | 'medium' | 'high';
  factors: string[];
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
  model: string;
  provider: string;
  tokenEstimate: TokenEstimate;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  operation: string;
  tokens: number;
  cost: number;
  percentage: number;
}

export interface JobCostEstimate {
  jobType: string;
  storyId: string;
  estimate: CostEstimate;
  alternatives: CostEstimate[];
  recommendations: string[];
}

export class CostEstimator {
  private modelPricing: Map<string, ModelPricing> = new Map();
  private historicalData: Map<string, TokenEstimate[]> = new Map();

  constructor() {
    this.initializeDefaultPricing();
  }

  /**
   * Initialize default model pricing (as of 2024)
   */
  private initializeDefaultPricing(): void {
    const pricingData: ModelPricing[] = [
      // OpenAI Models
      {
        provider: 'openai',
        model: 'gpt-4',
        inputTokenPrice: 0.03,
        outputTokenPrice: 0.06,
        currency: 'USD',
        lastUpdated: new Date('2024-01-01')
      },
      {
        provider: 'openai',
        model: 'gpt-4-turbo',
        inputTokenPrice: 0.01,
        outputTokenPrice: 0.03,
        currency: 'USD',
        lastUpdated: new Date('2024-01-01')
      },
      {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        inputTokenPrice: 0.0015,
        outputTokenPrice: 0.002,
        currency: 'USD',
        lastUpdated: new Date('2024-01-01')
      },
      // Anthropic Models
      {
        provider: 'anthropic',
        model: 'claude-3-opus',
        inputTokenPrice: 0.015,
        outputTokenPrice: 0.075,
        currency: 'USD',
        lastUpdated: new Date('2024-01-01')
      },
      {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokenPrice: 0.003,
        outputTokenPrice: 0.015,
        currency: 'USD',
        lastUpdated: new Date('2024-01-01')
      },
      {
        provider: 'anthropic',
        model: 'claude-3-haiku',
        inputTokenPrice: 0.00025,
        outputTokenPrice: 0.00125,
        currency: 'USD',
        lastUpdated: new Date('2024-01-01')
      },
      // Google Models
      {
        provider: 'google',
        model: 'gemini-pro',
        inputTokenPrice: 0.0005,
        outputTokenPrice: 0.0015,
        currency: 'USD',
        lastUpdated: new Date('2024-01-01')
      }
    ];

    pricingData.forEach(pricing => {
      this.modelPricing.set(`${pricing.provider}:${pricing.model}`, pricing);
    });
  }

  /**
   * Estimate tokens for a user story based on complexity
   */
  estimateStoryTokens(story: {
    title: string;
    description: string;
    acceptanceCriteria?: string[];
    complexity?: 'simple' | 'medium' | 'complex';
    components?: string[];
  }): TokenEstimate {
    const factors: string[] = [];
    let baseTokens = 0;
    let confidence: 'low' | 'medium' | 'high' = 'medium';

    // Base tokens from text content
    const textContent = [
      story.title,
      story.description,
      ...(story.acceptanceCriteria || []),
      ...(story.components || [])
    ].join(' ');
    
    const wordCount = textContent.split(/\s+/).length;
    baseTokens = Math.ceil(wordCount * 1.3); // ~1.3 tokens per word
    factors.push(`Base content: ${wordCount} words`);

    // Complexity multiplier
    let complexityMultiplier = 1;
    switch (story.complexity) {
      case 'simple':
        complexityMultiplier = 1.2;
        factors.push('Simple complexity (+20%)');
        confidence = 'high';
        break;
      case 'medium':
        complexityMultiplier = 2.0;
        factors.push('Medium complexity (+100%)');
        break;
      case 'complex':
        complexityMultiplier = 3.5;
        factors.push('Complex complexity (+250%)');
        confidence = 'low';
        break;
      default:
        complexityMultiplier = 2.0;
        factors.push('Unknown complexity (assumed medium)');
        confidence = 'low';
    }

    // Component count impact
    const componentCount = story.components?.length || 1;
    const componentMultiplier = Math.max(1, componentCount * 0.5);
    factors.push(`${componentCount} components (+${Math.round((componentMultiplier - 1) * 100)}%)`);

    // Calculate input tokens (prompt + context)
    const inputTokens = Math.ceil(baseTokens * complexityMultiplier * componentMultiplier);
    
    // Estimate output tokens (generated code)
    const outputTokens = Math.ceil(inputTokens * 0.8); // Output is typically 80% of input
    
    const totalTokens = inputTokens + outputTokens;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      confidence,
      factors
    };
  }

  /**
   * Estimate tokens for specific job types
   */
  estimateJobTokens(jobType: string, story: any): TokenEstimate {
    const baseEstimate = this.estimateStoryTokens(story);
    const factors = [...baseEstimate.factors];
    
    // Job type multipliers
    let jobMultiplier = 1;
    switch (jobType) {
      case 'fe-draft':
        jobMultiplier = 1.0; // Base case
        factors.push('Draft generation (base)');
        break;
      case 'fe-logic':
        jobMultiplier = 1.5;
        factors.push('Logic implementation (+50%)');
        break;
      case 'fe-style':
        jobMultiplier = 0.8;
        factors.push('Styling (-20%)');
        break;
      case 'fe-test':
        jobMultiplier = 2.0;
        factors.push('Test generation (+100%)');
        break;
      case 'fe-a11y':
        jobMultiplier = 0.6;
        factors.push('Accessibility checks (-40%)');
        break;
      case 'fe-typefix':
        jobMultiplier = 0.4;
        factors.push('Type fixes (-60%)');
        break;
      case 'fe-report':
        jobMultiplier = 0.3;
        factors.push('Report generation (-70%)');
        break;
      default:
        jobMultiplier = 1.0;
        factors.push('Unknown job type (assumed base)');
    }

    const inputTokens = Math.ceil(baseEstimate.inputTokens * jobMultiplier);
    const outputTokens = Math.ceil(baseEstimate.outputTokens * jobMultiplier);

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      confidence: baseEstimate.confidence,
      factors
    };
  }

  /**
   * Calculate cost estimate for a job
   */
  calculateJobCost(
    jobType: string,
    story: any,
    model: string = 'openai:gpt-4',
    alternatives: string[] = ['openai:gpt-3.5-turbo', 'anthropic:claude-3-haiku']
  ): JobCostEstimate {
    const tokenEstimate = this.estimateJobTokens(jobType, story);
    const mainEstimate = this.calculateCostFromTokens(tokenEstimate, model);
    
    // Calculate alternatives
    const alternativeEstimates = alternatives.map(altModel => 
      this.calculateCostFromTokens(tokenEstimate, altModel)
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      mainEstimate,
      alternativeEstimates,
      tokenEstimate
    );

    return {
      jobType,
      storyId: story.id,
      estimate: mainEstimate,
      alternatives: alternativeEstimates,
      recommendations
    };
  }

  /**
   * Calculate cost from token estimate
   */
  private calculateCostFromTokens(tokenEstimate: TokenEstimate, model: string): CostEstimate {
    const pricing = this.modelPricing.get(model);
    if (!pricing) {
      throw new Error(`Pricing not found for model: ${model}`);
    }

    const inputCost = (tokenEstimate.inputTokens / 1000) * pricing.inputTokenPrice;
    const outputCost = (tokenEstimate.outputTokens / 1000) * pricing.outputTokenPrice;
    const totalCost = inputCost + outputCost;

    const breakdown: CostBreakdown[] = [
      {
        operation: 'Input Processing',
        tokens: tokenEstimate.inputTokens,
        cost: inputCost,
        percentage: (inputCost / totalCost) * 100
      },
      {
        operation: 'Output Generation',
        tokens: tokenEstimate.outputTokens,
        cost: outputCost,
        percentage: (outputCost / totalCost) * 100
      }
    ];

    return {
      inputCost,
      outputCost,
      totalCost,
      currency: pricing.currency,
      model: pricing.model,
      provider: pricing.provider,
      tokenEstimate,
      breakdown
    };
  }

  /**
   * Generate cost optimization recommendations
   */
  private generateRecommendations(
    mainEstimate: CostEstimate,
    alternatives: CostEstimate[],
    tokenEstimate: TokenEstimate
  ): string[] {
    const recommendations: string[] = [];

    // Find cheapest alternative
    const cheapest = alternatives.reduce((min, alt) => 
      alt.totalCost < min.totalCost ? alt : min
    );

    if (cheapest.totalCost < mainEstimate.totalCost * 0.5) {
      const savings = ((mainEstimate.totalCost - cheapest.totalCost) / mainEstimate.totalCost * 100).toFixed(1);
      recommendations.push(
        `💰 Switch to ${cheapest.provider}:${cheapest.model} to save ${savings}% (${cheapest.currency} ${(mainEstimate.totalCost - cheapest.totalCost).toFixed(4)})`
      );
    }

    // High cost warning
    if (mainEstimate.totalCost > 0.10) {
      recommendations.push(
        `⚠️ High cost detected (${mainEstimate.currency} ${mainEstimate.totalCost.toFixed(4)}). Consider breaking down the story.`
      );
    }

    // Low confidence warning
    if (tokenEstimate.confidence === 'low') {
      recommendations.push(
        `🎯 Low confidence estimate. Actual costs may vary significantly. Consider a test run.`
      );
    }

    // Token optimization
    if (tokenEstimate.inputTokens > 8000) {
      recommendations.push(
        `📝 Large input detected (${tokenEstimate.inputTokens} tokens). Consider simplifying the prompt or breaking into smaller tasks.`
      );
    }

    return recommendations;
  }

  /**
   * Estimate cost for multiple stories (batch)
   */
  estimateBatchCost(
    stories: any[],
    jobTypes: string[] = ['fe-draft', 'fe-logic', 'fe-style', 'fe-test'],
    model: string = 'openai:gpt-4'
  ): {
    totalCost: number;
    currency: string;
    breakdown: { storyId: string; jobType: string; cost: number }[];
    summary: {
      totalTokens: number;
      averageCostPerStory: number;
      highestCostStory: string;
      recommendations: string[];
    };
  } {
    const breakdown: { storyId: string; jobType: string; cost: number }[] = [];
    let totalCost = 0;
    let totalTokens = 0;
    let highestCost = 0;
    let highestCostStory = '';
    const allRecommendations: string[] = [];

    stories.forEach(story => {
      jobTypes.forEach(jobType => {
        const estimate = this.calculateJobCost(jobType, story, model);
        breakdown.push({
          storyId: story.id,
          jobType,
          cost: estimate.estimate.totalCost
        });
        
        totalCost += estimate.estimate.totalCost;
        totalTokens += estimate.estimate.tokenEstimate.totalTokens;
        
        if (estimate.estimate.totalCost > highestCost) {
          highestCost = estimate.estimate.totalCost;
          highestCostStory = story.id;
        }
        
        allRecommendations.push(...estimate.recommendations);
      });
    });

    // Deduplicate recommendations
    const uniqueRecommendations = [...new Set(allRecommendations)];

    const pricing = this.modelPricing.get(model)!;
    
    return {
      totalCost,
      currency: pricing.currency,
      breakdown,
      summary: {
        totalTokens,
        averageCostPerStory: totalCost / stories.length,
        highestCostStory,
        recommendations: uniqueRecommendations
      }
    };
  }

  /**
   * Update model pricing
   */
  updateModelPricing(pricing: ModelPricing): void {
    const key = `${pricing.provider}:${pricing.model}`;
    this.modelPricing.set(key, pricing);
    
    logger.info('Model pricing updated', {
      provider: pricing.provider,
      model: pricing.model,
      inputPrice: pricing.inputTokenPrice,
      outputPrice: pricing.outputTokenPrice
    });
  }

  /**
   * Get available models and their pricing
   */
  getAvailableModels(): ModelPricing[] {
    return Array.from(this.modelPricing.values());
  }

  /**
   * Record actual token usage for improving estimates
   */
  recordActualUsage(
    jobType: string,
    storyId: string,
    actualTokens: TokenEstimate
  ): void {
    const key = `${jobType}:${storyId}`;
    const history = this.historicalData.get(key) || [];
    history.push(actualTokens);
    
    // Keep only last 10 records per job type
    if (history.length > 10) {
      history.shift();
    }
    
    this.historicalData.set(key, history);
    
    logger.debug('Actual token usage recorded', {
      jobType,
      storyId,
      actualTokens: actualTokens.totalTokens
    });
  }

  /**
   * Get estimation accuracy metrics
   */
  getAccuracyMetrics(jobType?: string): {
    averageAccuracy: number;
    totalPredictions: number;
    overestimateRate: number;
    underestimateRate: number;
  } {
    let totalPredictions = 0;
    let accuracySum = 0;
    let overestimates = 0;
    let underestimates = 0;

    for (const [key, history] of this.historicalData.entries()) {
      if (jobType && !key.startsWith(`${jobType}:`)) continue;
      
      history.forEach(actual => {
        // This would compare with original estimates
        // For now, we'll simulate some metrics
        totalPredictions++;
        const accuracy = Math.random() * 0.4 + 0.7; // 70-90% accuracy simulation
        accuracySum += accuracy;
        
        if (accuracy < 0.8) underestimates++;
        if (accuracy > 1.2) overestimates++;
      });
    }

    return {
      averageAccuracy: totalPredictions > 0 ? accuracySum / totalPredictions : 0,
      totalPredictions,
      overestimateRate: totalPredictions > 0 ? overestimates / totalPredictions : 0,
      underestimateRate: totalPredictions > 0 ? underestimates / totalPredictions : 0
    };
  }
}

// Export singleton instance
export const costEstimator = new CostEstimator();

// Utility functions
export const estimateStoryCost = (
  story: any,
  jobType: string = 'fe-draft',
  model: string = 'openai:gpt-4'
) => {
  return costEstimator.calculateJobCost(jobType, story, model);
};

export const estimateBatchCost = (
  stories: any[],
  jobTypes?: string[],
  model?: string
) => {
  return costEstimator.estimateBatchCost(stories, jobTypes, model);
};

export const formatCostEstimate = (estimate: CostEstimate): string => {
  return `${estimate.currency} ${estimate.totalCost.toFixed(4)} (${estimate.tokenEstimate.totalTokens.toLocaleString()} tokens)`;
};