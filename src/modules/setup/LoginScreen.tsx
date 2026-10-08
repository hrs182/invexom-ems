import * as React from 'react';
import { invoke, errText, errDetail } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { useApp } from '../../stores/app';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input, Field } from '../../components/ui/input';
import { Logo } from '../../components/ui/sidebar';
import { Alert } from '../../components/ui/feedback';
import { Dialog } from '../../components/ui/dialog';

/** Password reset via the security question set during setup. */
function RecoveryDialog({ open, onOpenChange, initialUsername }: {
  open: boolean; onOpenChange: (open: boolean) => void; initialUsername: string;
}) {
  const { boot } = useApp();
  const [username, setUsername] = React.useState(initialUsername);
  const [phase, setPhase] = React.useState<'ask' | 'answer'>('ask');
  const [question, setQuestion] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [errorDetailText, setErrorDetailText] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUsername(initialUsername);
      setPhase('ask'); setQuestion(''); setAnswer('');
      setNewPassword(''); setConfirm(''); setError(''); setErrorDetailText(''); setCopied(false);
    }
  }, [open, initialUsername]);

  const checkQuestion = async () => {
    setBusy(true); setError(''); setErrorDetailText(''); setCopied(false);
    try {
      const r = await invoke('auth:recoveryQuestion', { username: username.trim() });
      if (!r.ok) { setError(errText(r)); setErrorDetailText(errDetail(r)); return; }
      if (!r.question) { setError(t('auth.noRecovery')); return; }
      setQuestion(r.question);
      setPhase('answer');
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (newPassword.length < 8) { setError(t('auth.passwordTooShort')); return; }
    if (newPassword !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setBusy(true); setError(''); setErrorDetailText(''); setCopied(false);
    try {
      const r = await invoke('auth:recoverAccess', { username: username.trim(), answer, newPassword });
      if (!r.ok) { setError(errText(r)); setErrorDetailText(errDetail(r)); return; }
      onOpenChange(false);
      await boot();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('auth.recoveryTitle')} description={t('auth.recoverySubtitle')}>
      <div className="flex flex-col gap-4">
        {error && (
          <Alert tone="danger">
            <p>{error}</p>
            {errorDetailText && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(errorDetailText);
                      setCopied(true);
                    } catch { /* clipboard unavailable */ }
                  }}
                >
                  {copied ? t('setup.detailsCopied') : t('setup.copyDetails')}
                </Button>
              </div>
            )}
          </Alert>
        )}
        {phase === 'ask' ? (
          <>
            <Field label={t('auth.username')} required>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </Field>
            <Button onClick={checkQuestion} loading={busy} disabled={!username.trim()}>{t('auth.recoveryCheck')}</Button>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-xs text-faint">{t('auth.recoveryQuestion')}</p>
              <p className="mt-1 text-sm font-medium">{question}</p>
            </div>
            <Field label={t('auth.recoveryAnswer')} required>
              <Input value={answer} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t('auth.newPassword')} required>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label={t('auth.confirmPassword')} required>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPhase('ask')}>{t('common.back')}</Button>
              <Button onClick={reset} loading={busy} disabled={!answer.trim() || !newPassword || !confirm}>
                {t('auth.resetPassword')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Unlock screen: shown at boot when the vault is locked (or after auto-lock). */
export function LoginScreen() {
  const { login, status } = useApp();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [errorDetailText, setErrorDetailText] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [recoverOpen, setRecoverOpen] = React.useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError(''); setErrorDetailText(''); setCopied(false);
    const r = await login(username.trim(), password);
    // Friendly display-safe message; raw technical detail stays behind a copy button.
    if (!r.ok) { setError(errText(r)); setErrorDetailText(errDetail(r)); }
    setBusy(false);
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo size={52} />
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">{t('app.name')}</h1>
              <p className="text-[13px] text-muted">{t('auth.subtitle')}</p>
            </div>
          </div>
          {status?.license.mode === 'demo' && (
            <Alert tone="warning" className="mb-4">
              {t('license.modeDemo')} · {t('license.daysLeft', { n: status.license.demoDaysLeft ?? 0 })}
            </Alert>
          )}
          <form onSubmit={submit} className="flex flex-col gap-4">
            {error && (
              <Alert tone="danger">
                <p>{error}</p>
                {errorDetailText && (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(errorDetailText);
                          setCopied(true);
                        } catch { /* clipboard unavailable */ }
                      }}
                    >
                      {copied ? t('setup.detailsCopied') : t('setup.copyDetails')}
                    </Button>
                  </div>
                )}
              </Alert>
            )}
            <Field label={t('auth.username')} required>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </Field>
            <Field label={t('auth.password')} required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Button type="submit" loading={busy} size="lg" className="w-full">{t('auth.signIn')}</Button>
            <button
              type="button"
              onClick={() => setRecoverOpen(true)}
              className="self-center text-[13px] font-medium text-accent hover:underline"
            >
              {t('auth.forgotPassword')}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-faint">{t('app.by')}</p>
        </CardContent>
      </Card>
      <RecoveryDialog open={recoverOpen} onOpenChange={setRecoverOpen} initialUsername={username} />
    </div>
  );
}
