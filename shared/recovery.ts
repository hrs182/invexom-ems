/**
 * Stable ids for the security questions offered during setup for password
 * recovery. The human-readable text lives in i18n (`auth.<id>`); the id is
 * what gets stored and what the recovery secret is derived from, so the text
 * can change without breaking recovery.
 */
export const RECOVERY_QUESTION_IDS = [
  'secQ1',
  'secQ2',
  'secQ3',
  'secQ4',
  'secQ5',
  'secQ6',
] as const;

export type RecoveryQuestionId = (typeof RECOVERY_QUESTION_IDS)[number];

export function isRecoveryQuestionId(v: unknown): v is RecoveryQuestionId {
  return typeof v === 'string' && (RECOVERY_QUESTION_IDS as readonly string[]).includes(v);
}
