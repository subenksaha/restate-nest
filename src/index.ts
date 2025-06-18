import { DynamicModule, Module, Provider } from "@nestjs/common";
import { createService, createVirtualObject, createWorkflow } from './decorators';
import * as clients from "@restatedev/restate-sdk-clients"
import { endpoint } from './endpoint';
export {RestateService, RestateWorkflow, RestateObject, RestateHandler } from './decorators'

interface RestateModuleOptions {
  services?: Function[];
  objects?: Function[];
  workflows?: Function[];
}

export const RESTATE_CLIENT = 'RESTATE_CLIENT';

let restateStarted = false;

@Module({})
export class RestateModule {
  static async forRoot(options: { url: string, listenerPort?: number }): Promise<DynamicModule> {
    const clientProvider: Provider = {
      provide: RESTATE_CLIENT,
      useValue: clients.connect({ url: options.url }),
    };
    
    if (!restateStarted) {
      restateStarted = true;
      await endpoint.listen(options.listenerPort || 9080);
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
    const { services, objects, workflows } = options;
    
    if (!!services){
      const serviceProviders: Provider[] = services.map((ServiceClass) => {
        const instance = new (ServiceClass as any)();
        const service = createService(instance);
        endpoint.bind(service)
        const serviceToken = `${ServiceClass.name}_RestateService`;
        
        return {
          provide: serviceToken,
          useValue: service,
        } as Provider;
      });
      providers.push(...serviceProviders);
      exports.push(...serviceProviders);
    }
    
    if (!!objects){
      const virtualObjectProviders: Provider[] = objects.map((ObjectClass) => {
        const instance = new (ObjectClass as any)();
        const virtualObject = createVirtualObject(instance);
        endpoint.bind(virtualObject)
        const virtualToken = `${ObjectClass.name}_RestateVirtualObject`;
        
        return {
          provide: virtualToken,
          useValue: virtualObject,
        };
      });
      providers.push(...virtualObjectProviders);
      exports.push(...virtualObjectProviders)
    }
    
    if (!!workflows){
      const workflowProviders: Provider[] = workflows.map((WorkflowClass) => {
        const instance = new (WorkflowClass as any)();
        const wf = createWorkflow(instance);
        endpoint.bind(wf);
        return { provide: `${WorkflowClass.name}_RestateWorkflow`, useValue: wf };
      });

      providers.push(...workflowProviders);
      exports.push(...workflowProviders)
    }
    
    return {
      module: RestateModule,
      providers: providers,
      exports: exports,
    };
  }
}
