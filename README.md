# Restate Nest

A seamless integration between [Restate](https://restate.dev/) and [NestJS](https://nestjs.com/), making it easier to build reliable, stateful applications with the power of durable execution.

## Features

- **Declarative Service Registration**: Use decorators to define Restate services, virtual objects, and workflows
- **Type-Safe**: Full TypeScript support for better developer experience
- **Seamless Integration**: Works alongside your existing NestJS modules and services
- **Minimal Boilerplate**: Focus on business logic instead of infrastructure code

## Installation

```bash
npm install restate-nest @restatedev/restate-sdk @restatedev/restate-sdk-clients
```
## Peer Dependencies

- `@restatedev/restate-sdk-clients` (>=1.6.1)
- `@restatedev/restate-sdk` (>=1.6.1)
- `@nestjs/common` (^10.4.19 || ^11.0.0 || ^12.0.0)
- `reflect-metadata` (^0.1.12 || ^0.2.0)
## Prerequisites

- Node.js 16 or later (NestJS 12 requires Node.js 20 or later)
- NestJS 10.x, 11.x or 12.x
- Works with both CommonJS and ESM projects (NestJS 12 is ESM-only)
- A running Restate instance

## Quick Start

1. **Import the module** in your `app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { RestateModule } from 'restate-nest';

@Module({
  imports: [
    RestateModule.forRoot({
      url: 'http://localhost:8080', // Your Restate server URL
      listenerPort: 9080, // Optional: Port for the Restate listener
    }),
  ],
})
export class AppModule {}
```

2. **Create a Restate Service**:
```typescript
import { RestateService, RestateHandler } from 'restate-nest';

@RestateService('greeter')
export class GreeterService {
  @RestateHandler()
  async greet(ctx: restate.Context, name: string /** other args**/): Promise<string> {
    return `Hello, ${name}!`;
  }
}
```

3. **Register your services** in the module:

```typescript
@Module({
  imports: [RestateModule.forFeature({
    services: [GreeterService]
  })],
  providers: [GreeterService],
  // ... other module configuration
})
export class GreeterModule {}
```

## Advanced Usage

### Using Restate Client

For calling other Restate services, you can inject the `clients.Ingress` into your service.

```typescript
import {RESTATE_CLIENT} from 'restate-nest';
import {Inject} from '@nestjs/common';
import * as clients from '@restatedev/restate-sdk-clients';

@Service()
export class GreeterService {
  constructor(@Inject(RESTATE_CLIENT) private readonly restateClient: clients.Ingress) {}

  async hello(name: string): Promise<string> {
	  await this.restateClient.serviceClient<{
		  greet: (name: string) => Promise<boolean>;
	  }>({ name: 'greeter' as const }).greet()
  }
}
```
### Virtual Objects

```typescript
import { RestateObject, RestateHandler } from 'restate-nest';

@RestateObject()
export class Counter {
  private count: number = 0;

  @RestateHandler()
  async increment(ctx: restate.ObjectContext, amount: number = 1): Promise<number> {
    this.count += amount;
    return this.count;
  }
}
```

### Workflows

```typescript
import { RestateWorkflow, RestateHandler } from 'restate-nest';

@RestateWorkflow('order-processing')
export class OrderWorkflow {
  @RestateHandler()
  async run(ctx: restate.WorkflowSharedContext<any>, orderId: string): Promise<void> {
    // Your workflow logic here
    // Every workflow must have a "run" method
  }
  @RestateHandler()
  async getStaus(ctx: restate.WorkflowSharedContext<any>, orderId: string): Promise<void> {
    // Your workflow logic here
    // Every workflow must have a "run" method
  }
}
```

## Configuration

### Module Options

- `url`: (Required) The URL of your Restate server
- `listenerPort`: (Optional) Port for the Restate listener (default: 9080)
- `consoleUrl`: (Optional) Restate admin API URL, e.g. `http://localhost:9070`. When set, the app registers itself as a deployment on startup; otherwise nothing is registered
- `moduleHost`: (Optional) Host Restate uses to reach this app (default: `MODULE_HOST` env var, then `localhost`)
- `moduleProtocol`: (Optional) Protocol Restate uses to reach this app (default: `MODULE_PROTOCOL` env var, then `http`)
- `logger`: (Optional) A NestJS `LoggerService` for Restate logs (default: NestJS `Logger`). Pass `false` to keep the Restate SDK's console logger
- `loggerContext`: (Optional) Context name attached to Restate log entries (default: `"Restate"`)

### Logging

Restate SDK logs, including `ctx.console` output from your handlers, go through the NestJS logger by default:

| Restate level | NestJS method |
|---------------|---------------|
| `error`       | `error()`     |
| `warn`        | `warn()`      |
| `info`        | `log()`       |
| `debug`       | `debug()`     |
| `trace`       | `verbose()`   |

Logs emitted while an invocation is replaying are skipped. As with the SDK's default logger, levels below `RESTATE_LOGGING` (default `info`) are dropped, and NestJS's own `logLevels` filtering applies on top of that.

```typescript
RestateModule.forRoot({
  url: 'http://localhost:8080',
  logger: new MyCustomLogger(), // any LoggerService, or `false` to disable
  loggerContext: 'Workflows',
});
```

## Error Handling

All Restate-related errors will be properly propagated and can be caught using NestJS's exception filters.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. https://github.com/subenksaha/restate-nest

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
