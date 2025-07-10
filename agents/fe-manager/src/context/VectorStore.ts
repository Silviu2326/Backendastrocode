import { ChromaClient, Collection } from 'chromadb';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../../../shared/utils/logger';
import { StoryMetadata } from '../mapper';

export interface ContextSnippet {
  id: string;
  content: string;
  type: 'story' | 'code';
  metadata: {
    storyId?: string;
    componentName?: string;
    filePath?: string;
    complexity?: string;
    tags?: string[];
    similarity?: number;
  };
}

export interface SimilarityResult {
  snippet: ContextSnippet;
  similarity: number;
  distance: number;
}

class VectorStore {
  private chromaClient: ChromaClient;
  private storyCollection: Collection | null = null;
  private codeCollection: Collection | null = null;
  private prisma: PrismaClient;
  private isInitialized = false;

  constructor() {
    this.chromaClient = new ChromaClient({
      path: process.env.CHROMA_URL || 'http://localhost:8000'
    });
    this.prisma = new PrismaClient();
  }

  async initialize(): Promise<void> {
    try {
      // Create or get collections
      this.storyCollection = await this.chromaClient.getOrCreateCollection({
        name: 'story_embeddings',
        metadata: { description: 'User story embeddings for context retrieval' }
      });

      this.codeCollection = await this.chromaClient.getOrCreateCollection({
        name: 'code_embeddings',
        metadata: { description: 'Generated code embeddings for consistency' }
      });

      this.isInitialized = true;
      logger.info('VectorStore initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize VectorStore', { error: error.message });
      throw error;
    }
  }

  async storeStoryEmbedding(story: StoryMetadata, embedding: number[]): Promise<void> {
    if (!this.isInitialized || !this.storyCollection) {
      throw new Error('VectorStore not initialized');
    }

    try {
      // Store in Chroma
      await this.storyCollection.add({
        ids: [story.id],
        embeddings: [embedding],
        documents: [story.description],
        metadatas: [{
          storyId: story.id,
          title: story.title,
          priority: story.priority,
          complexity: story.complexity,
          tags: story.tags.join(','),
          pageId: story.pageMetadata.id,
          componentName: story.pageMetadata.componentName
        }]
      });

      // Store in Prisma for persistence
      await this.prisma.storyEmbedding.upsert({
        where: { storyId: story.id },
        update: {
          title: story.title,
          description: story.description,
          embedding: embedding,
          tags: story.tags,
          complexity: story.complexity,
          priority: story.priority,
          updatedAt: new Date()
        },
        create: {
          storyId: story.id,
          projectId: story.pageMetadata.id.split('-')[0], // Extract project ID
          pageId: story.pageMetadata.id,
          title: story.title,
          description: story.description,
          embedding: embedding,
          tags: story.tags,
          complexity: story.complexity,
          priority: story.priority
        }
      });

      logger.debug('Story embedding stored', { storyId: story.id });
    } catch (error) {
      logger.error('Failed to store story embedding', { 
        storyId: story.id, 
        error: error.message 
      });
      throw error;
    }
  }

  async storeCodeEmbedding(
    jobRunId: string,
    storyId: string,
    componentName: string,
    filePath: string,
    codeSnippet: string,
    embedding: number[]
  ): Promise<void> {
    if (!this.isInitialized || !this.codeCollection) {
      throw new Error('VectorStore not initialized');
    }

    try {
      const id = `${jobRunId}-${storyId}-${Date.now()}`;

      // Store in Chroma
      await this.codeCollection.add({
        ids: [id],
        embeddings: [embedding],
        documents: [codeSnippet],
        metadatas: [{
          jobRunId,
          storyId,
          componentName,
          filePath,
          language: 'typescript'
        }]
      });

      // Store in Prisma
      await this.prisma.codeEmbedding.create({
        data: {
          jobRunId,
          storyId,
          componentName,
          filePath,
          codeSnippet,
          embedding,
          language: 'typescript'
        }
      });

      logger.debug('Code embedding stored', { storyId, componentName });
    } catch (error) {
      logger.error('Failed to store code embedding', { 
        storyId, 
        componentName, 
        error: error.message 
      });
      throw error;
    }
  }

