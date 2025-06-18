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
- `@nestjs/common` (>=10.4.19)
## Prerequisites

- Node.js 16 or later
- NestJS 10.x
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

## Error Handling

All Restate-related errors will be properly propagated and can be caught using NestJS's exception filters.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
