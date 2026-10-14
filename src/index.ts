import { DynamicModule, LoggerService, Module, Provider, OnApplicationBootstrap, Logger, Inject, InjectionToken, OptionalFactoryDependency, Type } from "@nestjs/common";
import { ModuleRef } from '@nestjs/core';
import { createService, createVirtualObject, createWorkflow, getRestateKind, RestateKind } from './decorators';
import * as clients from "@restatedev/restate-sdk-clients"
import { endpoint } from './endpoint';
import { createNestLoggerTransport } from './logger';
export {RestateService, RestateWorkflow, RestateObject, RestateHandler } from './decorators'
export { createNestLoggerTransport, DEFAULT_LOGGER_CONTEXT } from './logger';

interface RestateModuleOptions {
  services?: Function[];
  objects?: Function[];
  workflows?: Function[];
  imports?: any[];
  providers?: Provider[];
}

export interface RestateRootOptions {
  url: string;
  /** URL of the Restate admin API (e.g. "http://localhost:9070"). When set, this app registers itself as a deployment on startup. */
  consoleUrl?: string;
  listenerPort?: number;
  /** Host Restate uses to reach this app. Defaults to the MODULE_HOST env var, then "localhost". */
  moduleHost?: string;
  /** Protocol Restate uses to reach this app. Defaults to the MODULE_PROTOCOL env var, then "http". */
  moduleProtocol?: string;
  /**
   * Logger used for Restate SDK logs. Defaults to the NestJS `Logger`.
   * Pass a custom `LoggerService` to use your own, or `false` to keep the SDK's console logger.
   */
  logger?: LoggerService | false;
  /** Context name attached to Restate log entries. Defaults to "Restate". */
  loggerContext?: string;
}

export interface RestateOptionsFactory {
  createRestateOptions(): Promise<RestateRootOptions> | RestateRootOptions;
}

export interface RestateRootAsyncOptions {
  /** Modules exporting the providers needed by `useFactory`, `useClass` or `useExisting`. */
  imports?: any[];
  useFactory?: (...args: any[]) => Promise<RestateRootOptions> | RestateRootOptions;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  useClass?: Type<RestateOptionsFactory>;
  useExisting?: InjectionToken;
}

export const RESTATE_CLIENT = 'RESTATE_CLIENT';
export const RESTATE_MODULE_OPTIONS = 'RESTATE_MODULE_OPTIONS';

