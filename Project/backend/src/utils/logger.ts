// Structured JSON logging (pino). On Cloud Run, stdout JSON with `severity`
// and `message` fields becomes structured Cloud Logging entries with the right
// level. LOG_FORMAT=pretty prints readable lines for local development.
import { pino, type LoggerOptions } from 'pino';

const CLOUD_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL'
};

// Never write credentials or personal secrets to logs.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-goog-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.otp',
  '*.code',
  '*.token',
  '*.phoneToken'
];

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  messageKey: 'message',
  base: null,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  formatters: {
    level: (label) => ({ severity: CLOUD_SEVERITY[label] || 'DEFAULT' })
  }
};

export const logger = process.env.LOG_FORMAT === 'pretty'
  ? pino({ ...loggerOptions, formatters: {}, transport: { target: 'pino-pretty', options: { messageKey: 'message', ignore: 'pid,hostname' } } })
  : pino(loggerOptions);
