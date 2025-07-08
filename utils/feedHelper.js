const Feed = require('../models/Feed');
const User = require('../models/User');

class FeedHelper {
  /**
   * Crea una entrada en el feed del proyecto
   * @param {Object} feedData - Datos del evento para el feed
   * @returns {Promise<Object>} - Entrada del feed creada
   */
  static async createFeedEntry(feedData) {
    try {
      const {
        projectId,
        userId,
        eventType,
        title,
        description,
        metadata = {},
        priority = 'medium',
        icon = null,
        color = null
      } = feedData;

      // Obtener información del usuario para el actor
      const user = await User.findById(userId).select('name avatar');
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Configurar icono y color basado en el tipo de evento
      const eventConfig = this.getEventConfig(eventType);
      
      const feedEntry = new Feed({
        projectId,
        userId,
        eventType,
        title,
        description,
        actor: {
          name: user.name,
          avatar: user.avatar,
          type: 'user'
        },
        metadata,
        priority,
        icon: icon || eventConfig.icon,
        color: color || eventConfig.color
      });

      const savedEntry = await feedEntry.save();
      console.log(`📝 Feed entry created: ${eventType} for project ${projectId}`);
      
      return savedEntry;
    } catch (error) {
      console.error('❌ Error creating feed entry:', error);
      throw error;
    }
  }

  /**
   * Crea entrada de feed para creación de proyecto
   */
  static async logProjectCreated(projectId, userId, projectName) {
    return this.createFeedEntry({
      projectId,
      userId,
      eventType: 'project_created',
      title: 'Proyecto creado',
      description: `Se ha creado el proyecto "${projectName}"`,
      priority: 'high'
    });
  }

  /**
   * Crea entrada de feed para actualización de proyecto
   */
  static async logProjectUpdated(projectId, userId, changes) {
    const changesList = Object.keys(changes).join(', ');
    return this.createFeedEntry({
      projectId,
      userId,
      eventType: 'project_updated',
      title: 'Proyecto actualizado',
      description: `Se han actualizado los campos: ${changesList}`,
      metadata: { changes },
      priority: 'medium'
    });
  }

  /**
   * Crea entrada de feed para páginas generadas con IA
   */
  static async logPagesGenerated(projectId, userId, pagesCount, aiModel) {
    return this.createFeedEntry({
      projectId,
      userId,
      eventType: 'page_added',
      title: 'Páginas generadas con IA',
      description: `Se han generado ${pagesCount} páginas usando ${aiModel}`,
      metadata: { 
        pagesCount, 
        aiModel,
        generatedByAI: true 
      },
      priority: 'high'
    });
  }

  /**
   * Crea entrada de feed para user story completada
   */
  static async logUserStoryCompleted(projectId, userId, userStoryTitle, pageName) {
    return this.createFeedEntry({
      projectId,
      userId,
      eventType: 'user_story_completed',
      title: 'Historia de usuario completada',
      description: `Se completó "${userStoryTitle}" en la página ${pageName}`,
      metadata: { userStoryTitle, pageName },
      priority: 'medium'
    });
  }

  /**
   * Crea entrada de feed para cambio de estado
   */
  static async logStatusChanged(projectId, userId, previousStatus, newStatus) {
    return this.createFeedEntry({
      projectId,
      userId,
      eventType: 'status_changed',
      title: 'Estado del proyecto actualizado',
      description: `El estado cambió de "${previousStatus}" a "${newStatus}"`,
      metadata: { 
        previousValue: previousStatus, 
        newValue: newStatus 
      },
      priority: 'medium'
    });
  }

  /**
   * Crea entrada de feed para actualización de GitHub URL
   */
  static async logGithubUrlUpdated(projectId, userId, githubUrl) {
    return this.createFeedEntry({
      projectId,
      userId,
      eventType: 'github_commit',
      title: 'Repositorio GitHub conectado',
      description: `Se ha conectado el repositorio: ${githubUrl}`,
      metadata: { githubUrl },
      priority: 'medium'
    });
  }

  /**
   * Obtiene configuración de icono y color para cada tipo de evento
   */
  static getEventConfig(eventType) {
    const configs = {
      'project_created': { icon: 'plus-circle', color: '#10B981' },
      'project_updated': { icon: 'edit', color: '#3B82F6' },
      'page_added': { icon: 'file-plus', color: '#8B5CF6' },
      'page_updated': { icon: 'file-edit', color: '#6366F1' },
      'user_story_created': { icon: 'bookmark', color: '#F59E0B' },
      'user_story_completed': { icon: 'check-circle', color: '#10B981' },
      'github_commit': { icon: 'git-commit', color: '#374151' },
      'github_pr_opened': { icon: 'git-pull-request', color: '#059669' },
      'github_pr_merged': { icon: 'git-merge', color: '#7C3AED' },
      'deployment': { icon: 'rocket', color: '#DC2626' },
      'comment_added': { icon: 'message-circle', color: '#0891B2' },
      'status_changed': { icon: 'activity', color: '#EA580C' },
      'tech_stack_updated': { icon: 'layers', color: '#7C2D12' },
      'auth_config_updated': { icon: 'shield', color: '#BE185D' }
    };
    
    return configs[eventType] || { icon: 'activity', color: '#6B7280' };
  }

  /**
   * Obtiene el feed de un proyecto con filtros
   */
  static async getProjectFeed(projectId, options = {}) {
    return Feed.getProjectFeed(projectId, options);
  }

  /**
   * Limpia entradas antiguas del feed
   */
  static async cleanupOldEntries(retentionDays = 90) {
    return Feed.cleanupOldEntries(retentionDays);
  }
}

module.exports = FeedHelper;