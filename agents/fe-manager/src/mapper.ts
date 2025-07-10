import { logger } from '../../../shared/utils/logger';
import { PrismaClient } from '@prisma/client';
import { VectorStore } from './context/VectorStore';

export interface PageMetadata {
  id: string;
  name: string;
  route: string;
  componentName: string;
  filePath: string;
  dependencies: string[];
  props: Record<string, any>;
  estimatedComplexity?: number;
  relatedComponents?: string[];
}

interface PropertyMetadata {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: any;
}

export interface StoryMetadata {
  id: string;
  title: string;
  description: string;
  priority: number;
  complexity: number;
  tags: string[];
  pageMetadata?: PageMetadata;
  relatedStories: string[];
  contextSnippets?: any[];
  estimatedTokens: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ComponentMetadata {
  id: string;
  name: string;
  type: string;
  props: Record<string, any>;
  dependencies: string[];
  complexity: number;
  estimatedTokens: number;
  codeSnippets?: any[];
  similarComponents?: any[];
}

class FeManagerMapper {
  private prisma: PrismaClient;
  private vectorStore: VectorStore;

  constructor(prisma: PrismaClient, vectorStore: VectorStore) {
    this.prisma = prisma;
    this.vectorStore = vectorStore;
  }
  
  /**
   * Obtiene metadatos de una página específica
   */
  async getPageMetadata(pageId: string): Promise<PageMetadata | null> {
    try {
      // Try to get from cache first
      const cached = await this.getCachedPageMetadata(pageId);
      if (cached) {
        return cached;
      }

      // Fetch from database (assuming we have a pages table)
      const page = await this.prisma.$queryRaw`
        SELECT * FROM pages WHERE id = ${pageId}
      ` as any[];

      if (!page || page.length === 0) {
        logger.warn('Page not found', { pageId });
        return null;
      }

      const pageData = page[0];
      
      // Get related components for complexity estimation
      const relatedComponents = await this.vectorStore.findSimilarCode(
        `page ${pageData.name} ${pageData.description || ''}`,
        5
      );

      const metadata: PageMetadata = {
        id: pageData.id,
        name: pageData.name,
        route: pageData.route,
        componentName: this.generateComponentName(pageData.name),
        filePath: this.generateFilePath(pageData.name),
        dependencies: pageData.dependencies || [],
        props: pageData.props || {},
        estimatedComplexity: this.estimatePageComplexity(pageData, relatedComponents),
        relatedComponents: relatedComponents.map(c => c.id)
      };

      // Cache the result
      await this.cachePageMetadata(pageId, metadata);

      return metadata;
      
    } catch (error) {
      logger.error('Error getting page metadata', {
        pageId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Convierte una historia de usuario en metadatos enriquecidos
   */
  async mapUserStoryToMetadata(userStory: any, context?: any[]): Promise<StoryMetadata> {
    try {
      logger.info('Mapping user story to metadata with enhanced context', { storyId: userStory.id });
      
      const pageMetadata = userStory.pageId ? await this.getPageMetadata(userStory.pageId) : undefined;
      
      // Get context from vector store if not provided
      const contextSnippets = context || await this.vectorStore.getContextForStory(userStory);
      
      // Find related stories using vector similarity
      const relatedStories = await this.findRelatedStoriesWithVector(userStory);
      
      // Calculate enhanced metrics
      const priority = this.calculateEnhancedPriority(userStory, contextSnippets);
      const complexity = this.calculateEnhancedComplexity(userStory, contextSnippets);
      const estimatedTokens = this.estimateTokensForStory(userStory, contextSnippets);
      const riskLevel = this.assessRiskLevel(userStory, contextSnippets);
      
      const metadata: StoryMetadata = {
        id: userStory.id,
        title: userStory.title,
        description: userStory.description,
        priority,
        complexity,
        tags: userStory.tags || [],
        pageMetadata,
        relatedStories: relatedStories.map(s => s.id),
        contextSnippets,
        estimatedTokens,
        riskLevel
      };
      
      // Store the story embedding for future context
      await this.vectorStore.storeStoryEmbedding(
        userStory.id,
        userStory.description,
        metadata
      );
      
      logger.info('Enhanced story metadata generated', { 
        storyId: userStory.id, 
        priority, 
        complexity, 
        estimatedTokens,
        riskLevel
      });
      
      return metadata;
      
    } catch (error) {
      logger.error('Error mapping user story to metadata', {
        storyId: userStory.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Genera nombre de componente React válido
   */
  private generateComponentName(pageName: string): string {
    return pageName
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remover caracteres especiales
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
      .replace(/^[0-9]/, 'Page$&'); // Prefijo si empieza con número
  }

  /**
   * Genera ruta de archivo basada en la ruta de la página
   */
  private generateFilePath(route: string, componentName: string): string {
    const cleanRoute = route.replace(/^\//g, '').replace(/\//g, '-');
    return `src/pages/${cleanRoute || 'home'}/${componentName}.tsx`;
  }

  /**
   * Infiere dependencias basado en la descripción
   */
  private inferDependencies(description: string): string[] {
    const dependencies: string[] = ['react'];
    const lowerDesc = description.toLowerCase();

    // Dependencias comunes basadas en palabras clave
    const dependencyMap = {
      'form': ['react-hook-form', '@hookform/resolvers'],
      'validation': ['zod', 'yup'],
      'router': ['react-router-dom'],
      'state': ['zustand', 'redux'],
      'api': ['axios', 'react-query'],
      'chart': ['recharts', 'chart.js'],
      'date': ['date-fns', 'dayjs'],
      'icon': ['lucide-react', 'react-icons'],
      'animation': ['framer-motion'],
      'table': ['@tanstack/react-table'],
      'modal': ['@radix-ui/react-dialog'],
      'toast': ['react-hot-toast'],
      'dropdown': ['@radix-ui/react-dropdown-menu']
    };

    Object.entries(dependencyMap).forEach(([keyword, deps]) => {
      if (lowerDesc.includes(keyword)) {
        dependencies.push(...deps);
      }
    });

    return [...new Set(dependencies)]; // Remover duplicados
  }

  /**
   * Infiere props del componente basado en las historias de usuario
   */
  private inferProps(userStories: any[]): PropertyMetadata[] {
    const props: PropertyMetadata[] = [];
    const propSet = new Set<string>();

    userStories.forEach(story => {
      const storyProps = this.extractPropsFromStory(story);
      storyProps.forEach(prop => {
        if (!propSet.has(prop.name)) {
          props.push(prop);
          propSet.add(prop.name);
        }
      });
    });

    return props;
  }

  /**
   * Extrae props de una historia específica
   */
  private extractPropsFromStory(story: any): PropertyMetadata[] {
    const props: PropertyMetadata[] = [];
    const description = story.description.toLowerCase();

    // Patrones comunes para identificar props
    const propPatterns = [
      { pattern: /data|information|content/, name: 'data', type: 'any[]', required: true },
      { pattern: /loading|spinner/, name: 'isLoading', type: 'boolean', required: false },
      { pattern: /error|fail/, name: 'error', type: 'string | null', required: false },
      { pattern: /callback|handler|function/, name: 'onAction', type: '() => void', required: false },
      { pattern: /title|heading/, name: 'title', type: 'string', required: true },
      { pattern: /id|identifier/, name: 'id', type: 'string', required: true },
      { pattern: /disabled|readonly/, name: 'disabled', type: 'boolean', required: false },
      { pattern: /visible|show|hide/, name: 'isVisible', type: 'boolean', required: false }
    ];

    propPatterns.forEach(({ pattern, name, type, required }) => {
      if (pattern.test(description)) {
        props.push({
          name,
          type,
          required,
          description: `Inferred from story: ${story.title}`
        });
      }
    });

    return props;
  }

  /**
   * Calcula la complejidad de una historia con contexto mejorado
   */
  private calculateEnhancedComplexity(story: any, contextSnippets: any[]): number {
    const description = story.description.toLowerCase();
    let complexityScore = 0;

    // Factores que aumentan complejidad
    const complexityFactors = [
      /api|backend|server/,
      /validation|form/,
      /state|redux|context/,
      /animation|transition/,
      /chart|graph|visualization/,
      /real.?time|websocket/,
      /authentication|authorization/,
      /file.?upload|download/,
      /search|filter|sort/,
      /pagination|infinite.?scroll/,
      /microservice|async/,
      /integration|complex|advanced/
    ];

    complexityFactors.forEach(factor => {
      if (factor.test(description)) {
        complexityScore++;
      }
    });

    // Analizar contexto de snippets similares
    if (contextSnippets && contextSnippets.length > 0) {
      const avgComplexity = contextSnippets.reduce((acc, snippet) => {
        return acc + (snippet.complexity || 1);
      }, 0) / contextSnippets.length;
      
      complexityScore += Math.floor(avgComplexity);
    }

    // Considerar horas estimadas
    if (story.estimatedHours) {
      if (story.estimatedHours > 8) complexityScore += 3;
      else if (story.estimatedHours > 4) complexityScore += 2;
      else if (story.estimatedHours > 2) complexityScore += 1;
    }

    return Math.max(1, Math.min(complexityScore, 10));
  }

  /**
   * Calcula la prioridad mejorada con contexto
   */
  private calculateEnhancedPriority(story: any, contextSnippets: any[]): number {
    let score = 0;
    
    // Prioridad base del story
    if (story.priority === 'critical') score += 4;
    else if (story.priority === 'high') score += 3;
    else if (story.priority === 'medium') score += 2;
    else score += 1;
    
    // Analizar urgencia en descripción
    const description = story.description.toLowerCase();
    const urgentKeywords = ['urgent', 'critical', 'blocker', 'asap', 'immediately'];
    const lowPriorityKeywords = ['nice to have', 'future', 'enhancement', 'optional'];
    
    urgentKeywords.forEach(keyword => {
      if (description.includes(keyword)) score += 2;
    });
    
    lowPriorityKeywords.forEach(keyword => {
      if (description.includes(keyword)) score -= 1;
    });
    
    // Considerar dependencias del contexto
    if (contextSnippets && contextSnippets.length > 3) {
      score += 1; // Muchas dependencias aumentan prioridad
    }
    
    return Math.max(1, Math.min(score, 10));
  }

  /**
   * Estima tokens necesarios para procesar la historia
   */
  private estimateTokensForStory(story: any, contextSnippets: any[]): number {
    let tokens = 0;
    
    // Tokens base por descripción (aproximadamente 4 caracteres por token)
    tokens += Math.ceil(story.description.length / 4);
    tokens += Math.ceil((story.title || '').length / 4);
    
    // Tokens por contexto
    if (contextSnippets) {
      tokens += contextSnippets.reduce((acc, snippet) => {
        return acc + Math.ceil((snippet.content || '').length / 4);
      }, 0);
    }
    
    // Multiplicador por complejidad
    const complexity = this.calculateEnhancedComplexity(story, contextSnippets);
    if (complexity >= 7) tokens *= 2.5;
    else if (complexity >= 4) tokens *= 1.8;
    else tokens *= 1.2;
    
    // Tokens mínimos y máximos
    return Math.max(100, Math.min(tokens, 8000));
  }

  /**
   * Evalúa el nivel de riesgo de la historia
   */
  private assessRiskLevel(story: any, contextSnippets: any[]): 'low' | 'medium' | 'high' {
    let riskScore = 0;
    
    const description = story.description.toLowerCase();
    const highRiskKeywords = ['migration', 'breaking change', 'refactor', 'security', 'performance', 'database schema'];
    const lowRiskKeywords = ['ui', 'styling', 'text', 'display', 'static'];
    
    highRiskKeywords.forEach(keyword => {
      if (description.includes(keyword)) riskScore += 2;
    });
    
    lowRiskKeywords.forEach(keyword => {
      if (description.includes(keyword)) riskScore -= 1;
    });
    
    // Riesgo por complejidad
    const complexity = this.calculateEnhancedComplexity(story, contextSnippets);
    if (complexity >= 7) riskScore += 2;
    else if (complexity >= 4) riskScore += 1;
    
    // Riesgo por falta de contexto
    if (!contextSnippets || contextSnippets.length === 0) {
      riskScore += 1;
    }
    
    if (riskScore >= 4) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Encuentra historias relacionadas usando vectores
   */
  private async findRelatedStoriesWithVector(story: any): Promise<any[]> {
    try {
      const similarStories = await this.vectorStore.findSimilarStories(
        story.description,
        { limit: 5, threshold: 0.7 }
      );
      
      return similarStories.filter(s => s.id !== story.id);
    } catch (error) {
      logger.error('Error finding related stories with vector', { error: error.message });
      return [];
    }
  }

  /**
   * Extrae tags relevantes de la descripción con análisis mejorado
   */
  private extractTags(description: string): string[] {
    const tags: string[] = [];
    const text = description.toLowerCase();
    
    // Tags de tecnología expandidos
    const techTags = {
      'react': /react|jsx|hooks/,
      'vue': /vue|vuejs|nuxt/,
      'angular': /angular|ng/,
      'typescript': /typescript|ts/,
      'javascript': /javascript|js/,
      'api': /api|rest|graphql|endpoint/,
      'database': /database|db|sql|mongodb|postgres|mysql/,
      'auth': /auth|login|authentication|oauth|jwt/,
      'ui': /ui|interface|design|component/,
      'mobile': /mobile|responsive|tablet/,
      'testing': /test|testing|unit|integration/,
      'performance': /performance|optimization|cache/,
      'security': /security|encryption|validation/,
      'deployment': /deploy|deployment|ci\/cd|docker/,
      'monitoring': /monitoring|logging|analytics/
    };
    
    // Tags de funcionalidad
    const featureTags = {
      'crud': /create|read|update|delete|crud/,
      'search': /search|filter|query/,
      'upload': /upload|file|image/,
      'notification': /notification|alert|email/,
      'payment': /payment|billing|subscription/,
      'chat': /chat|message|communication/,
      'dashboard': /dashboard|analytics|report/,
      'admin': /admin|management|configuration/
    };
    
    // Tags de complejidad
    const complexityTags = {
      'simple': /simple|basic|easy/,
      'complex': /complex|advanced|sophisticated/,
      'integration': /integration|third.?party|external/,
      'migration': /migration|refactor|restructure/
    };
    
    [techTags, featureTags, complexityTags].forEach(tagGroup => {
      Object.entries(tagGroup).forEach(([tag, pattern]) => {
        if (pattern.test(text)) {
          tags.push(tag);
        }
      });
    });
    
    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Encuentra historias relacionadas usando base de datos y vectores
   */
  private async findRelatedStories(story: any, projectId: string): Promise<string[]> {
    try {
      // Combinar búsqueda tradicional con vectorial
      const [dbStories, vectorStories] = await Promise.all([
        this.findRelatedStoriesFromDB(story, projectId),
        this.findRelatedStoriesWithVector(story)
      ]);
      
      // Combinar y deduplicar resultados
      const allRelated = [...dbStories, ...vectorStories.map(s => s.id)];
      return [...new Set(allRelated)].slice(0, 5);
      
    } catch (error) {
      logger.error('Error finding related stories', { error: error.message });
      return [];
    }
  }

  /**
   * Encuentra historias relacionadas desde la base de datos
   */
  private async findRelatedStoriesFromDB(story: any, projectId: string): Promise<string[]> {
    try {
      const stories = await this.prisma.story.findMany({
        where: {
          projectId,
          id: { not: story.id },
          OR: [
            { tags: { hasSome: story.tags || [] } },
            { pageId: story.pageId },
            { 
              description: {
                contains: story.title,
                mode: 'insensitive'
              }
            }
          ]
        },
        select: { id: true },
        take: 3
      });
      
      return stories.map(s => s.id);
    } catch (error) {
      logger.error('Error finding related stories from DB', { error: error.message });
      return [];
    }
  }

  /**
   * Extrae palabras clave relevantes de un texto
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Lista de stop words común
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 
      'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 
      'did', 'man', 'way', 'she', 'use', 'many', 'oil', 'sit', 'word', 'what', 
      'were', 'they', 'when', 'your', 'said', 'there', 'each', 'which', 
      'will', 'other', 'about', 'then', 'them', 'these', 'some', 'would', 
      'make', 'like', 'into', 'more', 'very', 'know', 'just', 'first', 
      'over', 'think', 'also', 'work', 'life', 'only', 'still', 'should', 
      'after', 'being', 'made', 'before', 'here', 'through', 'where', 
      'much', 'back', 'with', 'well', 'that', 'this', 'from', 'have', 'been'
    ]);
    
    return words.filter(word => !stopWords.has(word));
  }

  /**
   * Método de compatibilidad para calcular prioridad legacy
   */
  private calculatePriority(story: any): 'low' | 'medium' | 'high' | 'critical' {
    const numericPriority = this.calculateEnhancedPriority(story, []);
    
    if (numericPriority >= 8) return 'critical';
    if (numericPriority >= 6) return 'high';
    if (numericPriority >= 4) return 'medium';
    return 'low';
  }

  /**
   * Método de compatibilidad para calcular complejidad legacy
   */
  private calculateComplexity(story: any): 'low' | 'medium' | 'high' {
    const numericComplexity = this.calculateEnhancedComplexity(story, []);
    
    if (numericComplexity >= 7) return 'high';
    if (numericComplexity >= 4) return 'medium';
    return 'low';
  }

  /**
   * Método auxiliar para mapeo legacy de historias
   */
  async mapStoryToMetadata(story: any, projectId: string): Promise<StoryMetadata | null> {
    try {
      const pageMetadata = story.pageId ? await this.getPageMetadata(story.pageId) : undefined;
      const relatedStories = await this.findRelatedStories(story, projectId);
      const tags = this.extractTags(story.description);
      
      const metadata: StoryMetadata = {
        id: story._id || story.id,
        title: story.title,
        description: story.description,
        priority: this.calculateEnhancedPriority(story, []),
        complexity: this.calculateEnhancedComplexity(story, []),
        tags,
        pageMetadata,
        relatedStories,
        contextSnippets: [],
        estimatedTokens: this.estimateTokensForStory(story, []),
        riskLevel: this.assessRiskLevel(story, [])
      };
      
      return metadata;
      
    } catch (error) {
      logger.error('Error mapping story to metadata', {
        storyId: story.id,
        error: error.message
      });
      return null;
    }
  }
}

export const mapper = new FeManagerMapper();
export { PageMetadata, StoryMetadata, PropertyMetadata };