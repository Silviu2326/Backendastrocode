import { Job } from 'bullmq';

// Generic JobData interface for type safety
export interface JobData<T = any> {
  data: T;
  id?: string;
  name?: string;
  opts?: any;
}

// Specific job data types for each agent
export interface DraftJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
  };
  component: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    accessibility?: boolean;
    responsive?: boolean;
    seo?: boolean;
    performance?: boolean;
    testing?: boolean;
  };
}

export interface LogicJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
  };
  component: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    accessibility?: boolean;
    responsive?: boolean;
    seo?: boolean;
    performance?: boolean;
    testing?: boolean;
  };
}

export interface StyleJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
  };
  component: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    accessibility?: boolean;
    responsive?: boolean;
    seo?: boolean;
    performance?: boolean;
    testing?: boolean;
  };
}

export interface TestJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
  };
  component: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    accessibility?: boolean;
    responsive?: boolean;
    seo?: boolean;
    performance?: boolean;
    testing?: boolean;
  };
}

export interface A11yJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
  };
  component: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    accessibility?: boolean;
    responsive?: boolean;
    seo?: boolean;
    performance?: boolean;
    testing?: boolean;
  };
}

export interface TypefixJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
  };
  component: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    accessibility?: boolean;
    responsive?: boolean;
    seo?: boolean;
    performance?: boolean;
    testing?: boolean;
  };
}

export interface ReportJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
  };
  component: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte';
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components' | 'emotion';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    accessibility?: boolean;
    responsive?: boolean;
    seo?: boolean;
    performance?: boolean;
    testing?: boolean;
  };
}

export interface ManagerJobData {
  stories?: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
    apiImpact?: boolean;
  }[];
  dependencies?: string[];
  priorities?: {
    queueName: string;
    priority: number;
    delay: number;
    estimatedTokens?: number;
    dependencies?: string[];
  }[];
  metadata?: {
    projectId: string;
    pageId: string;
    pageName: string;
    route: string;
    priority: number;
  };
}

// Backend Job Data Types
export interface BeDraftJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
    apiImpact: true;
    target?: {
      file: string;
      function: string;
      createIfMissing?: boolean;
    };
  };
  api: {
    name: string;
    type: 'controller' | 'service' | 'middleware' | 'model' | 'route';
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
    authentication?: 'jwt' | 'passport' | 'auth0' | 'custom';
  };
  requirements?: {
    validation?: boolean;
    authentication?: boolean;
    authorization?: boolean;
    caching?: boolean;
    rateLimit?: boolean;
    logging?: boolean;
  };
}

export interface BeLogicJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
    apiImpact: true;
    target?: {
      file: string;
      function: string;
      createIfMissing?: boolean;
    };
  };
  api: {
    name: string;
    type: 'controller' | 'service' | 'middleware' | 'model' | 'route';
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
    authentication?: 'jwt' | 'passport' | 'auth0' | 'custom';
  };
  requirements?: {
    businessLogic?: string[];
    dataValidation?: string[];
    errorHandling?: string[];
    security?: string[];
    performance?: string[];
  };
}

export interface BeTestJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
    apiImpact: true;
  };
  api: {
    name: string;
    type: 'controller' | 'service' | 'middleware' | 'model' | 'route';
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
    testingFramework: 'jest' | 'mocha' | 'vitest';
  };
  requirements?: {
    unitTests?: boolean;
    integrationTests?: boolean;
    e2eTests?: boolean;
    coverage?: number;
    mocking?: boolean;
  };
}

export interface BeTypefixJobData {
  userStory: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
    apiImpact: true;
  };
  api: {
    name: string;
    type: 'controller' | 'service' | 'middleware' | 'model' | 'route';
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript?: boolean;
  };
  project: {
    id: string;
    name: string;
    framework: 'express' | 'fastify' | 'koa';
    database: 'mongoose' | 'prisma' | 'sequelize' | 'typeorm';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  requirements?: {
    strictMode?: boolean;
    noImplicitAny?: boolean;
    strictNullChecks?: boolean;
    noUnusedLocals?: boolean;
    noUnusedParameters?: boolean;
  };
}

export interface BeManagerJobData {
  stories?: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'in-progress' | 'review' | 'completed';
    estimatedHours?: number;
    pageId: string;
    projectId: string;
    apiImpact: true;
  }[];
  dependencies?: string[];
  priorities?: {
    queueName: string;
    priority: number;
    delay: number;
    estimatedTokens?: number;
    dependencies?: string[];
  }[];
  metadata?: {
    projectId: string;
    pageId: string;
    pageName: string;
    route: string;
    priority: number;
  };
}

// Static Scan Job Data
export interface StaticScanJobData {
  project: {
    id: string;
    name: string;
    path: string;
    framework: 'react' | 'vue' | 'angular' | 'svelte' | 'express' | 'fastify' | 'koa';
    typescript: boolean;
    packageManager: 'npm' | 'yarn' | 'pnpm';
  };
  scanType: 'full' | 'incremental' | 'targeted';
  checks: {
    eslint?: boolean;
    typescript?: boolean;
    security?: boolean;
    dependencies?: boolean;
    performance?: boolean;
    accessibility?: boolean;
  };
  thresholds?: {
    errorLimit?: number;
    warningLimit?: number;
    securityLevel?: 'low' | 'medium' | 'high';
    coverageThreshold?: number;
  };
  autoFix?: boolean;
  reportFormat?: 'json' | 'html' | 'sarif';
}

// Queue map for type safety and autocompletion
export type QueueMap = {
  'fe-draft': DraftJobData;
  'fe-logic': LogicJobData;
  'fe-style': StyleJobData;
  'fe-test': TestJobData;
  'fe-a11y': A11yJobData;
  'fe-typefix': TypefixJobData;
  'fe-report': ReportJobData;
  'fe-manager': ManagerJobData;
  'be-draft': BeDraftJobData;
  'be-logic': BeLogicJobData;
  'be-test': BeTestJobData;
  'be-typefix': BeTypefixJobData;
  'be-manager': BeManagerJobData;
  'static-scan': StaticScanJobData;
};

// Typed Job interface
export type TypedJob<T extends keyof QueueMap> = Job<QueueMap[T]>;

// Queue timeout configurations
export const QUEUE_TIMEOUTS: Record<keyof QueueMap, number> = {
  'fe-draft': 60 * 1000,      // 60 seconds
  'fe-logic': 120 * 1000,     // 120 seconds
  'fe-style': 90 * 1000,      // 90 seconds
  'fe-test': 180 * 1000,      // 180 seconds
  'fe-a11y': 90 * 1000,       // 90 seconds
  'fe-typefix': 60 * 1000,    // 60 seconds
  'fe-report': 30 * 1000,     // 30 seconds
  'fe-manager': 300 * 1000,   // 300 seconds
  'be-draft': 90 * 1000,      // 90 seconds
  'be-logic': 150 * 1000,     // 150 seconds
  'be-test': 200 * 1000,      // 200 seconds
  'be-typefix': 80 * 1000,    // 80 seconds
  'be-manager': 400 * 1000,   // 400 seconds
  'static-scan': 120 * 1000,  // 120 seconds
};

// Export utility types
export type QueueName = keyof QueueMap;
export type JobDataForQueue<T extends QueueName> = QueueMap[T];