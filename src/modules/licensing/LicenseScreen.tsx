import * as React from 'react';
import { invoke, openFile } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { useApp } from '../../stores/app';
import { PageHeader, Alert } from '../../components/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ProgressBar } from '../../components/ui/feedback';
import { ConfirmDialog, AdminPasswordDialog } from '../../components/ui/confirm-dialog';
import type { LicenseStatus } from '@shared/types';

function ModeBadge({ mode }: { mode: LicenseStatus['mode'] }) {
  const map = {
    licensed: <Badge tone="success">{t('license.modeLicensed')}</Badge>,
    demo: <Badge tone="warning">{t('license.modeDemo')}</Badge>,
    'demo-expired': <Badge tone="danger">{t('license.modeDemoExpired')}</Badge>,
    mismatch: <Badge tone="danger">{t('license.modeMismatch')}</Badge>,
  } as const;
  return map[mode];
}

export function LicenseScreen() {
  const { status, refreshStatus } = useApp();
  const [license, setLicense] = React.useState<LicenseStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [clearStep, setClearStep] = React.useState<'confirm' | 'password' | null>(null);

  const load = React.useCallback(() => {
    invoke('license:status', undefined).then((s) => { setLicense(s); refreshStatus(); });
  }, [refreshStatus]);
  React.useEffect(load, [load]);

  const copyRequest = async () => {
    try {
      const hw = await invoke('license:hwInfo', undefined);
      const text = `Invexom EMS License Request\nMachine Code: ${hw.machineCode}\nHW: disk=${hw.disk} board=${hw.board} cpu=${hw.cpu}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch { /* clipboard unavailable */ }
  };

  const chooseAndActivate = async () => {
    const p = await openFile({ title: t('license.activateTitle'), filters: [{ name: 'License', extensions: ['inelic'] }] });
    if (!p) return;
    setFileName(p);
    // Renderer sandbox can't read files: on desktop we pass __FILE__:<path>
    // and main reads it; on web openFile already returned the raw text.
    const looksLikePath = p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
    setBusy(true); setError('');
    try {
      const text = await invoke('license:activate', { licenseText: looksLikePath ? `__FILE__:${p}` : p });
      if (text.ok) { setFileName(''); load(); }
      else setError(text.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const doClear = async (adminPassword: string) => {
    const r = await invoke('license:clear', { adminPassword });
    if (r.ok) { setClearStep(null); load(); }
  };

  if (!license) return <p className="text-sm text-muted">{t('common.loading')}</p>;

  return (
    <div>
      <PageHeader title={t('license.title')} />

      {license.mode === 'mismatch' && <Alert tone="danger" className="mb-4">{t('license.mismatchNote')}</Alert>}
      {license.mode === 'demo-expired' && <Alert tone="danger" className="mb-4">{t('license.readOnlyNote')}</Alert>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('license.statusTitle')}</CardTitle>
            <ModeBadge mode={license.mode} />
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {license.tierLabel && (
              <Row label={t('license.tier')} value={`${license.tierLabel}`} />
            )}
            {license.issuedTo && <Row label={t('license.issuedTo')} value={license.issuedTo} />}
            <Row
              label={t('license.maxStudents')}
              value={license.maxStudents == null ? t('license.unlimited') : t('license.studentsUsed', { used: license.demoStudentCount ?? 0, cap: license.maxStudents })}
            />
            {license.mode === 'demo' && license.demoDaysLeft != null && (
              <div>
                <Row label={t('license.daysLeft', { n: license.demoDaysLeft })} value="" />
                <ProgressBar value={(license.demoDaysLeft / 30) * 100} className="mt-1" />
              </div>
            )}
            <Row label={t('license.addonTransport')} value={license.addons.transport ? t('license.addonOn') : t('license.addonOff')} />
            <Row label={t('license.addonLibrary')} value={license.addons.library ? t('license.addonOn') : t('license.addonOff')} />
            {license.mode === 'demo' && (
              <p className="text-[13px] text-muted">{t('license.watermarkNote')}</p>
            )}
            {license.mode === 'licensed' && (
              <div className="pt-2">
                <Button variant="ghost" size="sm" onClick={() => setClearStep('confirm')}>{t('license.clearLicense')}</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('license.activateTitle')}</CardTitle>
            <CardDescription>{t('license.activateSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-[13px] font-medium">{t('license.machineCode')}</p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm tracking-wider">{license.machineCode}</code>
                <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(license.machineCode)}>
                  {t('license.copyCode')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void copyRequest()}>
                  {t('license.copyRequest')}
                </Button>
              </div>
              {copied && <p className="mt-1.5 text-[13px] text-success">{t('license.requestCopied')}</p>}
              <p className="mt-1.5 text-[13px] text-muted">{t('license.machineCodeHint')}</p>
            </div>
            <div>
              <Button onClick={chooseAndActivate} loading={busy}>{t('license.chooseFile')}</Button>
              {fileName && <p className="mt-1.5 truncate text-xs text-muted">{fileName}</p>}
              {error && <Alert tone="danger" className="mt-3">{t('license.activateError', { error })}</Alert>}
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={clearStep === 'confirm'} onOpenChange={(v) => !v && setClearStep(null)}
        title={t('license.clearLicense')} message={t('license.clearConfirm')}
        confirmLabel={t('common.confirm')} danger
        onConfirm={() => setClearStep('password')}
      />
      <AdminPasswordDialog
        open={clearStep === 'password'} onOpenChange={(v) => !v && setClearStep(null)}
        title={t('license.clearLicense')} message={t('backup.restoreAdminPassword')}
        onConfirm={doClear}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
