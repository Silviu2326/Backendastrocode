/**
 * Example I18n Plugin for Frontend Agents System
 * This plugin demonstrates how to add internationalization support
 * without modifying the core system.
 */

class I18nPlugin {
  constructor() {
    this.name = 'i18n-plugin';
    this.version = '1.0.0';
    this.description = 'Adds internationalization support to generated components';
    this.enabled = true;
    this.config = {
      defaultLocale: 'en',
      supportedLocales: ['en', 'es', 'fr', 'de'],
      translationKeys: new Map(),
    };
  }

  async initialize(context) {
    console.log(`[${this.name}] Initializing I18n plugin...`);
    
    // Load existing translation keys
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      for (const locale of this.config.supportedLocales) {
        const translationFile = path.join(context.projectRoot, 'src', 'locales', `${locale}.json`);
        try {
          const content = await fs.readFile(translationFile, 'utf8');
          const translations = JSON.parse(content);
          this.config.translationKeys.set(locale, translations);
        } catch (error) {
          // File doesn't exist, create empty translations
          this.config.translationKeys.set(locale, {});
        }
      }
      
      console.log(`[${this.name}] Loaded translations for ${this.config.supportedLocales.length} locales`);
    } catch (error) {
      console.warn(`[${this.name}] Failed to load translations:`, error.message);
    }
  }

  async onEnqueue(context) {
    const { jobId, queueName, data } = context;
    
    console.log(`[${this.name}] Job enqueued: ${jobId} in ${queueName}`);
    
    // Extract text content from user stories for translation
    if (data.userStory) {
      const textContent = this.extractTextContent(data.userStory);
      if (textContent.length > 0) {
        console.log(`[${this.name}] Found ${textContent.length} text items for translation`);
        
        // Generate translation keys
        for (const text of textContent) {
          const key = this.generateTranslationKey(text);
          
          // Add to all supported locales
          for (const locale of this.config.supportedLocales) {
            const translations = this.config.translationKeys.get(locale) || {};
            if (!translations[key]) {
              translations[key] = locale === this.config.defaultLocale ? text : `[${locale.toUpperCase()}] ${text}`;
            }
            this.config.translationKeys.set(locale, translations);
          }
        }
      }
    }
  }

  async onComplete(context) {
    const { jobId, queueName, result } = context;
    
    console.log(`[${this.name}] Job completed: ${jobId} in ${queueName}`);
    
    // If this is a component generation job, add i18n imports and usage
    if (queueName === 'fe-draft' && result.generatedFiles) {
      for (const file of result.generatedFiles) {
        if (file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) {
          file.content = this.addI18nToComponent(file.content);
          console.log(`[${this.name}] Added i18n support to ${file.path}`);
        }
      }
    }
    
    // Save updated translations
    await this.saveTranslations(context);
  }

  async onError(context) {
    const { jobId, error } = context;
    console.error(`[${this.name}] Job ${jobId} failed:`, error.message);
  }

  async onStart(context) {
    const { jobId, queueName } = context;
    console.log(`[${this.name}] Job started: ${jobId} in ${queueName}`);
  }

  async onProgress(context) {
    const { jobId, progress, message } = context;
    console.log(`[${this.name}] Job ${jobId} progress: ${progress}% - ${message}`);
  }

  async onCancel(context) {
    const { jobId } = context;
    console.log(`[${this.name}] Job cancelled: ${jobId}`);
  }

  // Helper methods
  extractTextContent(userStory) {
    const textItems = [];
    
    // Extract from title and description
    if (userStory.title) textItems.push(userStory.title);
    if (userStory.description) {
      // Extract button labels, form labels, etc.
      const matches = userStory.description.match(/"([^"]+)"/g);
      if (matches) {
        textItems.push(...matches.map(m => m.slice(1, -1)));
      }
    }
    
    return textItems.filter(item => item.length > 0);
  }

  generateTranslationKey(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  addI18nToComponent(content) {
    // Add useTranslation hook import
    if (!content.includes('useTranslation')) {
      content = content.replace(
        /import React[^;]*;/,
        `import React from 'react';
import { useTranslation } from 'react-i18next';`
      );
    }
    
    // Add hook usage in component
    if (!content.includes('const { t }')) {
      content = content.replace(
        /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*{/,
        `const $1 = (props) => {
  const { t } = useTranslation();`
      );
    }
    
    // Replace hardcoded strings with translation calls
    content = content.replace(
      /"([^"]{3,})"/g,
      (match, text) => {
        const key = this.generateTranslationKey(text);
        return `{t('${key}')}`;
      }
    );
    
    return content;
  }

  async saveTranslations(context) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      for (const [locale, translations] of this.config.translationKeys) {
        const translationFile = path.join(
          context.projectRoot || process.cwd(),
          'src',
          'locales',
          `${locale}.json`
        );
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(translationFile), { recursive: true });
        
        // Save translations
        await fs.writeFile(
          translationFile,
          JSON.stringify(translations, null, 2),
          'utf8'
        );
      }
      
      console.log(`[${this.name}] Saved translations for ${this.config.supportedLocales.length} locales`);
    } catch (error) {
      console.error(`[${this.name}] Failed to save translations:`, error.message);
    }
  }

  async cleanup() {
    console.log(`[${this.name}] Cleaning up...`);
    this.config.translationKeys.clear();
  }
}

module.exports = I18nPlugin;