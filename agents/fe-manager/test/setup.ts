import { jest } from '@jest/globals';

// Configuración global para las pruebas
beforeAll(async () => {
  // Configurar timeouts
  jest.setTimeout(30000);
  
  // Configurar variables de entorno para testing
  process.env.NODE_ENV = 'test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/fe_manager_test';
  process.env.CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
  process.env.LOG_LEVEL = 'error'; // Reducir logs durante testing
});

// Limpiar después de cada test
afterEach(async () => {
  // Limpiar mocks
  jest.clearAllMocks();
});

// Limpiar después de todos los tests
afterAll(async () => {
  // Cerrar conexiones si es necesario
  await new Promise(resolve => setTimeout(resolve, 500));
});

// Mocks globales
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock para Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }));
});

// Mock para Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    story: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    page: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }
  }))
}));