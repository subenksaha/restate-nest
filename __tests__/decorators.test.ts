import 'reflect-metadata';
import * as restate from '@restatedev/restate-sdk';
import {
  SERVICE_METADATA,
  HANDLER_METADATA,
  OBJECT_METADATA,
  WORKFLOW_METADATA,
  RestateService,
  RestateHandler,
  RestateObject,
  RestateWorkflow,
  createService,
  createVirtualObject,
  createWorkflow
} from '../src/decorators';

// Store instance for the mock handler
let instance: any;

// Mock the restate module first
jest.mock('@restatedev/restate-sdk', () => {
  const original = jest.requireActual('@restatedev/restate-sdk');
  
  // Mock the service function
  const mockService = jest.fn().mockImplementation(({ name, handlers }) => ({
    name,
    handlers: Object.fromEntries(
      Object.entries(handlers).map(([key, handler]) => [
        key,
        async (ctx: any, ...args: any[]) => {
          return (handler as Function).call(instance, ctx, ...args);
        }
      ])
    )
  }));

  // Mock the object function
  const mockObject = jest.fn().mockImplementation(({ name, handlers }) => ({
    name,
    handlers: Object.fromEntries(
      Object.entries(handlers).map(([key, handler]) => [
        key,
        async (ctx: any, ...args: any[]) => {
          return (handler as Function).call(instance, ctx, ...args);
        }
      ])
    )
  }));
  
  return {
    ...original,
    service: mockService,
    object: mockObject,
    workflow: mockService // Reuse the same mock for workflow for now
  };
});

// Get the mock service for assertions
const mockService = (restate as any).service as jest.Mock;
const mockObject = (restate as any).object as jest.Mock;

