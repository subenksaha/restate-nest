import { DynamicModule, Module, Provider, OnApplicationBootstrap, Logger } from "@nestjs/common";
import { ModuleRef } from '@nestjs/core';
import { createService, createVirtualObject, createWorkflow } from './decorators';
import * as clients from "@restatedev/restate-sdk-clients"
import { endpoint } from './endpoint';
export {RestateService, RestateWorkflow, RestateObject, RestateHandler } from './decorators'
import { ConfigService } from '@nestjs/config';

interface RestateModuleOptions {
  services?: Function[];
  objects?: Function[];
  workflows?: Function[];
  imports?: any[];
  providers?: Provider[];
}

export const RESTATE_CLIENT = 'RESTATE_CLIENT';

let restateStarted = false;
let restateConsoleUrl = '';
@Module({})
export class RestateModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(RestateModule.name);
  private static pendingServices: Function[] = [];
  private static pendingObjects: Function[] = [];
  private static pendingWorkflows: Function[] = [];
  private static listenerPort: number;
  private static deploymentRegistered = false;

  constructor(private readonly moduleRef: ModuleRef, private readonly configService: ConfigService) {}

  async onApplicationBootstrap() {
    this.logger.debug('=== RestateModule.onApplicationBootstrap() STARTED ===');

    const moduleProtocol = this.configService.get('MODULE_PROTOCOL') || 'http';
    const moduleHost = this.configService.get('MODULE_HOST') || 'localhost';
    const moduleRestateUrl = `${moduleProtocol}://${moduleHost}:${RestateModule.listenerPort}`;

    const processQueue = async (items: Function[], createHandler: (instance: any) => any, type: string) => {
        for (const ItemClass of items) {
            const instance = this.moduleRef.get(ItemClass, { strict: false });
            if (instance) {
                const handler = createHandler(instance);
                endpoint.bind(handler);
                this.logger.debug(`Bound Restate ${type}: ${ItemClass.name}`);
            } else {
                this.logger.warn(`Failed to get instance for ${type}: ${ItemClass.name}`);
            }
        }
    };

    await processQueue(RestateModule.pendingServices, createService, 'service');
    await processQueue(RestateModule.pendingObjects, createVirtualObject, 'virtual object');
    await processQueue(RestateModule.pendingWorkflows, createWorkflow, 'workflow');

    // Register deployment only if there are services/objects/workflows and it hasn't been done yet
    const hasHandlers = RestateModule.pendingServices.length > 0 || RestateModule.pendingObjects.length > 0 || RestateModule.pendingWorkflows.length > 0;
    if (hasHandlers && !RestateModule.deploymentRegistered) {
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

  static async forRoot(options: { url: string, consoleUrl: string, listenerPort?: number }): Promise<DynamicModule> {
    const clientProvider: Provider = {
      provide: RESTATE_CLIENT,
      useValue: clients.connect({ url: options.url }),
    };
    
    if (!restateStarted) {
      restateStarted = true;
      restateConsoleUrl = options.consoleUrl || 'http://localhost:9070';
      RestateModule.listenerPort = options.listenerPort || 9080;
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
          useFactory: () => null, // Placeholder - actual binding happens in lifecycle hook
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
          useFactory: () => null, // Placeholder - actual binding happens in lifecycle hook
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
          useFactory: () => null, // Placeholder - actual binding happens in lifecycle hook
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
