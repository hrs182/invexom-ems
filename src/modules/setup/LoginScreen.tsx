import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { useApp } from '../../stores/app';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input, Field } from '../../components/ui/input';
import { Logo } from '../../components/ui/sidebar';
import { Alert } from '../../components/ui/feedback';

/** Unlock screen: shown at boot when the vault is locked (or after auto-lock). */
export function LoginScreen() {
  const { login, status } = useApp();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const r = await login(username.trim(), password);
    if (!r.ok) setError(r.error || t('auth.invalid'));
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
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label={t('auth.username')} required>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </Field>
            <Field label={t('auth.password')} required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Button type="submit" loading={busy} size="lg" className="w-full">{t('auth.signIn')}</Button>
          </form>
          <p className="mt-4 text-center text-xs text-faint">{t('app.by')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