// Test implementation without using decorator syntax
describe('Restate Decorators', () => {

  describe('createService', () => {
    let testInstance: any;
    let service: any;
    
    beforeEach(() => {
      // Create a test class with metadata
      class TestService {
        async testMethod(ctx: restate.Context) {
          return { success: true };
        }
      }

      // Manually add metadata that the decorators would normally add
      Reflect.defineMetadata(SERVICE_METADATA, { name: 'TestService' }, TestService);
      Reflect.defineMetadata(
        HANDLER_METADATA,
        {
          testMethod: TestService.prototype.testMethod
        },
        TestService
      );

      testInstance = new TestService();
      instance = testInstance; // Set the instance for the mock handler
      service = createService(testInstance);
    });
    
    afterEach(() => {
      jest.clearAllMocks();
      instance = undefined;
    });

    it('should create a service with handlers', () => {
      expect(service).toBeDefined();
      expect(service.name).toBe('TestService');
      expect(service.handlers.testMethod).toBeDefined();
    });
    
    it('should call the handler with the correct context', async () => {
      // Test the handler
      const mockCtx = {
        console: {
          info: jest.fn(),
          error: jest.fn(),
        },
      } as unknown as restate.Context;

      const result = await service.handlers.testMethod(mockCtx);
      expect(result).toEqual({ success: true });
    });

    it('should throw an error when metadata is missing', () => {
      class InvalidService {
        testMethod() {}
      }

      const instance = new InvalidService();
      
      expect(() => createService(instance)).toThrow(
        'RestateService: InvalidService is missing @RestateService or @RestateHandler metadata.'
      );
    });
  });

  describe('RestateHandler', () => {
    it('should add handler metadata to the class', () => {
      class TestClass {
        methodOne() {}
        methodTwo() {}
      }

      // Create a decorator instance
      const handlerDecorator = RestateHandler();
      
      // Get method descriptors
      const methodOneDescriptor = Object.getOwnPropertyDescriptor(
        TestClass.prototype,
        'methodOne'
      )!;

      const methodTwoDescriptor = Object.getOwnPropertyDescriptor(
        TestClass.prototype,
        'methodTwo'
      )!;

      // Apply the decorator to methods
      handlerDecorator(TestClass.prototype, 'methodOne', methodOneDescriptor);
      handlerDecorator(TestClass.prototype, 'methodTwo', methodTwoDescriptor);

      // Check that metadata was added
      const handlers = Reflect.getMetadata(HANDLER_METADATA, TestClass.prototype.constructor);
      expect(handlers).toBeDefined();
      expect(handlers.methodOne).toBeDefined();
      expect(handlers.methodTwo).toBeDefined();
    });
  });

  describe('RestateService', () => {
    it('should add service metadata to the class', () => {
      class TestService {}
      
      // Create and apply the decorator
      const serviceDecorator = RestateService('TestService');
      serviceDecorator(TestService);
      
      // Check that metadata was added
      const metadata = Reflect.getMetadata(SERVICE_METADATA, TestService);
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('TestService');
    });
  });

  describe('RestateObject', () => {
    it('should add object metadata to the class', () => {
      class TestObject {}
      
      // Create and apply the decorator
      const objectDecorator = RestateObject();
      objectDecorator(TestObject);
      
      // Check that metadata was added
      const metadata = Reflect.getMetadata(OBJECT_METADATA, TestObject);
      expect(metadata).toBeDefined();
    });
  });

  describe('createVirtualObject', () => {
    it('should create a virtual object with handlers', () => {
      class TestObject {
        async handle(ctx: any) {
          return { success: true };
        }
      }

      // Manually add metadata
      Reflect.defineMetadata(OBJECT_METADATA, { name: 'TestObject' }, TestObject);
      Reflect.defineMetadata(
        HANDLER_METADATA,
        { handle: TestObject.prototype.handle },
        TestObject
      );

      const instance = new TestObject();
      const virtualObject = createVirtualObject(instance);

      expect(virtualObject).toBeDefined();
      expect(virtualObject.name).toBe('TestObject');
      // The actual property might be different, but we'll check that the mock was called correctly
      expect(mockObject).toHaveBeenCalledWith({
        name: 'TestObject',
        handlers: expect.objectContaining({
          handle: expect.any(Function)
        })
      });
    });

    it('should throw an error when metadata is missing', () => {
      class InvalidObject {
        handle() {}
      }

      const instance = new InvalidObject();
      
      expect(() => createVirtualObject(instance)).toThrow(
        'RestateVirtualObject InvalidObject is missing @RestateVirtualObject or @RestateHandler metadata.'
      );
    });
  });

  describe('RestateWorkflow', () => {
    it('should add workflow metadata to the class', () => {
      class TestWorkflow {}
      
      // Create and apply the decorator
      const workflowDecorator = RestateWorkflow('TestWorkflow');
      workflowDecorator(TestWorkflow);
      
      // Check that metadata was added
      const metadata = Reflect.getMetadata(WORKFLOW_METADATA, TestWorkflow);
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('TestWorkflow');
    });
  });

  describe('createWorkflow', () => {
    it('should create a workflow with handlers', () => {
      class TestWorkflow {
        async run(ctx: any) {
          return { success: true };
        }
        async otherMethod() {}
      }

      // Manually add metadata
      Reflect.defineMetadata(WORKFLOW_METADATA, { name: 'TestWorkflow' }, TestWorkflow);
      // Add handler metadata for the methods
      Reflect.defineMetadata(
        HANDLER_METADATA,
        {
          run: TestWorkflow.prototype.run,
          otherMethod: TestWorkflow.prototype.otherMethod
        },
        TestWorkflow
      );

      const instance = new TestWorkflow();
      const workflow = createWorkflow(instance);

      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('TestWorkflow');
      
      // Verify the mock was called correctly
      expect(mockService).toHaveBeenCalledWith({
        name: 'TestWorkflow',
        handlers: expect.objectContaining({
          run: expect.any(Function),
          otherMethod: expect.any(Function)
        })
      });
    });

    it('should throw an error when run method is missing', () => {
      class InvalidWorkflow {
        // No run method
        otherMethod() {}
      }

      // Manually add metadata (but no run method in handlers)
      Reflect.defineMetadata(WORKFLOW_METADATA, { name: 'InvalidWorkflow' }, InvalidWorkflow);
      Reflect.defineMetadata(
        HANDLER_METADATA,
        { otherMethod: InvalidWorkflow.prototype.otherMethod },
        InvalidWorkflow
      );

      const instance = new InvalidWorkflow();
      
      expect(() => createWorkflow(instance)).toThrow(
        'RestateWorkflow InvalidWorkflow must implement a "run" method.'
      );
    });

    it('should throw an error when workflow metadata is missing', () => {
      class InvalidWorkflow {
        run() {}
      }
      // Don't add any metadata
      
      const instance = new InvalidWorkflow();
      
      // The implementation checks for both workflow and handler metadata
      expect(() => createWorkflow(instance)).toThrow(
        'RestateWorkflow InvalidWorkflow is missing @RestateWorkflow or @RestateHandler metadata.'
      );
    });
  });
});
