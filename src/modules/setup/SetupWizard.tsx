import * as React from 'react';
import { invoke, openFile } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { useApp } from '../../stores/app';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input, Textarea, Field } from '../../components/ui/input';
import { Logo } from '../../components/ui/sidebar';
import { ProgressBar, Alert } from '../../components/ui/feedback';
import type { SetupPayload } from '@shared/types';

const PRESET_HEADS = [
  { key: 'tuition', type: 'periodic' as const },
  { key: 'transport', type: 'periodic' as const },
  { key: 'exam', type: 'periodic' as const },
  { key: 'admission', type: 'one-time' as const },
  { key: 'annual', type: 'periodic' as const },
];
const PRESET_HEAD_NAMES = ['Tuition Fee', 'Transport Fee', 'Exam Fee', 'Admission Fee', 'Annual Charges'];

export function SetupWizard() {
  const { boot } = useApp();
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const [institution, setInstitution] = React.useState({ name: '', address: '', phone: '', email: '', upiId: '', principalName: '', regNo: '' });
  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null);
  const [session, setSession] = React.useState({ name: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31' });
  const [classes, setClasses] = React.useState<{ name: string; sections: string }[]>([
    { name: 'Nursery', sections: '' }, { name: 'LKG', sections: '' }, { name: 'UKG', sections: '' },
    { name: 'I', sections: 'A, B' }, { name: 'II', sections: 'A, B' },
  ]);
  const [admin, setAdmin] = React.useState({ username: 'admin', displayName: 'Administrator', password: '', confirm: '' });
  const [heads, setHeads] = React.useState<{ name: string; type: 'one-time' | 'periodic' | 'optional'; on: boolean }[]>(
    PRESET_HEAD_NAMES.map((name, i) => ({ name, type: PRESET_HEADS[i].type, on: i < 3 })),
  );
  const [customHead, setCustomHead] = React.useState('');

  const set = <K extends object>(setter: React.Dispatch<React.SetStateAction<K>>, k: keyof K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setter((p) => ({ ...p, [k]: e.target.value }));

  const canNext = () => {
    if (step === 0) return institution.name.trim().length > 0;
    if (step === 3) return admin.username.trim().length > 0 && admin.password.length >= 8 && admin.password === admin.confirm;
    return true;
  };

  const pickLogo = async () => {
    const p = await openFile({ title: t('setup.logo'), filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
    if (p) setLogoDataUrl(p); // main process copies the file into the assets dir
  };

  const finish = async () => {
    setBusy(true); setError('');
    try {
      const payload: SetupPayload = {
        institution,
        logoDataUrl,
        session,
        classes: classes.filter((c) => c.name.trim()).map((c) => ({
          name: c.name.trim(), sections: c.sections.split(',').map((s) => s.trim()).filter(Boolean),
        })),
        admin: { username: admin.username.trim(), displayName: admin.displayName.trim(), password: admin.password },
        feeHeads: heads.filter((h) => h.on && h.name.trim()).map((h) => ({ name: h.name.trim(), type: h.type, defaultAmount: 0 })),
      };
      const r = await invoke('setup:complete', payload);
      if (!r.ok) setError(r.error);
      else await boot();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const steps = [t('setup.s1Title'), t('setup.s2Title'), t('setup.s3Title'), t('setup.s4Title'), t('setup.s5Title')];

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <Logo size={44} />
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">{t('setup.title')}</h1>
              <p className="text-[13px] text-muted">{t('setup.subtitle')}</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="font-medium text-muted">{t('setup.step', { n: step + 1 })}</span>
              <span className="text-faint">{steps[step]}</span>
            </div>
            <ProgressBar value={(step + 1) * 20} />
          </div>

          {error && <Alert tone="danger" className="mb-4">{t('setup.completeError', { error })}</Alert>}

          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Field label={t('setup.schoolName')} required><Input value={institution.name} onChange={set(setInstitution, 'name')} autoFocus /></Field>
              <Field label={t('setup.address')}><Textarea value={institution.address} onChange={set(setInstitution, 'address')} rows={2} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('setup.phone')}><Input value={institution.phone} onChange={set(setInstitution, 'phone')} /></Field>
                <Field label={t('setup.email')}><Input type="email" value={institution.email} onChange={set(setInstitution, 'email')} /></Field>
                <Field label={t('setup.upiId')}><Input value={institution.upiId} onChange={set(setInstitution, 'upiId')} /></Field>
                <Field label={t('setup.principalName')}><Input value={institution.principalName} onChange={set(setInstitution, 'principalName')} /></Field>
                <Field label={t('setup.regNo')}><Input value={institution.regNo} onChange={set(setInstitution, 'regNo')} /></Field>
                <Field label={t('setup.logo')} hint={t('setup.logoHint')}>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={pickLogo}>{t('setup.uploadLogo')}</Button>
                    {logoDataUrl && <Button variant="ghost" size="sm" onClick={() => setLogoDataUrl(null)}>{t('setup.removeLogo')}</Button>}
                  </div>
                  {logoDataUrl && <p className="mt-1 truncate text-xs text-muted">{logoDataUrl}</p>}
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">{t('setup.s2Subtitle')}</p>
              <Field label={t('setup.sessionName')} required><Input value={session.name} onChange={set(setSession, 'name')} placeholder={t('setup.sessionNamePh')} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('setup.startDate')} required><Input type="date" value={session.startDate} onChange={set(setSession, 'startDate')} /></Field>
                <Field label={t('setup.endDate')} required><Input type="date" value={session.endDate} onChange={set(setSession, 'endDate')} /></Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">{t('setup.s3Subtitle')}</p>
              {classes.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <Input value={c.name} placeholder={t('setup.className')}
                    onChange={(e) => setClasses((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <Input value={c.sections} placeholder={t('setup.sectionsPh')}
                    onChange={(e) => setClasses((p) => p.map((x, j) => j === i ? { ...x, sections: e.target.value } : x))} />
                  <Button variant="ghost" size="icon" onClick={() => setClasses((p) => p.filter((_, j) => j !== i))} aria-label={t('common.delete')}>✕</Button>
                </div>
              ))}
              <Button variant="secondary" className="self-start" onClick={() => setClasses((p) => [...p, { name: '', sections: '' }])}>{t('setup.addClass')}</Button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <Alert tone="warning">{t('setup.adminPasswordHint')}</Alert>
              <Field label={t('setup.username')} required><Input value={admin.username} onChange={set(setAdmin, 'username')} autoFocus /></Field>
              <Field label={t('setup.displayName')}><Input value={admin.displayName} onChange={set(setAdmin, 'displayName')} /></Field>
              <Field label={t('setup.adminPassword')} required error={admin.password && admin.password.length < 8 ? t('auth.passwordTooShort') : undefined}>
                <Input type="password" value={admin.password} onChange={set(setAdmin, 'password')} />
              </Field>
              <Field label={t('auth.confirmPassword')} required error={admin.confirm && admin.confirm !== admin.password ? t('auth.passwordMismatch') : undefined}>
                <Input type="password" value={admin.confirm} onChange={set(setAdmin, 'confirm')} />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">{t('setup.s5Subtitle')}</p>
              {heads.map((h, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-surface-2">
                  <input type="checkbox" checked={h.on} onChange={(e) => setHeads((p) => p.map((x, j) => j === i ? { ...x, on: e.target.checked } : x))}
                    className="h-4 w-4 accent-[#1a56db]" />
                  <span className="flex-1 text-sm font-medium">{h.name}</span>
                  <span className="text-xs text-faint">{t(`setup.type${h.type === 'one-time' ? 'Onetime' : h.type === 'periodic' ? 'Periodic' : 'Optional'}`)}</span>
                </label>
              ))}
              <div className="flex gap-2">
                <Input value={customHead} onChange={(e) => setCustomHead(e.target.value)} placeholder={t('setup.feeHead')} />
                <Button variant="secondary" onClick={() => { if (customHead.trim()) { setHeads((p) => [...p, { name: customHead.trim(), type: 'optional', on: true }]); setCustomHead(''); } }}>
                  {t('setup.addFeeHead')}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <div>
              {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>{t('common.back')}</Button>}
            </div>
            <div className="flex items-center gap-2">
              {step === 0 && <Button variant="ghost" onClick={finish} disabled={busy}>{t('setup.skipWizard')}</Button>}
              {step < 4
                ? <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>{t('common.next')}</Button>
                : <Button onClick={finish} loading={busy} disabled={!canNext()}>{t('setup.complete')}</Button>}
            </div>
          </div>
          {step === 0 && <p className="mt-3 text-center text-xs text-faint">{t('setup.skipNote')}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
