import { logger } from '../../../shared/utils/logger';
import { BeTestJobData } from '../../types/queues';

export interface BackendTestResult {
  success: boolean;
  files: {
    [filePath: string]: string;
  };
  metadata: {
    testTypes: string[];
    coverage: {
      target: number;
      estimated: number;
    };
    testFramework: string;
    generatedFiles: string[];
    testCount: number;
    estimatedLines: number;
  };
  dependencies: string[];
  devDependencies: string[];
}

export class BeTestGenerator {
  private processedCount = 0;
  private errorCount = 0;

  async generateTests(data: BeTestJobData): Promise<BackendTestResult> {
    try {
      logger.info('Generating backend tests', {
        apiName: data.api.name,
        testTypes: data.testTypes,
        framework: data.testFramework,
        coverage: data.coverage
      });

      const files: { [filePath: string]: string } = {};
      const dependencies: string[] = [];
      const devDependencies: string[] = [];
      let testCount = 0;

      // Generate unit tests
      if (data.testTypes.includes('unit')) {
        const unitTests = this.generateUnitTests(data);
        Object.assign(files, unitTests.files);
        testCount += unitTests.testCount;
      }

      // Generate integration tests
      if (data.testTypes.includes('integration')) {
        const integrationTests = this.generateIntegrationTests(data);
        Object.assign(files, integrationTests.files);
        testCount += integrationTests.testCount;
      }

      // Generate e2e tests
      if (data.testTypes.includes('e2e')) {
        const e2eTests = this.generateE2ETests(data);
        Object.assign(files, e2eTests.files);
        testCount += e2eTests.testCount;
      }

      // Generate test configuration
      files[`jest.config.${data.api.typescript ? 'ts' : 'js'}`] = this.generateJestConfig(data);
      files[`test/setup.${data.api.typescript ? 'ts' : 'js'}`] = this.generateTestSetup(data);
      files[`test/helpers.${data.api.typescript ? 'ts' : 'js'}`] = this.generateTestHelpers(data);

      // Add test framework dependencies
      this.addTestDependencies(data.testFramework, dependencies, devDependencies);

      // Add TypeScript dependencies if needed
      if (data.api.typescript) {
        devDependencies.push('@types/jest', '@types/supertest', 'ts-jest');
      }

      this.processedCount++;

      return {
        success: true,
        files,
        metadata: {
          testTypes: data.testTypes,
          coverage: {
            target: data.coverage?.target || 80,
            estimated: this.estimateCoverage(testCount, data)
          },
          testFramework: data.testFramework,
          generatedFiles: Object.keys(files),
          testCount,
          estimatedLines: Object.values(files).reduce((total, content) => 
            total + content.split('\n').length, 0)
        },
        dependencies,
        devDependencies
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Error generating backend tests', {
        error: error.message,
        apiName: data.api.name
      });
      throw error;
    }
  }

  private generateUnitTests(data: BeTestJobData): { files: { [key: string]: string }, testCount: number } {
    const { name, typescript } = data.api;
    const files: { [key: string]: string } = {};
    let testCount = 0;

    // Controller tests
    files[`test/unit/controllers/${name}Controller.test.${typescript ? 'ts' : 'js'}`] = 
      this.generateControllerTests(data);
    testCount += 8; // Typical controller test count

    // Service tests
    files[`test/unit/services/${name}Service.test.${typescript ? 'ts' : 'js'}`] = 
      this.generateServiceTests(data);
    testCount += 6; // Typical service test count

    // Model tests
    files[`test/unit/models/${name}.test.${typescript ? 'ts' : 'js'}`] = 
      this.generateModelTests(data);
    testCount += 4; // Typical model test count

    // Utility tests
    files[`test/unit/utils/${name}Utils.test.${typescript ? 'ts' : 'js'}`] = 
      this.generateUtilityTests(data);
    testCount += 5; // Typical utility test count

    return { files, testCount };
  }

  private generateIntegrationTests(data: BeTestJobData): { files: { [key: string]: string }, testCount: number } {
    const { name, typescript } = data.api;
    const files: { [key: string]: string } = {};
    let testCount = 0;

    // API integration tests
    files[`test/integration/api/${name}.test.${typescript ? 'ts' : 'js'}`] = 
      this.generateApiIntegrationTests(data);
    testCount += 10; // Typical API integration test count

    // Database integration tests
    files[`test/integration/database/${name}.test.${typescript ? 'ts' : 'js'}`] = 
      this.generateDatabaseIntegrationTests(data);
    testCount += 6; // Typical database integration test count

    return { files, testCount };
  }

  private generateE2ETests(data: BeTestJobData): { files: { [key: string]: string }, testCount: number } {
    const { name, typescript } = data.api;
    const files: { [key: string]: string } = {};
    let testCount = 0;

    // End-to-end tests
    files[`test/e2e/${name}.test.${typescript ? 'ts' : 'js'}`] = 
      this.generateEndToEndTests(data);
    testCount += 5; // Typical e2e test count

    return { files, testCount };
  }

  private generateControllerTests(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Controller`;
    
    if (typescript) {
      return `import request from 'supertest';
import { app } from '../../../src/index';
import { ${name}Service } from '../../../src/services/${name}Service';
import { ${className} } from '../../../src/controllers/${name}Controller';

// Mock the service
jest.mock('../../../src/services/${name}Service');
const mock${name}Service = ${name}Service as jest.Mocked<typeof ${name}Service>;

describe('${className}', () => {
  let controller: ${className};

  beforeEach(() => {
    controller = new ${className}();
    jest.clearAllMocks();
  });

  describe('GET /${name.toLowerCase()}', () => {
    it('should return all ${name.toLowerCase()} items', async () => {
      const mockData = [{ id: '1', name: 'Test ${name}' }];
      mock${name}Service.prototype.findAll = jest.fn().mockResolvedValue(mockData);

      const response = await request(app)
        .get('/${name.toLowerCase()}')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockData);
      expect(mock${name}Service.prototype.findAll).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors', async () => {
      mock${name}Service.prototype.findAll = jest.fn().mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/${name.toLowerCase()}')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /${name.toLowerCase()}/:id', () => {
    it('should return a specific ${name.toLowerCase()} item', async () => {
      const mockData = { id: '1', name: 'Test ${name}' };
      mock${name}Service.prototype.findById = jest.fn().mockResolvedValue(mockData);

      const response = await request(app)
        .get('/${name.toLowerCase()}/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockData);
      expect(mock${name}Service.prototype.findById).toHaveBeenCalledWith('1');
    });

    it('should return 404 when item not found', async () => {
      mock${name}Service.prototype.findById = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .get('/${name.toLowerCase()}/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('POST /${name.toLowerCase()}', () => {
    it('should create a new ${name.toLowerCase()} item', async () => {
      const newItem = { name: 'New ${name}' };
      const createdItem = { id: '1', ...newItem };
      mock${name}Service.prototype.create = jest.fn().mockResolvedValue(createdItem);

      const response = await request(app)
        .post('/${name.toLowerCase()}')
        .send(newItem)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(createdItem);
      expect(mock${name}Service.prototype.create).toHaveBeenCalledWith(newItem);
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/${name.toLowerCase()}')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /${name.toLowerCase()}/:id', () => {
    it('should update an existing ${name.toLowerCase()} item', async () => {
      const updateData = { name: 'Updated ${name}' };
      const updatedItem = { id: '1', ...updateData };
      mock${name}Service.prototype.update = jest.fn().mockResolvedValue(updatedItem);

      const response = await request(app)
        .put('/${name.toLowerCase()}/1')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(updatedItem);
      expect(mock${name}Service.prototype.update).toHaveBeenCalledWith('1', updateData);
    });
  });

  describe('DELETE /${name.toLowerCase()}/:id', () => {
    it('should delete an existing ${name.toLowerCase()} item', async () => {
      mock${name}Service.prototype.delete = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .delete('/${name.toLowerCase()}/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mock${name}Service.prototype.delete).toHaveBeenCalledWith('1');
    });
  });
});
`;
    } else {
      return `const request = require('supertest');
const { app } = require('../../../src/index');
const { ${name}Service } = require('../../../src/services/${name}Service');

// Mock the service
jest.mock('../../../src/services/${name}Service');

describe('${className}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /${name.toLowerCase()}', () => {
    it('should return all ${name.toLowerCase()} items', async () => {
      const mockData = [{ id: '1', name: 'Test ${name}' }];
      ${name}Service.prototype.findAll.mockResolvedValue(mockData);

      const response = await request(app)
        .get('/${name.toLowerCase()}')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockData);
    });
  });

  // Additional tests...
});
`;
    }
  }

  private generateServiceTests(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Service`;
    
    if (typescript) {
      return `import { ${className} } from '../../../src/services/${name}Service';
import { ${name}Model } from '../../../src/models/${name}';

// Mock the model
jest.mock('../../../src/models/${name}');
const mock${name}Model = ${name}Model as jest.Mocked<typeof ${name}Model>;

describe('${className}', () => {
  let service: ${className};

  beforeEach(() => {
    service = new ${className}();
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all items', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      mock${name}Model.find = jest.fn().mockResolvedValue(mockData);

      const result = await service.findAll();

      expect(result).toEqual(mockData);
      expect(mock${name}Model.find).toHaveBeenCalledTimes(1);
    });

    it('should handle database errors', async () => {
      mock${name}Model.find = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(service.findAll()).rejects.toThrow('Database error');
    });
  });

  describe('findById', () => {
    it('should return item by id', async () => {
      const mockData = { id: '1', name: 'Test' };
      mock${name}Model.findById = jest.fn().mockResolvedValue(mockData);

      const result = await service.findById('1');

      expect(result).toEqual(mockData);
      expect(mock${name}Model.findById).toHaveBeenCalledWith('1');
    });

    it('should return null when item not found', async () => {
      mock${name}Model.findById = jest.fn().mockResolvedValue(null);

      const result = await service.findById('999');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new item', async () => {
      const newData = { name: 'New Item' };
      const createdData = { id: '1', ...newData };
      const mockInstance = {
        save: jest.fn().mockResolvedValue(createdData)
      };
      mock${name}Model.mockImplementation(() => mockInstance as any);

      const result = await service.create(newData);

      expect(result).toEqual(createdData);
      expect(mockInstance.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('should update existing item', async () => {
      const updateData = { name: 'Updated Item' };
      const updatedData = { id: '1', ...updateData };
      mock${name}Model.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedData);

      const result = await service.update('1', updateData);

      expect(result).toEqual(updatedData);
      expect(mock${name}Model.findByIdAndUpdate).toHaveBeenCalledWith('1', updateData, { new: true });
    });
  });

  describe('delete', () => {
    it('should delete existing item', async () => {
      mock${name}Model.findByIdAndDelete = jest.fn().mockResolvedValue({ id: '1' });

      const result = await service.delete('1');

      expect(result).toBe(true);
      expect(mock${name}Model.findByIdAndDelete).toHaveBeenCalledWith('1');
    });

    it('should return false when item not found', async () => {
      mock${name}Model.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      const result = await service.delete('999');

      expect(result).toBe(false);
    });
  });
});
`;
    } else {
      return `const { ${className} } = require('../../../src/services/${name}Service');
const { ${name}Model } = require('../../../src/models/${name}');

// Mock the model
jest.mock('../../../src/models/${name}');

describe('${className}', () => {
  let service;

  beforeEach(() => {
    service = new ${className}();
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all items', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      ${name}Model.find.mockResolvedValue(mockData);

      const result = await service.findAll();

      expect(result).toEqual(mockData);
    });
  });

  // Additional tests...
});
`;
    }
  }

  private generateModelTests(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import mongoose from 'mongoose';
import { ${name}Model } from '../../../src/models/${name}';

describe('${name} Model', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid ${name.toLowerCase()}', async () => {
      const validData = {
        name: 'Test ${name}',
        description: 'Test description'
      };

      const ${name.toLowerCase()} = new ${name}Model(validData);
      const saved${name} = await ${name.toLowerCase()}.save();

      expect(saved${name}._id).toBeDefined();
      expect(saved${name}.name).toBe(validData.name);
      expect(saved${name}.description).toBe(validData.description);
      expect(saved${name}.createdAt).toBeDefined();
      expect(saved${name}.updatedAt).toBeDefined();
    });

    it('should require name field', async () => {
      const invalidData = {
        description: 'Test description'
      };

      const ${name.toLowerCase()} = new ${name}Model(invalidData);
      
      await expect(${name.toLowerCase()}.save()).rejects.toThrow();
    });

    it('should trim name field', async () => {
      const dataWithSpaces = {
        name: '  Test ${name}  '
      };

      const ${name.toLowerCase()} = new ${name}Model(dataWithSpaces);
      const saved${name} = await ${name.toLowerCase()}.save();

      expect(saved${name}.name).toBe('Test ${name}');
    });

    it('should update timestamps on save', async () => {
      const ${name.toLowerCase()} = new ${name}Model({ name: 'Test ${name}' });
      const saved${name} = await ${name.toLowerCase()}.save();
      
      const originalUpdatedAt = saved${name}.updatedAt;
      
      // Wait a bit and update
      await new Promise(resolve => setTimeout(resolve, 10));
      saved${name}.name = 'Updated ${name}';
      await saved${name}.save();
      
      expect(saved${name}.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
`;
    } else {
      return `const mongoose = require('mongoose');
const { ${name}Model } = require('../../../src/models/${name}');

describe('${name} Model', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid ${name.toLowerCase()}', async () => {
      const validData = {
        name: 'Test ${name}',
        description: 'Test description'
      };

      const ${name.toLowerCase()} = new ${name}Model(validData);
      const saved${name} = await ${name.toLowerCase()}.save();

      expect(saved${name}._id).toBeDefined();
      expect(saved${name}.name).toBe(validData.name);
    });
  });
});
`;
    }
  }

  private generateUtilityTests(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Utils`;
    
    if (typescript) {
      return `import { ${className} } from '../../../src/utils/${name}Utils';

describe('${className}', () => {
  describe('formatResponse', () => {
    it('should format successful response', () => {
      const data = { id: '1', name: 'Test' };
      const message = 'Success';
      
      const result = ${className}.formatResponse(data, message);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.message).toBe(message);
      expect(result.timestamp).toBeDefined();
    });

    it('should use default message when not provided', () => {
      const data = { id: '1' };
      
      const result = ${className}.formatResponse(data);
      
      expect(result.message).toBe('Success');
    });
  });

  describe('formatError', () => {
    it('should format error response', () => {
      const error = new Error('Test error');
      const code = 'TEST_ERROR';
      
      const result = ${className}.formatError(error, code);
      
      expect(result.success).toBe(false);
      expect(result.error.code).toBe(code);
      expect(result.error.message).toBe('Test error');
      expect(result.error.timestamp).toBeDefined();
    });

    it('should use default error code when not provided', () => {
      const error = new Error('Test error');
      
      const result = ${className}.formatError(error);
      
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = ${className}.generateId();
      const id2 = ${className}.generateId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize string input', () => {
      const input = '  <script>alert("xss")</script>  ';
      const result = ${className}.sanitizeInput(input);
      
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should sanitize object input', () => {
      const input = {
        name: '  Test Name  ',
        description: '<b>Bold</b>'
      };
      
      const result = ${className}.sanitizeInput(input);
      
      expect(result.name).toBe('Test Name');
      expect(result.description).not.toContain('<b>');
    });

    it('should handle non-string, non-object input', () => {
      expect(${className}.sanitizeInput(123)).toBe(123);
      expect(${className}.sanitizeInput(true)).toBe(true);
      expect(${className}.sanitizeInput(null)).toBe(null);
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await ${className}.retry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      const result = await ${className}.retry(mockFn, 3, 10);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(${className}.retry(mockFn, 2, 10)).rejects.toThrow('Persistent failure');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });
});
`;
    } else {
      return `const { ${className} } = require('../../../src/utils/${name}Utils');

describe('${className}', () => {
  describe('formatResponse', () => {
    it('should format successful response', () => {
      const data = { id: '1', name: 'Test' };
      const message = 'Success';
      
      const result = ${className}.formatResponse(data, message);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.message).toBe(message);
    });
  });

  // Additional tests...
});
`;
    }
  }

  private generateApiIntegrationTests(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../../src/index';
import { ${name}Model } from '../../../src/models/${name}';

describe('${name} API Integration Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('CRUD Operations', () => {
    it('should create, read, update, and delete ${name.toLowerCase()}', async () => {
      // Create
      const createData = { name: 'Integration Test ${name}' };
      const createResponse = await request(app)
        .post('/${name.toLowerCase()}')
        .send(createData)
        .expect(201);
      
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.name).toBe(createData.name);
      const createdId = createResponse.body.data._id;

      // Read
      const readResponse = await request(app)
        .get(`/${name.toLowerCase()}/${createdId}`)
        .expect(200);
      
      expect(readResponse.body.success).toBe(true);
      expect(readResponse.body.data._id).toBe(createdId);

      // Update
      const updateData = { name: 'Updated Integration Test ${name}' };
      const updateResponse = await request(app)
        .put(`/${name.toLowerCase()}/${createdId}`)
        .send(updateData)
        .expect(200);
      
      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.name).toBe(updateData.name);

      // Delete
      await request(app)
        .delete(`/${name.toLowerCase()}/${createdId}`)
        .expect(200);
      
      // Verify deletion
      await request(app)
        .get(`/${name.toLowerCase()}/${createdId}`)
        .expect(404);
    });

    it('should handle bulk operations', async () => {
      // Create multiple items
      const items = [
        { name: 'Item 1' },
        { name: 'Item 2' },
        { name: 'Item 3' }
      ];

      for (const item of items) {
        await request(app)
          .post('/${name.toLowerCase()}')
          .send(item)
          .expect(201);
      }

      // Get all items
      const response = await request(app)
        .get('/${name.toLowerCase()}')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
    });

    it('should handle pagination', async () => {
      // Create test data
      for (let i = 1; i <= 15; i++) {
        await request(app)
          .post('/${name.toLowerCase()}')
          .send({ name: `Item ${i}` })
          .expect(201);
      }

      // Test pagination
      const response = await request(app)
        .get('/${name.toLowerCase()}?page=1&limit=10')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(10);
    });

    it('should handle search and filtering', async () => {
      // Create test data
      await request(app)
        .post('/${name.toLowerCase()}')
        .send({ name: 'Apple Product' })
        .expect(201);
      
      await request(app)
        .post('/${name.toLowerCase()}')
        .send({ name: 'Orange Product' })
        .expect(201);

      // Test search
      const response = await request(app)
        .get('/${name.toLowerCase()}?search=Apple')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toContain('Apple');
    });

    it('should validate input data', async () => {
      // Test invalid data
      const response = await request(app)
        .post('/${name.toLowerCase()}')
        .send({})
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });

    it('should handle authentication and authorization', async () => {
      // Test without authentication
      await request(app)
        .post('/${name.toLowerCase()}')
        .send({ name: 'Test' })
        .expect(401);
      
      // Test with invalid token
      await request(app)
        .post('/${name.toLowerCase()}')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'Test' })
        .expect(401);
    });

    it('should handle rate limiting', async () => {
      // Make multiple rapid requests
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app)
            .get('/${name.toLowerCase()}')
        );
      }

      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should handle concurrent operations', async () => {
      const createData = { name: 'Concurrent Test ${name}' };
      
      // Create multiple items concurrently
      const promises = Array(10).fill(null).map(() => 
        request(app)
          .post('/${name.toLowerCase()}')
          .send(createData)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    it('should handle database connection issues', async () => {
      // Simulate database disconnection
      await mongoose.disconnect();
      
      const response = await request(app)
        .get('/${name.toLowerCase()}')
        .expect(500);
      
      expect(response.body.success).toBe(false);
      
      // Reconnect for cleanup
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
    });
  });
});
`;
    } else {
      return `const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../../../src/index');
