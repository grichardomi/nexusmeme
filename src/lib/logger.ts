import winston from 'winston';
import 'winston-daily-rotate-file';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';
const isServer = typeof window === 'undefined';

// Production: warn+  (Railway charges per log byte — info/debug = wasted spend)
// Development: info+ (full visibility locally)
const logLevel = (process.env.LOG_LEVEL as LogLevel) ?? (isProduction ? 'warn' : 'info');

// JSON format for structured log parsing (Railway, Datadog, etc.)
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: !isProduction }), // strip stack traces in prod (verbose, costs $)
  winston.format.json()
);

// Pretty format for local terminal readability
const prettyFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

const transports: winston.transport[] = [];

if (isServer) {
  // Always: stdout transport (Railway captures this as its log stream)
  transports.push(
    new winston.transports.Console({
      format: isProduction ? jsonFormat : prettyFormat,
    })
  );

  if (!isProduction) {
    // Local dev only: daily rotating files — Railway is ephemeral, file writes are wasteful there
    // Combined log: all levels, 7-day retention, 20MB max per file
    transports.push(
      new (winston.transports as any).DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '7d',        // auto-purge files older than 7 days
        maxSize: '20m',        // rotate if file exceeds 20MB
        level: logLevel,
        format: jsonFormat,
        zippedArchive: true,   // compress rotated files to save disk
      })
    );

    // Error-only log: permanent until purged — useful for post-mortem
    transports.push(
      new (winston.transports as any).DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',       // keep error logs 14 days (longer for debugging)
        maxSize: '10m',
        level: 'error',
        format: jsonFormat,
        zippedArchive: true,
      })
    );
  }
}

const winstonLogger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: 'nexusmeme' },
  transports,
  // Prevent unhandled exception noise from crashing the process
  exitOnError: false,
});

// Wrapper preserving the existing API used throughout the codebase
class Logger {
  debug(message: string, context?: Record<string, any>): void {
    winstonLogger.debug(message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    winstonLogger.info(message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    winstonLogger.warn(message, context);
  }

  error(message: string, error?: Error | null, context?: Record<string, any>): void {
    winstonLogger.error(message, {
      ...context,
      ...(error && { errorMessage: error.message, errorStack: error.stack }),
    });
  }
}

export const logger = new Logger();

export function logTradeExecution(userId: string, pair: string, context: Record<string, any>): void {
  logger.info('Trade executed', { userId, pair, ...context });
}

export function logRegimeDecision(regime: string, shouldExecute: boolean, reason: string): void {
  if (!shouldExecute) {
    logger.warn('Trade execution blocked by regime gatekeeper', { regime, reason });
  } else {
    logger.debug('Regime check passed', { regime, reason });
  }
}

export function logApiCall(
  exchange: string,
  endpoint: string,
  method: string,
  durationMs: number,
  status: number
): void {
  logger.debug('API call', { exchange, endpoint, method, durationMs, status });
}

export function logAuthEvent(
  event: 'signup' | 'signin' | 'signout' | 'password_reset',
  userId: string,
  email: string
): void {
  logger.info('Authentication event', { event, userId, email });
}

export function logBillingEvent(
  event: 'subscription_created' | 'subscription_updated' | 'payment_failed',
  userId: string,
  context: Record<string, any>
): void {
  logger.info('Billing event', { event, userId, ...context });
}

export function logEmailSent(userId: string, emailType: string, recipient: string): void {
  logger.info('Email sent', { userId, emailType, recipient });
}
