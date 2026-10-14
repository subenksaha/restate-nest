# Restate Nest

A seamless integration between [Restate](https://restate.dev/) and [NestJS](https://nestjs.com/), making it easier to build reliable, stateful applications with the power of durable execution.

Write Restate services, virtual objects and workflows as ordinary NestJS classes with decorators. restate-nest creates them through NestJS dependency injection, binds them to a Restate endpoint, and gives you an injectable Restate client for calling them.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Services](#services)
- [Virtual Objects](#virtual-objects)
- [Workflows](#workflows)
- [Dependency Injection](#dependency-injection)
- [Calling Restate Services](#calling-restate-services)
- [Registering with Restate](#registering-with-restate)
- [Configuration](#configuration)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [API Reference](#api-reference)
- [Migrating from 1.x](#migrating-from-1x)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Declarative registration**: define services, virtual objects and workflows with `@RestateService`, `@RestateObject`, `@RestateWorkflow` and `@RestateHandler`
- **NestJS dependency injection**: handler classes are created by NestJS, so constructor injection works as usual
- **Injectable Restate client**: call any Restate service, object or workflow through `RESTATE_CLIENT`
- **Sync and async configuration**: `forRoot()` or `forRootAsync()` (e.g. with `ConfigService`)
- **Optional auto-registration**: register the deployment with Restate on startup
- **NestJS logging**: Restate SDK and `ctx.console` logs go through the NestJS logger
- **NestJS 10, 11 and 12**, in both CommonJS and ESM projects

## Requirements

| Dependency | Version |
|------------|---------|
| Node.js | 18.13 or later (20 or later for NestJS 12) |
| `@nestjs/common`, `@nestjs/core` | 10.4.19+, 11.x or 12.x |
| `@restatedev/restate-sdk`, `@restatedev/restate-sdk-clients` | 1.6.1 or later |
| `reflect-metadata` | 0.1.12+ or 0.2.x |
| Restate server | A running instance ([install guide](https://docs.restate.dev/develop/local_dev)) |

NestJS 12 is ESM-only. restate-nest ships both ESM and CommonJS builds and picks the right one automatically.

## Installation

```bash
npm install restate-nest @restatedev/restate-sdk @restatedev/restate-sdk-clients
```

`@nestjs/common`, `@nestjs/core` and `reflect-metadata` are already part of any NestJS project.

Your `tsconfig.json` needs the usual NestJS decorator settings:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Quick Start

**1. Start Restate** (in a separate terminal):

```bash
npx @restatedev/restate-server
```

**2. Configure the module** in `app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RestateModule } from 'restate-nest';
import { GreeterModule } from './greeter/greeter.module';

@Module({
  imports: [
    RestateModule.forRoot({
      url: 'http://localhost:8080',         // Restate ingress, used by the injected client
      listenerPort: 9080,                   // Port this app serves Restate handlers on
      consoleUrl: 'http://localhost:9070',  // Optional: register with Restate on startup
    }),
    GreeterModule,
  ],
})
export class AppModule {}
```

**3. Write a service**:

```typescript
import * as restate from '@restatedev/restate-sdk';
import { RestateService, RestateHandler } from 'restate-nest';

@RestateService('greeter')
export class GreeterService {
  @RestateHandler()
  async greet(ctx: restate.Context, name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
}
```

**4. Register it** with `forFeature()` in its feature module:

```typescript
import { Module } from '@nestjs/common';
import { RestateModule } from 'restate-nest';
import { GreeterService } from './greeter.service';

@Module({
  imports: [RestateModule.forFeature({ services: [GreeterService] })],
})
export class GreeterModule {}
```

**5. Start your app and call the handler** through Restate:

```bash
curl localhost:8080/greeter/greet --json '"Ada"'
# "Hello, Ada!"
```

## How It Works

1. `forRoot()` / `forRootAsync()` stores the configuration and provides `RESTATE_CLIENT`.
2. `forFeature()` registers each listed class as a NestJS provider, so NestJS creates it and injects its dependencies.
3. When the application bootstraps (`app.listen()`, `app.init()` or `NestFactory.createApplicationContext()`), restate-nest binds every service, object and workflow to the Restate endpoint, then starts the endpoint on `listenerPort`.
4. If `consoleUrl` is set, the app then registers itself with Restate. Otherwise, register it once yourself (see [Registering with Restate](#registering-with-restate)).

The Restate endpoint runs on its own port, independently of your HTTP adapter (Express or Fastify) and of any NestJS microservice transports. At startup you will see:

```
LOG [Restate] Restate SDK started listening on 9080...
LOG [RestateModule] Registered Restate services: greeter (service)
```

## Services

A service is a collection of stateless handlers.

```typescript
import * as restate from '@restatedev/restate-sdk';
import { RestateService, RestateHandler } from 'restate-nest';

@RestateService('greeter')
export class GreeterService {
  @RestateHandler()
  async greet(ctx: restate.Context, name: string): Promise<string> {
    // Durable side effect: runs once, even if the handler is retried
    const id = await ctx.run('generate-id', () => crypto.randomUUID());
    return `Hello, ${name}! (${id})`;
  }
}
```

- The name passed to `@RestateService()` is the service name in Restate. Without a name, the class name is used.
- Only methods annotated with `@RestateHandler()` become handlers. Other methods stay private to the class.
- Each handler receives the Restate context first, followed by its input.

## Virtual Objects

A virtual object is keyed and has durable, consistent state. Restate runs at most one exclusive handler per key at a time.

```typescript
import * as restate from '@restatedev/restate-sdk';
import { RestateObject, RestateHandler } from 'restate-nest';

@RestateObject()
export class Counter {
  @RestateHandler()
  async add(ctx: restate.ObjectContext, amount: number): Promise<number> {
    const count = ((await ctx.get<number>('count')) ?? 0) + amount;
    ctx.set('count', count);
    return count;
  }

  @RestateHandler()
  async get(ctx: restate.ObjectContext): Promise<number> {
    return (await ctx.get<number>('count')) ?? 0;
  }
}
```

- Virtual objects are registered under their class name (`Counter` above).
- Keep state in `ctx.get()` / `ctx.set()`, not in class fields. A single class instance serves all keys, and fields are not durable.

```bash
curl localhost:8080/Counter/user-1/add --json '5'
```

## Workflows

A workflow runs its `run` handler exactly once per workflow ID. Other handlers are shared handlers that can query or signal the running workflow.

```typescript
import * as restate from '@restatedev/restate-sdk';
import { RestateWorkflow, RestateHandler } from 'restate-nest';

@RestateWorkflow('order-processing')
export class OrderWorkflow {
  @RestateHandler()
  async run(ctx: restate.WorkflowContext, order: { id: string }): Promise<string> {
    await ctx.run('charge', () => this.charge(order.id));
    ctx.set('status', 'paid');
    return 'done';
  }

  @RestateHandler()
  async getStatus(ctx: restate.WorkflowSharedContext): Promise<string | null> {
    return ctx.get<string>('status');
  }

  // Not annotated, so not exposed to Restate
  private async charge(orderId: string): Promise<void> {
    // ...
  }
}
```

- The name passed to `@RestateWorkflow()` is the workflow name in Restate (`order-processing` above). Without a name, the class name is used.
- Every workflow needs a `run` handler annotated with `@RestateHandler()`. Startup fails with an error otherwise.
- Only annotated methods become handlers.

Register workflows under `workflows`:

```typescript
RestateModule.forFeature({ workflows: [OrderWorkflow] });
```

Classes are registered according to their decorator. A `@RestateWorkflow` class listed under `services` is still registered as a workflow, and a warning is logged.

```bash
curl localhost:8080/order-processing/order-42/run/send --json '{"id": "order-42"}'
curl localhost:8080/order-processing/order-42/getStatus
```

## Dependency Injection

Classes passed to `forFeature()` are NestJS providers, so they can inject other providers through their constructor:

```typescript
@RestateService('quotes')
export class QuoteService {
  constructor(private readonly pricing: PricingService) {}

  @RestateHandler()
  async quote(ctx: restate.Context, sku: string): Promise<number> {
    return ctx.run('price', () => this.pricing.priceFor(sku));
  }
}
```

The dependencies must be resolvable from the module that `forFeature()` creates. They can come from:

- **global modules**, e.g. `ConfigModule.forRoot({ isGlobal: true })`;
- **modules passed in `imports`**;
- **providers passed in `providers`**.

```typescript
@Module({
  imports: [
    RestateModule.forFeature({
      services: [QuoteService],
      imports: [PricingModule],     // exports PricingService
      providers: [QuoteFormatter],  // extra providers, also exported
    }),
  ],
})
export class QuotesModule {}
```

There is no need to also list the Restate classes in your module's `providers`. `forFeature()` already provides them.

Each class gets one instance, shared across all invocations. Keep per-invocation data in local variables and durable data in Restate state, not in class fields.

The bound Restate definitions are also exported under `<ClassName>_RestateService`, `<ClassName>_RestateVirtualObject` and `<ClassName>_RestateWorkflow`, in case you need them (for example to bind them to another endpoint).

## Calling Restate Services

`RESTATE_CLIENT` is a global [Restate ingress client](https://docs.restate.dev/develop/ts/clients) connected to `url`. You can pass the handler class as the type parameter to get typed calls:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import * as clients from '@restatedev/restate-sdk-clients';
import { RESTATE_CLIENT } from 'restate-nest';

@Injectable()
export class CheckoutService {
  constructor(@Inject(RESTATE_CLIENT) private readonly restate: clients.Ingress) {}

  async example() {
    // Service: request-response
    const greeting = await this.restate
      .serviceClient<GreeterService>({ name: 'greeter' })
      .greet('Ada');

    // Service: fire-and-forget
    await this.restate.serviceSendClient<GreeterService>({ name: 'greeter' }).greet('Ada');

    // Virtual object, keyed by 'user-1'
    const count = await this.restate
      .objectClient<Counter>({ name: 'Counter' }, 'user-1')
      .add(5);

    // Workflow, keyed by workflow ID
    const order = this.restate.workflowClient<Pick<OrderWorkflow, 'run' | 'getStatus'>>(
      { name: 'order-processing' },
      'order-42',
    );
    await order.workflowSubmit({ id: 'order-42' });
    const status = await order.getStatus();
    const result = await order.workflowAttach(); // waits for `run` to finish
  }
}
```

For workflows, pass the handler methods with `Pick<>` (as above). With the plain class type, `workflowSubmit` and `workflowAttach` are typed as `never`.

Inside a Restate handler, call other services through the context instead (`ctx.serviceClient(...)`, `ctx.objectClient(...)`) so that the calls are durable.

## Registering with Restate

Restate only sends requests to endpoints it knows about, so each deployment must be registered once. There are two options.

**Automatically**: set `consoleUrl` to the Restate admin API. After the endpoint starts, the app registers itself at `<moduleProtocol>://<moduleHost>:<listenerPort>`:

```typescript
RestateModule.forRoot({
  url: 'http://localhost:8080',
  consoleUrl: 'http://localhost:9070',
  moduleHost: 'my-service',  // how Restate reaches this app, e.g. a container hostname
});
```

**Manually**, with the Restate CLI:

```bash
npx @restatedev/restate deployments register http://localhost:9080
```

Without `consoleUrl`, nothing is registered automatically, and the startup log reminds you of the CLI command. After you change handlers, register the deployment again so that Restate picks up the changes.

## Configuration

### `forRoot()` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | (required) | Restate ingress URL used by `RESTATE_CLIENT` |
| `listenerPort` | `number` | `9080` | Port the Restate endpoint listens on |
| `consoleUrl` | `string` | (none) | Restate admin API URL, e.g. `http://localhost:9070`. When set, the app registers itself as a deployment on startup |
| `moduleHost` | `string` | `MODULE_HOST` env var, then `localhost` | Host Restate uses to reach this app (used for registration) |
| `moduleProtocol` | `string` | `MODULE_PROTOCOL` env var, then `http` | Protocol Restate uses to reach this app (used for registration) |
| `logger` | `LoggerService \| false` | NestJS `Logger` | Logger for Restate logs. `false` keeps the SDK's console logger |
| `loggerContext` | `string` | `"Restate"` | Context name attached to Restate log entries |

Call `forRoot()` or `forRootAsync()` once, in your root module. Only the first call configures the endpoint.

### `forRootAsync()`

Use `forRootAsync()` to build the options from other providers, such as `ConfigService`. It accepts the same options as `forRoot()`.

With a factory:

```typescript
import { ConfigModule, ConfigService } from '@nestjs/config';

RestateModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    url: config.getOrThrow('RESTATE_URL'),
    listenerPort: Number(config.get('RESTATE_PORT', 9080)),
    consoleUrl: config.get('RESTATE_CONSOLE_URL'),
  }),
});
```

With a class implementing `RestateOptionsFactory`:

```typescript
import { RestateOptionsFactory, RestateRootOptions } from 'restate-nest';

@Injectable()
export class RestateConfig implements RestateOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  createRestateOptions(): RestateRootOptions {
    return { url: this.config.getOrThrow('RESTATE_URL') };
  }
}

RestateModule.forRootAsync({ imports: [ConfigModule], useClass: RestateConfig });
```

| Option | Description |
|--------|-------------|
| `imports` | Modules that export the providers needed by the factory |
| `useFactory` | Function returning the options (or a promise of them) |
| `inject` | Providers passed to `useFactory` as arguments |
| `useClass` | Class implementing `RestateOptionsFactory`, created by restate-nest |
| `useExisting` | Existing `RestateOptionsFactory` provider to use |

The resolved options can be injected with the `RESTATE_MODULE_OPTIONS` token. `@nestjs/config` is not required. It's only used in these examples.

### `forFeature()` options

| Option | Type | Description |
|--------|------|-------------|
| `services` | `Type[]` | Classes decorated with `@RestateService` |
| `objects` | `Type[]` | Classes decorated with `@RestateObject` |
| `workflows` | `Type[]` | Classes decorated with `@RestateWorkflow` |
| `imports` | `any[]` | Modules whose exported providers the classes depend on |
| `providers` | `Provider[]` | Extra providers the classes depend on (also exported) |

`forFeature()` can be used in as many modules as you like.

## Logging

Restate SDK logs, including `ctx.console` output from your handlers, go through the NestJS logger by default:

| Restate level | NestJS method |
|---------------|---------------|
| `error`       | `error()`     |
| `warn`        | `warn()`      |
| `info`        | `log()`       |
| `debug`       | `debug()`     |
| `trace`       | `verbose()`   |

Each entry carries the invocation, e.g. `[greeter/greet][inv_1abc...] message`. Logs emitted while an invocation is replaying are skipped, so each message appears once.

Levels below `RESTATE_LOGGING` (default `info`) are dropped, as with the SDK's default logger. NestJS's own `logLevels` filtering then applies on top. To see debug logs, set `RESTATE_LOGGING=debug` and make sure NestJS's `logLevels` include `debug`.

```typescript
RestateModule.forRoot({
  url: 'http://localhost:8080',
  logger: new MyCustomLogger(), // any LoggerService, or `false` for the SDK's console logger
  loggerContext: 'Workflows',
});
```

`createNestLoggerTransport(logger?, context?)` is exported if you want to attach the same transport to your own Restate endpoint.

## Error Handling

Errors thrown in Restate handlers are handled by Restate, not by NestJS exception filters:

- **`TerminalError`** fails the invocation permanently and returns the error to the caller.
- **Any other error** is treated as transient, and Restate retries the invocation according to its retry policy.

```typescript
import { TerminalError } from '@restatedev/restate-sdk';

@RestateHandler()
async greet(ctx: restate.Context, name: string): Promise<string> {
  if (!name) {
    throw new TerminalError('name is required', { errorCode: 400 });
  }
  return `Hello, ${name}!`;
}
```

When you call Restate through `RESTATE_CLIENT`, a failed call rejects with an `HttpCallError` that you can handle as usual, for example in a NestJS exception filter.

## Testing

Handler classes are plain NestJS providers, so you can unit-test them with `Test.createTestingModule()` and a mocked Restate context:

```typescript
const moduleRef = await Test.createTestingModule({
  providers: [GreeterService],
}).compile();

const greeter = moduleRef.get(GreeterService);
const ctx = { run: (_name: string, fn: () => unknown) => fn() } as unknown as restate.Context;

expect(await greeter.greet(ctx, 'Ada')).toContain('Hello, Ada!');
```

For integration tests against a real Restate server, see Restate's [testing guide](https://docs.restate.dev/develop/ts/testing).

## API Reference

| Export | Description |
|--------|-------------|
| `RestateModule.forRoot(options)` | Configures Restate and provides `RESTATE_CLIENT` globally |
| `RestateModule.forRootAsync(options)` | Same as `forRoot()`, with options resolved through dependency injection |
| `RestateModule.forFeature(options)` | Registers services, virtual objects and workflows |
| `@RestateService(name)` | Marks a class as a Restate service |
| `@RestateObject()` | Marks a class as a Restate virtual object (named after the class) |
| `@RestateWorkflow(name)` | Marks a class as a Restate workflow |
| `@RestateHandler()` | Exposes a method as a Restate handler |
| `RESTATE_CLIENT` | Injection token for the Restate ingress client (`clients.Ingress`) |
| `RESTATE_MODULE_OPTIONS` | Injection token for the resolved `forRootAsync()` options |
| `RestateRootOptions` | Options type for `forRoot()` |
| `RestateRootAsyncOptions` | Options type for `forRootAsync()` |
| `RestateOptionsFactory` | Interface for `forRootAsync({ useClass })` |
| `createNestLoggerTransport(logger?, context?)` | Restate logger transport writing to a NestJS logger |
| `DEFAULT_LOGGER_CONTEXT` | Default logger context (`"Restate"`) |

## Migrating from 1.x

2.0 fixes how services are registered and makes handler classes real NestJS providers. Review these changes when upgrading:

1. **The endpoint starts when the app bootstraps.** In 1.x, `forRoot()` started listening immediately. Services registered after that point, for example with `forFeature()` in the same `imports` array as `forRoot()`, were never discovered by Restate. The endpoint now starts after all services are bound, during `app.listen()`, `app.init()` or `createApplicationContext()`.
2. **Handler classes are created by NestJS.** In 1.x they were created with `new`, without dependencies. Constructor dependencies must now be resolvable (see [Dependency Injection](#dependency-injection)). Remove the classes from your own module's `providers`; `forFeature()` provides them.
3. **Workflows use the name from `@RestateWorkflow()`.** In 1.x, workflows were registered under their class name. A workflow declared as `@RestateWorkflow('order-processing') class OrderWorkflow` is now `order-processing` instead of `OrderWorkflow`. Update clients, and let workflows still running under the old name finish before removing the old deployment.
4. **Only `@RestateHandler()` methods become workflow handlers.** In 1.x, every workflow method was exposed. Annotate `run` and any shared handlers with `@RestateHandler()`.
5. **Logs go through the NestJS logger.** Pass `logger: false` to keep the SDK's console output.
6. **New peer dependencies:** `@nestjs/core` and `reflect-metadata`. Both are already installed in NestJS projects.

New in 2.0: `forRootAsync()`, NestJS 12 support, optional auto-registration (`consoleUrl`), `forFeature({ imports, providers })`, and routing of classes by their decorator.

## Troubleshooting

**Restate doesn't show my services.**
Check the startup log for `Registered Restate services: ...`. If it is there, the endpoint is not registered with Restate yet: set `consoleUrl` or run `restate deployments register`. If the line is missing, check that the classes are listed in `forFeature()` and that the application is initialized.

**`Nest can't resolve dependencies of <YourService>`**
A constructor dependency of a Restate class is not visible in the `forFeature()` module. Add its module to `forFeature({ imports })`, or the provider to `forFeature({ providers })`.

**`RestateWorkflow X must implement a "run" method`**
Add a `run` method annotated with `@RestateHandler()`.

**Registration fails with a connection error.**
`consoleUrl` must point to the Restate admin API (port `9070` by default), and Restate must be able to reach the app at `moduleProtocol://moduleHost:listenerPort`. In Docker or Kubernetes, set `moduleHost` (or `MODULE_HOST`) to the app's hostname.

**`EADDRINUSE` on port 9080.**
Another process (or another instance of the app) is using the port. Change `listenerPort`.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request at https://github.com/subenksaha/restate-nest.

```bash
npm install
npm test        # run the test suite
npm run build   # build ESM and CommonJS bundles into dist/
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