  async findSimilarStories(
    queryEmbedding: number[],
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<SimilarityResult[]> {
    if (!this.isInitialized || !this.storyCollection) {
      throw new Error('VectorStore not initialized');
    }

    try {
      const results = await this.storyCollection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        include: ['documents', 'metadatas', 'distances']
      });

      const similarities: SimilarityResult[] = [];

      if (results.documents && results.metadatas && results.distances) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const distance = results.distances[0][i];
          const similarity = 1 - distance; // Convert distance to similarity

          if (similarity >= threshold) {
            const metadata = results.metadatas[0][i] as any;
            similarities.push({
              snippet: {
                id: metadata.storyId,
                content: results.documents[0][i] || '',
                type: 'story',
                metadata: {
                  storyId: metadata.storyId,
                  componentName: metadata.componentName,
                  complexity: metadata.complexity,
                  tags: metadata.tags ? metadata.tags.split(',') : [],
                  similarity
                }
              },
              similarity,
              distance
            });
          }
        }
      }

      return similarities.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      logger.error('Failed to find similar stories', { error: error.message });
      return [];
    }
  }

  async findSimilarCode(
    queryEmbedding: number[],
    componentName?: string,
    limit: number = 3
  ): Promise<SimilarityResult[]> {
    if (!this.isInitialized || !this.codeCollection) {
      throw new Error('VectorStore not initialized');
    }

    try {
      const whereClause = componentName ? { componentName } : undefined;

      const results = await this.codeCollection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        where: whereClause,
        include: ['documents', 'metadatas', 'distances']
      });

      const similarities: SimilarityResult[] = [];

      if (results.documents && results.metadatas && results.distances) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const distance = results.distances[0][i];
          const similarity = 1 - distance;
          const metadata = results.metadatas[0][i] as any;

          similarities.push({
            snippet: {
              id: `${metadata.storyId}-${i}`,
              content: results.documents[0][i] || '',
              type: 'code',
              metadata: {
                storyId: metadata.storyId,
                componentName: metadata.componentName,
                filePath: metadata.filePath,
                similarity
              }
            },
            similarity,
            distance
          });
        }
      }

      return similarities.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      logger.error('Failed to find similar code', { error: error.message });
      return [];
    }
  }

  async getContextForStory(storyId: string, queryText: string): Promise<ContextSnippet[]> {
    try {
      // Generate embedding for the query (this would typically use an embedding service)
      const queryEmbedding = await this.generateEmbedding(queryText);

      // Find similar stories and code
      const [similarStories, similarCode] = await Promise.all([
        this.findSimilarStories(queryEmbedding, 3, 0.6),
        this.findSimilarCode(queryEmbedding, undefined, 2)
      ]);

      const context: ContextSnippet[] = [];
      
      // Add similar stories
      similarStories.forEach(result => {
        if (result.snippet.metadata.storyId !== storyId) {
          context.push(result.snippet);
        }
      });

      // Add similar code
      similarCode.forEach(result => {
        context.push(result.snippet);
      });

      return context;
    } catch (error) {
      logger.error('Failed to get context for story', { storyId, error: error.message });
      return [];
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // This is a placeholder - in a real implementation, you would use
    // an embedding service like OpenAI's text-embedding-ada-002
    // For now, return a dummy embedding
    return new Array(1536).fill(0).map(() => Math.random());
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) return false;
      
      // Test Chroma connection
      await this.chromaClient.heartbeat();
      
      // Test Prisma connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      return true;
    } catch (error) {
      logger.error('VectorStore health check failed', { error: error.message });
      return false;
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    this.isInitialized = false;
    logger.info('VectorStore closed');
  }
}

export const vectorStore = new VectorStore();