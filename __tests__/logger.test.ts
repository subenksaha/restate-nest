import * as restate from '@restatedev/restate-sdk';

// @nestjs/common v12 is ESM-only, which Jest (CommonJS) cannot load
const defaultLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() };
jest.mock('@nestjs/common', () => ({ Logger: jest.fn(() => defaultLogger) }));

import { createNestLoggerTransport, DEFAULT_LOGGER_CONTEXT } from '../src/logger';

const meta = (level: string, extra: Partial<restate.LogMetadata> = {}) =>
  ({ source: 'SYSTEM', level, replaying: false, ...extra }) as restate.LogMetadata;

const mockLogger = () => ({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() });

describe('createNestLoggerTransport', () => {
  const originalLevel = process.env.RESTATE_LOGGING;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESTATE_LOGGING;
  });

  afterAll(() => {
    if (originalLevel === undefined) delete process.env.RESTATE_LOGGING;
    else process.env.RESTATE_LOGGING = originalLevel;
  });

  it('maps Restate levels to NestJS logger methods', () => {
    process.env.RESTATE_LOGGING = 'trace';
    const logger = mockLogger();
    const transport = createNestLoggerTransport(logger);

    transport(meta('error'), 'e');
    transport(meta('warn'), 'w');
    transport(meta('debug'), 'd');
    transport(meta('trace'), 't');
    transport(meta('info'), 'i');

    expect(logger.error).toHaveBeenCalledWith('e', DEFAULT_LOGGER_CONTEXT);
    expect(logger.warn).toHaveBeenCalledWith('w', DEFAULT_LOGGER_CONTEXT);
    expect(logger.debug).toHaveBeenCalledWith('d', DEFAULT_LOGGER_CONTEXT);
    expect(logger.verbose).toHaveBeenCalledWith('t', DEFAULT_LOGGER_CONTEXT);
    expect(logger.log).toHaveBeenCalledWith('i', DEFAULT_LOGGER_CONTEXT);
  });

  it('skips logs emitted during replay', () => {
    const logger = mockLogger();
    createNestLoggerTransport(logger)(meta('info', { replaying: true }), 'replayed');
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('drops levels below RESTATE_LOGGING (default info)', () => {
    const logger = mockLogger();
    const transport = createNestLoggerTransport(logger);
    transport(meta('debug'), 'd');
    transport(meta('trace'), 't');
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.verbose).not.toHaveBeenCalled();

    process.env.RESTATE_LOGGING = 'WARN';
    createNestLoggerTransport(logger)(meta('info'), 'i');
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('uses a custom context and formats args and invocation context', () => {
    const logger = mockLogger();
    const context = {
      invocationTarget: 'greeter/greet',
      invocationId: 'inv_1',
      additionalContext: { tenant: 'acme' },
    } as unknown as restate.LoggerContext;

    createNestLoggerTransport(logger, 'Workflows')(meta('info', { context }), 'hello %s', 'world', { a: 1 });

    expect(logger.log).toHaveBeenCalledWith("[greeter/greet][inv_1][tenant: acme] hello world { a: 1 }", 'Workflows');
  });

  it('falls back to log() when debug/verbose are not implemented', () => {
    process.env.RESTATE_LOGGING = 'trace';
    const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const transport = createNestLoggerTransport(logger);
    transport(meta('debug'), 'd');
    transport(meta('trace'), 't');
    expect(logger.log).toHaveBeenNthCalledWith(1, 'd', DEFAULT_LOGGER_CONTEXT);
    expect(logger.log).toHaveBeenNthCalledWith(2, 't', DEFAULT_LOGGER_CONTEXT);
  });

  it('defaults to the NestJS Logger', () => {
    createNestLoggerTransport()(meta('info'), 'i');
    expect(defaultLogger.log).toHaveBeenCalledWith('i', DEFAULT_LOGGER_CONTEXT);
  });
});
