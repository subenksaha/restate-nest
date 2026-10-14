import { DynamicModule, LoggerService, Module, Provider, OnApplicationBootstrap, Logger, Inject } from "@nestjs/common";
import { ModuleRef } from '@nestjs/core';
import { createService, createVirtualObject, createWorkflow } from './decorators';
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

export const RESTATE_CLIENT = 'RESTATE_CLIENT';

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
  private static deploymentRegistered = false;

  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  async onApplicationBootstrap() {
    this.logger.debug('=== RestateModule.onApplicationBootstrap() STARTED ===');

    const moduleProtocol = restateModuleProtocol || process.env.MODULE_PROTOCOL || 'http';
    const moduleHost = restateModuleHost || process.env.MODULE_HOST || 'localhost';
    const moduleRestateUrl = `${moduleProtocol}://${moduleHost}:${RestateModule.listenerPort}`;

    const processQueue = async (items: Function[], tokenSuffix: string, type: string) => {
        for (const ItemClass of items) {
            const definition = this.moduleRef.get(`${ItemClass.name}${tokenSuffix}`, { strict: false });
            if (definition) {
                endpoint.bind(definition);
                this.logger.debug(`Bound Restate ${type}: ${ItemClass.name}`);
            } else {
                this.logger.warn(`Failed to get definition for ${type}: ${ItemClass.name}`);
            }
        }
    };

    await processQueue(RestateModule.pendingServices, '_RestateService', 'service');
    await processQueue(RestateModule.pendingObjects, '_RestateVirtualObject', 'virtual object');
    await processQueue(RestateModule.pendingWorkflows, '_RestateWorkflow', 'workflow');

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

  static async forRoot(options: RestateRootOptions): Promise<DynamicModule> {
    const clientProvider: Provider = {
      provide: RESTATE_CLIENT,
      useValue: clients.connect({ url: options.url }),
    };

    if (!restateStarted) {
      restateStarted = true;
      restateConsoleUrl = options.consoleUrl || '';
      restateModuleHost = options.moduleHost;
      restateModuleProtocol = options.moduleProtocol;
      RestateModule.listenerPort = options.listenerPort || 9080;
      if (options.logger !== false) {
        endpoint.setLogger(createNestLoggerTransport(options.logger || undefined, options.loggerContext));
      }
      await endpoint.listen(RestateModule.listenerPort);
    }
    return Promise.resolve({
      module: RestateModule,
      providers: [clientProvider],
      exports: [clientProvider],
      global: true,
    });
  }

  static async forFeature(options: RestateModuleOptions): Promise<DynamicModule> {
    const providers: Provider[] = [];
    const exports: Provider[] = [];
    const { services, objects, workflows, imports = [], providers: additionalProviders = [] } = options;
    
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