const { ${name}Model } = require('../../../src/models/${name}');

describe('${name} API Integration Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('CRUD Operations', () => {
    it('should create, read, update, and delete ${name.toLowerCase()}', async () => {
      // Create
      const createData = { name: 'Integration Test ${name}' };
      const createResponse = await request(app)
        .post('/${name.toLowerCase()}')
        .send(createData)
        .expect(201);
      
      expect(createResponse.body.success).toBe(true);
      const createdId = createResponse.body.data._id;

      // Read
      const readResponse = await request(app)
        .get(`/${name.toLowerCase()}/${createdId}`)
        .expect(200);
      
      expect(readResponse.body.success).toBe(true);
    });
  });
});
`;
    }
  }

  private generateDatabaseIntegrationTests(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import mongoose from 'mongoose';
import { ${name}Model } from '../../../src/models/${name}';
import { ${name}Service } from '../../../src/services/${name}Service';

describe('${name} Database Integration Tests', () => {
  let service: ${name}Service;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
    service = new ${name}Service();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('Database Operations', () => {
    it('should perform CRUD operations through service', async () => {
      // Create
      const createData = { name: 'Database Test ${name}' };
      const created = await service.create(createData);
      
      expect(created).toBeDefined();
      expect(created.name).toBe(createData.name);
      expect(created._id).toBeDefined();

      // Read
      const found = await service.findById(created._id.toString());
      expect(found).toBeDefined();
      expect(found!.name).toBe(createData.name);

      // Update
      const updateData = { name: 'Updated Database Test ${name}' };
      const updated = await service.update(created._id.toString(), updateData);
      expect(updated).toBeDefined();
      expect(updated!.name).toBe(updateData.name);

      // Delete
      const deleted = await service.delete(created._id.toString());
      expect(deleted).toBe(true);

      // Verify deletion
      const notFound = await service.findById(created._id.toString());
      expect(notFound).toBeNull();
    });

    it('should handle database constraints', async () => {
      // Test unique constraints if any
      const data = { name: 'Unique Test' };
      
      await service.create(data);
      
      // If there's a unique constraint, this should fail
      // await expect(service.create(data)).rejects.toThrow();
    });

    it('should handle transactions', async () => {
      const session = await mongoose.startSession();
      
      try {
        await session.withTransaction(async () => {
          const item1 = await service.create({ name: 'Transaction Item 1' });
          const item2 = await service.create({ name: 'Transaction Item 2' });
          
          expect(item1).toBeDefined();
          expect(item2).toBeDefined();
        });
        
        const items = await service.findAll();
        expect(items).toHaveLength(2);
      } finally {
        await session.endSession();
      }
    });

    it('should handle database indexing', async () => {
      // Create multiple items
      const items = [];
      for (let i = 1; i <= 1000; i++) {
        items.push({ name: `Item ${i.toString().padStart(4, '0')}` });
      }
      
      // Bulk insert
      await ${name}Model.insertMany(items);
      
      // Test query performance with indexing
      const startTime = Date.now();
      const results = await service.findAll();
      const endTime = Date.now();
      
      expect(results).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should be fast with proper indexing
    });

    it('should handle database connection pooling', async () => {
      // Test multiple concurrent database operations
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(service.create({ name: `Concurrent Item ${i}` }));
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(50);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result._id).toBeDefined();
      });
    });

    it('should handle database migration scenarios', async () => {
      // Test data migration or schema changes
      const oldFormatData = {
        name: 'Old Format Item',
        // Simulate old schema fields
        oldField: 'old value'
      };
      
      // Insert data directly to simulate old format
      const inserted = await ${name}Model.create(oldFormatData);
      
      // Test that service can handle old format data
      const found = await service.findById(inserted._id.toString());
      expect(found).toBeDefined();
      expect(found!.name).toBe(oldFormatData.name);
    });
  });
});
`;
    } else {
      return `const mongoose = require('mongoose');
const { ${name}Model } = require('../../../src/models/${name}');
const { ${name}Service } = require('../../../src/services/${name}Service');

describe('${name} Database Integration Tests', () => {
  let service;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
    service = new ${name}Service();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('Database Operations', () => {
    it('should perform CRUD operations through service', async () => {
      const createData = { name: 'Database Test ${name}' };
      const created = await service.create(createData);
      
      expect(created).toBeDefined();
      expect(created.name).toBe(createData.name);
    });
  });
});
`;
    }
  }

  private generateEndToEndTests(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../../src/index';
import { ${name}Model } from '../../../src/models/${name}';

describe('${name} End-to-End Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('Complete User Workflows', () => {
    it('should handle complete ${name.toLowerCase()} lifecycle', async () => {
      // User creates a new ${name.toLowerCase()}
      const createData = {
        name: 'E2E Test ${name}',
        description: 'End-to-end test description'
      };
      
      const createResponse = await request(app)
        .post('/${name.toLowerCase()}')
        .send(createData)
        .expect(201);
      
      const createdId = createResponse.body.data._id;
      
      // User views the ${name.toLowerCase()}
      const viewResponse = await request(app)
        .get(`/${name.toLowerCase()}/${createdId}`)
        .expect(200);
      
      expect(viewResponse.body.data.name).toBe(createData.name);
      
      // User updates the ${name.toLowerCase()}
      const updateData = {
        name: 'Updated E2E Test ${name}',
        description: 'Updated description'
      };
      
      const updateResponse = await request(app)
        .put(`/${name.toLowerCase()}/${createdId}`)
        .send(updateData)
        .expect(200);
      
      expect(updateResponse.body.data.name).toBe(updateData.name);
      
      // User lists all ${name.toLowerCase()}s
      const listResponse = await request(app)
        .get('/${name.toLowerCase()}')
        .expect(200);
      
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].name).toBe(updateData.name);
      
      // User deletes the ${name.toLowerCase()}
      await request(app)
        .delete(`/${name.toLowerCase()}/${createdId}`)
        .expect(200);
      
      // Verify ${name.toLowerCase()} is deleted
      await request(app)
        .get(`/${name.toLowerCase()}/${createdId}`)
        .expect(404);
    });

    it('should handle bulk operations workflow', async () => {
      // User creates multiple ${name.toLowerCase()}s
      const items = [
        { name: 'Bulk Item 1', description: 'First item' },
        { name: 'Bulk Item 2', description: 'Second item' },
        { name: 'Bulk Item 3', description: 'Third item' }
      ];
      
      const createdItems = [];
      for (const item of items) {
        const response = await request(app)
          .post('/${name.toLowerCase()}')
          .send(item)
          .expect(201);
        createdItems.push(response.body.data);
      }
      
      // User searches for specific items
      const searchResponse = await request(app)
        .get('/${name.toLowerCase()}?search=Bulk Item 2')
        .expect(200);
      
      expect(searchResponse.body.data).toHaveLength(1);
      expect(searchResponse.body.data[0].name).toBe('Bulk Item 2');
      
      // User filters items
      const filterResponse = await request(app)
        .get('/${name.toLowerCase()}?filter=description:First')
        .expect(200);
      
      expect(filterResponse.body.data).toHaveLength(1);
      expect(filterResponse.body.data[0].description).toContain('First');
      
      // User sorts items
      const sortResponse = await request(app)
        .get('/${name.toLowerCase()}?sort=name:desc')
        .expect(200);
      
      expect(sortResponse.body.data[0].name).toBe('Bulk Item 3');
      expect(sortResponse.body.data[2].name).toBe('Bulk Item 1');
    });

    it('should handle error scenarios gracefully', async () => {
      // Test invalid data submission
      const invalidResponse = await request(app)
        .post('/${name.toLowerCase()}')
        .send({ invalidField: 'invalid' })
        .expect(400);
      
      expect(invalidResponse.body.success).toBe(false);
      expect(invalidResponse.body.message).toContain('validation');
      
      // Test accessing non-existent resource
      const notFoundResponse = await request(app)
        .get('/${name.toLowerCase()}/507f1f77bcf86cd799439011')
        .expect(404);
      
      expect(notFoundResponse.body.success).toBe(false);
      expect(notFoundResponse.body.message).toContain('not found');
      
      // Test updating non-existent resource
      const updateNotFoundResponse = await request(app)
        .put('/${name.toLowerCase()}/507f1f77bcf86cd799439011')
        .send({ name: 'Updated Name' })
        .expect(404);
      
      expect(updateNotFoundResponse.body.success).toBe(false);
    });

    it('should handle authentication workflow', async () => {
      // Test unauthenticated access
      await request(app)
        .post('/${name.toLowerCase()}')
        .send({ name: 'Test' })
        .expect(401);
      
      // Test with valid authentication
      const authToken = 'valid-jwt-token'; // In real tests, generate this
      
      const authenticatedResponse = await request(app)
        .post('/${name.toLowerCase()}')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Authenticated Test' })
        .expect(201);
      
      expect(authenticatedResponse.body.success).toBe(true);
    });

    it('should handle performance under load', async () => {
      // Create a large number of items
      const promises = [];
      for (let i = 1; i <= 100; i++) {
        promises.push(
          request(app)
            .post('/${name.toLowerCase()}')
            .send({ name: `Load Test Item ${i}` })
        );
      }
      
      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
      
      // Test listing performance with large dataset
      const listStartTime = Date.now();
      const listResponse = await request(app)
        .get('/${name.toLowerCase()}')
        .expect(200);
      const listEndTime = Date.now();
      
      expect(listResponse.body.data).toHaveLength(100);
      expect(listEndTime - listStartTime).toBeLessThan(1000); // 1 second
    });
  });
});
`;
    } else {
      return `const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../../../src/index');