let restateStarted = false;
let restateConsoleUrl = '';
let restateModuleHost: string | undefined;
let restateModuleProtocol: string | undefined;
@Module({})
export class RestateModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(RestateModule.name);
  private static pendingServices: Function[] = [];
  private static pendingObjects: Function[] = [];
  private static pendingWorkflows: Function[] = [];
  private static listenerPort: number;
  private static listening = false;
  private static deploymentRegistered = false;

  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  async onApplicationBootstrap() {
    this.logger.debug('=== RestateModule.onApplicationBootstrap() STARTED ===');

    const moduleProtocol = restateModuleProtocol || process.env.MODULE_PROTOCOL || 'http';
    const moduleHost = restateModuleHost || process.env.MODULE_HOST || 'localhost';
    const moduleRestateUrl = `${moduleProtocol}://${moduleHost}:${RestateModule.listenerPort}`;

    const bound: string[] = [];
    const processQueue = async (items: Function[], tokenSuffix: string, type: string) => {
        for (const ItemClass of items) {
            const definition = this.moduleRef.get(`${ItemClass.name}${tokenSuffix}`, { strict: false });
            if (definition) {
                endpoint.bind(definition);
                bound.push(`${definition.name} (${type})`);
                this.logger.debug(`Bound Restate ${type}: ${ItemClass.name}`);
            } else {
                this.logger.warn(`Failed to get definition for ${type}: ${ItemClass.name}`);
            }
        }
    };

    await processQueue(RestateModule.pendingServices, '_RestateService', 'service');
    await processQueue(RestateModule.pendingObjects, '_RestateVirtualObject', 'virtual object');
    await processQueue(RestateModule.pendingWorkflows, '_RestateWorkflow', 'workflow');

    // endpoint.listen() snapshots the bound services, so it must run after binding
    if (RestateModule.listenerPort && !RestateModule.listening) {
        RestateModule.listening = true;
        await endpoint.listen(RestateModule.listenerPort);
        if (bound.length > 0) {
            this.logger.log(`Registered Restate services: ${bound.join(', ')}`);
            if (!restateConsoleUrl) {
                this.logger.log(`Register this endpoint with Restate to make it callable, e.g. \`restate deployments register ${moduleRestateUrl}\`, or set \`consoleUrl\` in RestateModule.forRoot()`);
            }
        }
    }

    // Register deployment only when a consoleUrl was given, there are handlers, and it hasn't been done yet
    const hasHandlers = RestateModule.pendingServices.length > 0 || RestateModule.pendingObjects.length > 0 || RestateModule.pendingWorkflows.length > 0;
    if (restateConsoleUrl && hasHandlers && !RestateModule.deploymentRegistered) {
        try {
            const result = await fetch(`${restateConsoleUrl}/deployments`, {
                method: 'POST',
                body: JSON.stringify({ uri: moduleRestateUrl }),
                headers: { 'Content-Type': 'application/json' },
            });

            if (result.status < 300) {
                this.logger.log(`Restate deployment registered successfully at ${moduleRestateUrl}`);
                RestateModule.deploymentRegistered = true;
            } else if (result.status === 409) {
                this.logger.log('Restate deployment already registered');
                RestateModule.deploymentRegistered = true;
            } else {
                this.logger.error(`Failed to deploy Restate: ${result.status} ${result.statusText}`);
            }
        } catch (error) {
            this.logger.error('Failed to connect to Restate console for deployment.', error);
        }
    }
    
    // Clear pending arrays after processing
    RestateModule.pendingServices = [];
    RestateModule.pendingObjects = [];
    RestateModule.pendingWorkflows = [];

    this.logger.debug('=== RestateModule.onApplicationBootstrap() COMPLETED ===');
  }

  // Applies root options once; the endpoint itself starts listening in onApplicationBootstrap
  private static configure(options: RestateRootOptions): void {
    if (restateStarted) return;
    restateStarted = true;
    restateConsoleUrl = options.consoleUrl || '';
    restateModuleHost = options.moduleHost;
    restateModuleProtocol = options.moduleProtocol;
    RestateModule.listenerPort = options.listenerPort || 9080;
    if (options.logger !== false) {
      endpoint.setLogger(createNestLoggerTransport(options.logger || undefined, options.loggerContext));
    }
  }

  static async forRoot(options: RestateRootOptions): Promise<DynamicModule> {
    const clientProvider: Provider = {
      provide: RESTATE_CLIENT,
      useValue: clients.connect({ url: options.url }),
    };

    RestateModule.configure(options);
    return Promise.resolve({
      module: RestateModule,
      providers: [clientProvider],
      exports: [clientProvider],
      global: true,
    });
  }

  /**
   * Like `forRoot`, but resolves the options through dependency injection,
   * e.g. from `ConfigService`: `forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (config) => ({ url: config.get('RESTATE_URL') }) })`.
   */
  static forRootAsync(options: RestateRootAsyncOptions): DynamicModule {
    const optionsProvider = RestateModule.createAsyncOptionsProvider(options);
    const clientProvider: Provider = {
      provide: RESTATE_CLIENT,
      useFactory: (rootOptions: RestateRootOptions) => clients.connect({ url: rootOptions.url }),
      inject: [RESTATE_MODULE_OPTIONS],
    };

    const providers: Provider[] = [optionsProvider, clientProvider];
    if (options.useClass) {
      providers.push({ provide: options.useClass, useClass: options.useClass });
    }

    return {
      module: RestateModule,
      imports: options.imports || [],
      providers,
      exports: [clientProvider, RESTATE_MODULE_OPTIONS],
      global: true,
    };
  }

  private static createAsyncOptionsProvider(options: RestateRootAsyncOptions): Provider {
    const resolve = async (factory: () => Promise<RestateRootOptions> | RestateRootOptions) => {
      const rootOptions = await factory();
      RestateModule.configure(rootOptions);
      return rootOptions;
    };

    if (options.useFactory) {
      const useFactory = options.useFactory;
      return {
        provide: RESTATE_MODULE_OPTIONS,
        useFactory: (...args: any[]) => resolve(() => useFactory(...args)),
        inject: options.inject || [],
      };
    }

    const factoryToken = options.useClass || options.useExisting;
    if (!factoryToken) {
      throw new Error('RestateModule.forRootAsync() requires one of useFactory, useClass or useExisting.');
    }
    return {
      provide: RESTATE_MODULE_OPTIONS,
      useFactory: (factory: RestateOptionsFactory) => resolve(() => factory.createRestateOptions()),
      inject: [factoryToken],
    };
  }

  static async forFeature(options: RestateModuleOptions): Promise<DynamicModule> {
    const providers: Provider[] = [];
    const exports: Provider[] = [];
    const { imports = [], providers: additionalProviders = [] } = options;

    // Route each class by its decorator, so e.g. a @RestateWorkflow listed under `services` is still a workflow
    const routed: Record<RestateKind, Function[]> = { service: [], object: [], workflow: [] };
    const listed: [RestateKind, Function[] | undefined][] = [
      ['service', options.services], ['object', options.objects], ['workflow', options.workflows],
    ];
    for (const [listedAs, classes] of listed) {
      for (const cls of classes ?? []) {
        const kind = getRestateKind(cls) ?? listedAs;
        if (kind !== listedAs) {
          new Logger(RestateModule.name).warn(`${cls.name} is decorated as a Restate ${kind} but was listed as a ${listedAs}; registering it as a ${kind}`);
        }
        routed[kind].push(cls);
      }
    }
    const services = routed.service.length ? routed.service : undefined;
    const objects = routed.object.length ? routed.object : undefined;
    const workflows = routed.workflow.length ? routed.workflow : undefined;
    
    if (!!services) {
      // Register service classes as providers and store for later binding
      const serviceProviders: Provider[] = services.map((ServiceClass) => {
        RestateModule.pendingServices.push(ServiceClass);
        const serviceToken = `${ServiceClass.name}_RestateService`;
        
        return {
          provide: serviceToken,
          useFactory: (instance: any) => createService(instance), // Bound to the endpoint in the lifecycle hook
          inject: [ServiceClass],
        } as Provider;
      });
      
      // Also register the service classes themselves as providers
      const classProviders: Provider[] = services.map((ServiceClass) => ({
        provide: ServiceClass,
        useClass: ServiceClass as any,
      }));
      
      providers.push(...serviceProviders, ...classProviders);
      exports.push(...serviceProviders);
    }
    
    if (!!objects) {
      // Register object classes as providers and store for later binding
      const objectProviders: Provider[] = objects.map((ObjectClass) => {
        RestateModule.pendingObjects.push(ObjectClass);
        const objectToken = `${ObjectClass.name}_RestateVirtualObject`;
        
        return {
          provide: objectToken,
          useFactory: (instance: any) => createVirtualObject(instance), // Bound to the endpoint in the lifecycle hook
          inject: [ObjectClass],
        };
      });
      
      // Also register the object classes themselves as providers
      const classProviders: Provider[] = objects.map((ObjectClass) => ({
        provide: ObjectClass,
        useClass: ObjectClass as any,
      }));
      
      providers.push(...objectProviders, ...classProviders);
      exports.push(...objectProviders);
    }
    
    if (!!workflows) {
      // Register workflow classes as providers and store for later binding
      const workflowProviders: Provider[] = workflows.map((WorkflowClass) => {
        RestateModule.pendingWorkflows.push(WorkflowClass);
        const workflowToken = `${WorkflowClass.name}_RestateWorkflow`;
        
        return {
          provide: workflowToken,
          useFactory: (instance: any) => createWorkflow(instance), // Bound to the endpoint in the lifecycle hook
          inject: [WorkflowClass],
        };
      });
      
      // Also register the workflow classes themselves as providers
      const classProviders: Provider[] = workflows.map((WorkflowClass) => ({
        provide: WorkflowClass,
        useClass: WorkflowClass as any,
      }));
      
      providers.push(...workflowProviders, ...classProviders);
      exports.push(...workflowProviders);
    }

    if (additionalProviders && additionalProviders.length > 0) {
      providers.push(...additionalProviders);
      exports.push(...additionalProviders);
    }
    
    return {
      module: RestateModule,
      imports: imports,
      providers: providers,
      exports: exports,
    };
  }
}
