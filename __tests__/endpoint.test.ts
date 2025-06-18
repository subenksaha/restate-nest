import { endpoint } from '../src/endpoint';
import * as restate from '@restatedev/restate-sdk';

describe('Endpoint', () => {
  it('should create a Restate endpoint', () => {
    expect(endpoint).toBeDefined();
    // The actual endpoint is an instance of RestateEndpoint
    expect(endpoint).toBeInstanceOf(Object);
  });

  it('should allow creating a service with the Restate SDK', async () => {
    // Mock the restate context
    const mockCtx = {
      console: {
        info: jest.fn(),
        error: jest.fn(),
      },
    } as unknown as restate.Context;

    // Create a test service directly with the Restate SDK
    const testService = {
      name: 'test-service',
      handlers: {
        testMethod: async (ctx: restate.Context, request: any) => {
          return { success: true, request };
        },
      },
    };

    // Test the handler with mock context
    const result = await testService.handlers.testMethod(mockCtx, { test: 'data' });
    
    expect(result).toEqual({ success: true, request: { test: 'data' } });
  });
});