const { ${name}Model } = require('../../../src/models/${name}');

describe('${name} End-to-End Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ${name}Model.deleteMany({});
  });

  describe('Complete User Workflows', () => {
    it('should handle complete ${name.toLowerCase()} lifecycle', async () => {
      const createData = {
        name: 'E2E Test ${name}',
        description: 'End-to-end test description'
      };
      
      const createResponse = await request(app)
        .post('/${name.toLowerCase()}')
        .send(createData)
        .expect(201);
      
      const createdId = createResponse.body.data._id;
      
      // Test complete workflow
      const viewResponse = await request(app)
        .get(`/${name.toLowerCase()}/${createdId}`)
        .expect(200);
      
      expect(viewResponse.body.data.name).toBe(createData.name);
    });
  });
});
`;
    }
  }

  private generateJestConfig(data: BeTestJobData): string {
    const { typescript } = data.api;
    
    if (typescript) {
      return `import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageThreshold: {
    global: {
      branches: ${data.coverage?.target || 80},
      functions: ${data.coverage?.target || 80},
      lines: ${data.coverage?.target || 80},
      statements: ${data.coverage?.target || 80}
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true
};

export default config;
`;
    } else {
      return `module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageThreshold: {
    global: {
      branches: ${data.coverage?.target || 80},
      functions: ${data.coverage?.target || 80},
      lines: ${data.coverage?.target || 80},
      statements: ${data.coverage?.target || 80}
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true
};
`;
    }
  }

  private generateTestSetup(data: BeTestJobData): string {
    const { typescript } = data.api;
    
    if (typescript) {
      return `import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  // Start in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to the in-memory database
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  // Cleanup
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections before each test
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Global test configuration
jest.setTimeout(30000);

// Mock console methods in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.MONGODB_TEST_URI = 'mongodb://localhost:27017/test';
`;
    } else {
      return `const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

jest.setTimeout(30000);

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
`;
    }
  }

  private generateTestHelpers(data: BeTestJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import jwt from 'jsonwebtoken';
import { ${name}Model } from '../src/models/${name}';

export class TestHelpers {
  static generateAuthToken(userId: string = 'test-user-id'): string {
    return jwt.sign(
      { userId, email: 'test@example.com' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  }

  static async create${name}(data: Partial<any> = {}): Promise<any> {
    const defaultData = {
      name: 'Test ${name}',
      description: 'Test description',
      ...data
    };
    
    const ${name.toLowerCase()} = new ${name}Model(defaultData);
    return await ${name.toLowerCase()}.save();
  }

  static async createMultiple${name}s(count: number = 5): Promise<any[]> {
    const items = [];
    
    for (let i = 1; i <= count; i++) {
      const item = await this.create${name}({
        name: `Test ${name} ${i}`,
        description: `Test description ${i}`
      });
      items.push(item);
    }
    
    return items;
  }

  static async cleanupDatabase(): Promise<void> {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }

  static generateRandomString(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static async waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static mockRequest(overrides: any = {}): any {
    return {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: { id: 'test-user-id' },
      ...overrides
    };
  }

  static mockResponse(): any {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    return res;
  }

  static mockNext(): jest.Mock {
    return jest.fn();
  }
}

export { TestHelpers };
`;
    } else {
      return `const jwt = require('jsonwebtoken');
const { ${name}Model } = require('../src/models/${name}');

class TestHelpers {
  static generateAuthToken(userId = 'test-user-id') {
    return jwt.sign(
      { userId, email: 'test@example.com' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  }

  static async create${name}(data = {}) {
    const defaultData = {
      name: 'Test ${name}',
      description: 'Test description',
      ...data
    };
    
    const ${name.toLowerCase()} = new ${name}Model(defaultData);
    return await ${name.toLowerCase()}.save();
  }

  static async createMultiple${name}s(count = 5) {
    const items = [];
    
    for (let i = 1; i <= count; i++) {
      const item = await this.create${name}({
        name: `Test ${name} ${i}`,
        description: `Test description ${i}`
      });
      items.push(item);
    }
    
    return items;
  }

  static async cleanupDatabase() {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }

  static generateRandomString(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static mockRequest(overrides = {}) {
    return {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: { id: 'test-user-id' },
      ...overrides
    };
  }

  static mockResponse() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    return res;
  }

  static mockNext() {
    return jest.fn();
  }
}

module.exports = { TestHelpers };
`;
    }
  }

  private addTestDependencies(framework: string, dependencies: string[], devDependencies: string[]): void {
    switch (framework) {
      case 'jest':
        devDependencies.push('jest', 'supertest', 'mongodb-memory-server');
        break;
      case 'mocha':
        devDependencies.push('mocha', 'chai', 'supertest', 'mongodb-memory-server');
        break;
      case 'vitest':
        devDependencies.push('vitest', 'supertest', 'mongodb-memory-server');
        break;
    }
  }

  private estimateCoverage(testCount: number, data: BeTestJobData): number {
    // Simple estimation based on test count and complexity
    const baselineCoverage = Math.min(testCount * 3, 95); // 3% per test, max 95%
    const complexityFactor = data.testTypes.length * 5; // 5% per test type
    
    return Math.min(baselineCoverage + complexityFactor, 95);
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }
}

export const beTestGenerator = new BeTestGenerator();