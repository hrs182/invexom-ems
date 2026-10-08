/**
 * Professional error handling for the main process.
 *
 * The renderer must NEVER show raw system errors (ENOENT, SQLITE_*,
 * stack traces, local file paths) to the user. Every IPC failure is
 * mapped to { code, message } where:
 *  - `code`    is a stable, machine-readable token. The renderer may
 *              branch on well-known codes (e.g. 'duplicate-found').
 *  - `message` is safe to display. It contains no paths or stacks.
 * The original technical text is available via errorDetail() for a
 * "copy details" support affordance — never shown by default.
 */

/** Friendly messages for error codes the app throws intentionally. */
const FRIENDLY: Record<string, string> = {
  'already-initialized':
    'Setup has already been completed on this device. Please log in instead.',
  'institution-name-required':
    'Please enter your institution\u2019s name to continue.',
  'admin-credentials-invalid':
    'Please choose a username and a password with at least 8 characters.',
  'not-authenticated':
    'Your session has expired. Please log in again.',
  'not-initialized':
    'This device has not been set up yet. Please complete the setup first.',
  'admin-required':
    'Only an administrator can perform this action.',
  'admin-password-invalid':
    'The administrator password you entered is incorrect.',
  'database-not-open':
    'The database is not open. Please restart the app and try again.',
  'unknown-user':
    'We could not find that user on this device.',
  'bad-password':
    'The password you entered is incorrect.',
  'no-recovery':
    'No security question is set for this user on this device.',
  'bad-answer':
    'That answer does not match our records. Please try again.',
  'recovery-question-required':
    'Please choose a security question — it is your only way back in if you forget the password.',
  'recovery-answer-required':
    'Please answer the security question (at least 3 characters).',
  'corrupt vault file':
    'Your data file appears to be damaged. Please restore from a backup, or contact support.',
  // Codes the renderer branches on: keep the code, it shows its own UI.
  'duplicate-found': 'duplicate-found',
  'cancelled': 'cancelled',
};

/** Filesystem errors -> friendly text, never raw paths. */
const FS_FRIENDLY: Record<string, { code: string; message: string }> = {
  ENOENT: {
    code: 'file-not-found',
    message:
      'A required file or folder is missing — it may have been moved or deleted. Please try again, or restore from a backup.',
  },
  EACCES: {
    code: 'file-access-denied',
    message:
      'EMS was denied access to its data folder. Please run the app as administrator, or check your antivirus / ransomware-protection settings, then try again.',
  },
  EPERM: {
    code: 'file-access-denied',
    message:
      'EMS was denied access to its data folder. Please run the app as administrator, or check your antivirus / ransomware-protection settings, then try again.',
  },
  EBUSY: {
    code: 'file-busy',
    message:
      'A data file is in use by another program. Please close other programs and try again.',
  },
  ENOSPC: {
    code: 'disk-full',
    message:
      'There is not enough disk space to save your data. Please free up some space and try again.',
  },
  EMFILE: {
    code: 'too-many-files',
    message:
      'The system ran out of file handles. Please restart the app and try again.',
  },
  ENFILE: {
    code: 'too-many-files',
    message:
      'The system ran out of file handles. Please restart the app and try again.',
  },
};

const DB_MESSAGE =
  'The database reported a problem and the action was stopped safely. Your existing data is untouched — please try again, and contact support if it keeps happening.';

const FALLBACK_MESSAGE =
  'Something went wrong. Your existing data is safe. Please try again — if it keeps happening, copy the technical details and contact support.';

export interface UserError {
  /** Stable machine-readable token. */
  code: string;
  /** Display-safe message (no paths, no stacks). */
  message: string;
}

/** Map any thrown value to a display-safe { code, message }. */
export function toUserError(e: unknown): UserError {
  const raw = e instanceof Error ? e.message : String(e ?? '');

  // 1. Intentional app codes with curated messages.
  if (Object.prototype.hasOwnProperty.call(FRIENDLY, raw)) {
    return { code: raw, message: FRIENDLY[raw] };
  }

  const errno = (e as { code?: unknown } | null)?.code;

  // 2. Filesystem errors.
  if (typeof errno === 'string' && FS_FRIENDLY[errno]) {
    const f = FS_FRIENDLY[errno];
    return { code: f.code, message: f.message };
  }

  // 3. SQLite errors (better-sqlite3 sets .code like SQLITE_CORRUPT).
  if (
    (typeof errno === 'string' && errno.startsWith('SQLITE_')) ||
    /SQLITE_[A-Z_]+/.test(raw)
  ) {
    return { code: 'database-error', message: DB_MESSAGE };
  }

  // 4. Anything else: generic, never leak the raw text.
  return { code: 'unexpected-error', message: FALLBACK_MESSAGE };
}

/**
 * Raw technical detail for support ("copy details" affordance).
 * Message only — never a stack trace, never shown by default.
 */
export function errorDetail(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e ?? 'unknown error');
}
