// decorators.ts
import 'reflect-metadata';
import * as restate from '@restatedev/restate-sdk';

// Export symbols for testing purposes
export const SERVICE_METADATA = Symbol("SERVICE_METADATA");
export const HANDLER_METADATA = Symbol("HANDLER_METADATA");
export const OBJECT_METADATA = Symbol("OBJECT_METADATA");
export const WORKFLOW_METADATA = Symbol("WORKFLOW_METADATA");


export function RestateService(name: string) {
  return function (constructor: Function) {
    Reflect.defineMetadata(SERVICE_METADATA, { name }, constructor);
  };
}

export function RestateObject() {
  return function (constructor: Function) {
    Reflect.defineMetadata(OBJECT_METADATA, {}, constructor);
  };
}

export function RestateWorkflow(name: string) {
  return function (constructor: Function) {
    Reflect.defineMetadata(WORKFLOW_METADATA, { name }, constructor);
  };
}

export function RestateHandler() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const handlers = Reflect.getMetadata(HANDLER_METADATA, target.constructor) || {};
    handlers[propertyKey] = descriptor.value;
    Reflect.defineMetadata(HANDLER_METADATA, handlers, target.constructor);
  };
}

export function createService(instance: any) {
  const constructor = instance.constructor;
  const service = Reflect.getMetadata(SERVICE_METADATA, constructor) || {};
  const handlers = Reflect.getMetadata(HANDLER_METADATA, constructor);
  
  if (!service || !handlers) {
    throw new Error(`RestateService: ${constructor.name} is missing @RestateService or @RestateHandler metadata.`);
  }
  
  return restate.service({
    name: service.name || constructor.name,
    handlers: Object.fromEntries(
      Object.entries<Function>(handlers).map(([key, originalFn]) => {
        return [
          key,
          async (ctx: restate.Context, ...args: any[]) => {
            return originalFn.call(instance, ctx, ...args);
          }
        ];
      })
    ),
  });
}

export function createVirtualObject(instance: any) {
  const constructor = instance.constructor;
  const virtualObject = Reflect.getMetadata(OBJECT_METADATA, constructor) || {};
  const handlers = Reflect.getMetadata(HANDLER_METADATA, constructor);
  
  if (!virtualObject || !handlers) {
    throw new Error(`RestateVirtualObject ${constructor.name} is missing @RestateVirtualObject or @RestateHandler metadata.`);
  }
  
  return restate.object({
    name: virtualObject.name || constructor.name,
    handlers: Object.fromEntries(
      Object.entries<Function>(handlers).map(([key, originalFn]) => {
        return [
          key,
          async (ctx: restate.ObjectContext, ...args: any[]) => {
            return originalFn.call(instance, ctx, ...args);
          }
        ];
      })
    ),
  });
}

export function createWorkflow(instance: any): restate.WorkflowDefinition<any, any> {
  const constructor = instance.constructor;
  const workflow = Reflect.getMetadata(WORKFLOW_METADATA, constructor) || {};
  const handlers = Reflect.getMetadata(HANDLER_METADATA, constructor);
  if (!workflow || !handlers) {
    throw new Error(`RestateWorkflow ${constructor.name} is missing @RestateWorkflow or @RestateHandler metadata.`);
  }
  const rawHandlers: Record<string, any> = {};
  
  for (const prop of Object.getOwnPropertyNames(Object.getPrototypeOf(instance))) {
    if (prop === "constructor") continue;
    rawHandlers[prop] = instance[prop].bind(instance);
  }
  
  // Ensure `run` is present
  if (typeof rawHandlers["run"] !== "function") {
    throw new Error(`RestateWorkflow ${instance.constructor.name} must implement a "run" method.`);
  }
  
  return restate.workflow({
    name: instance.constructor.name,
    handlers: rawHandlers as {
      run: (ctx: restate.WorkflowSharedContext<any>, ...args: any[]) => Promise<any>,
      [key: string]: (ctx: restate.WorkflowSharedContext<any>, ...args: any[]) => Promise<any>,
    },
  });
}