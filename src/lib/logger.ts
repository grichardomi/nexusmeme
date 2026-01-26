export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const getLogLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL;
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

class Logger {
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = getLogLevel();
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  private formatOutput(level: LogLevel, message: string, context?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    return JSON.stringify({
      level,
      timestamp,
      message,
      ...(context || {}),
    });
  }

  debug(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog('debug')) return;
    console.log(this.formatOutput('debug', message, context));
  }

  info(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog('info')) return;
    console.log(this.formatOutput('info', message, context));
  }

  warn(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatOutput('warn', message, context));
  }

  error(message: string, error?: Error | null, context?: Record<string, any>): void {
    if (!this.shouldLog('error')) return;
    const errorContext = {
      ...context,
      ...(error && {
        errorMessage: error.message,
        errorStack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      }),
    };
    console.error(this.formatOutput('error', message, errorContext));
  }
}

export const logger = new Logger();

/**
 * Log trade execution
 */
export function logTradeExecution(userId: string, pair: string, context: any): void {
  logger.info('Trade executed', {
    userId,
    pair,
    ...context,
  });
}

/**
 * Log regime decision
 */
export function logRegimeDecision(regime: string, shouldExecute: boolean, reason: string): void {
  if (!shouldExecute) {
    logger.warn('Trade execution blocked by regime gatekeeper', {
      regime,
      reason,
    });
  } else {
    logger.debug('Regime check passed', {
      regime,
      reason,
    });
  }
}

/**
 * Log API call
 */
export function logApiCall(
  exchange: string,
  endpoint: string,
  method: string,
  durationMs: number,
  status: number
): void {
  logger.debug('API call', {
    exchange,
    endpoint,
    method,
    durationMs,
    status,
  });
}

/**
 * Log authentication event
 */
export function logAuthEvent(
  event: 'signup' | 'signin' | 'signout' | 'password_reset',
  userId: string,
  email: string
): void {
  logger.info('Authentication event', {
    event,
    userId,
    email,
  });
}

/**
 * Log billing event
 */
export function logBillingEvent(
  event: 'subscription_created' | 'subscription_updated' | 'payment_failed',
  userId: string,
  context: any
): void {
  logger.info('Billing event', {
    event,
    userId,
    ...context,
  });
}

/**
 * Log email sent
 */
export function logEmailSent(userId: string, emailType: string, recipient: string): void {
  logger.info('Email sent', {
    userId,
    emailType,
    recipient,
  });
}
