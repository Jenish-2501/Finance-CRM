// Centralized production-safe logger for the Electron main process.
// Sensitive values are redacted; verbose only in development.

const SENSITIVE_KEYS = new Set([
  'password',
  'passcode',
  'token',
  'auth',
  'authorization',
  'secret',
  'pan',
  'bank_account_number',
  'account_number',
  'ifsc',
  'gst_number',
  'gstin',
  'mobile',
  'email',
]);

function redact(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) return '[redacted]';
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }
  return value;
}

function emit(level: 'info' | 'warn' | 'error', event: string, details?: unknown): void {
  const payload = details === undefined ? '' : ` ${JSON.stringify(redact(details))}`;
  const line = `[main:${level}] ${event}${payload}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.NODE_ENV !== 'production') console.log(line);
}

export const logger = {
  info: (event: string, details?: unknown) => emit('info', event, details),
  warn: (event: string, details?: unknown) => emit('warn', event, details),
  error: (event: string, details?: unknown) => emit('error', event, details),
};
