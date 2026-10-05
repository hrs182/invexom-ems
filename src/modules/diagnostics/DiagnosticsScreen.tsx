import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { PageHeader, Alert } from '../../components/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import type { DiagnosticsInfo } from '@shared/types';

function fmtSize(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function DiagnosticsScreen() {
  const [info, setInfo] = React.useState<DiagnosticsInfo | null>(null);
  const [check, setCheck] = React.useState<{ ok: boolean; detail: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => { invoke('diagnostics:info', undefined).then(setInfo); }, []);
  React.useEffect(load, [load]);

  const runCheck = async () => {
    setBusy(true);
    const r = await invoke('diagnostics:integrityCheck', undefined);
    setBusy(false);
    setCheck(r);
  };

  const copyInfo = () => {
    if (!info) return;
    const text = [
      `Invexom EMS ${info.version}`, `Electron ${info.electronVersion} / Node ${info.nodeVersion}`,
      `Platform: ${info.platform}`, `License: ${info.license.mode}${info.license.tierLabel ? ` (${info.license.tierLabel})` : ''}`,
      `Machine code: ${info.license.machineCode}`,
      `DB: ${fmtSize(info.dbSizeBytes)} @ ${info.dbPath}`, `Schema v${info.schemaVersion}`,
      `Last backup: ${info.backup.lastBackupAt ?? 'never'}${info.backup.overdue ? ' (OVERDUE)' : ''}`,
    ].join('\n');
    void navigator.clipboard.writeText(text);
  };

  if (!info) return <p className="text-sm text-muted">{t('common.loading')}</p>;

  const rows: [string, React.ReactNode][] = [
    [t('diagnostics.appVersion'), info.version],
    [t('diagnostics.electron'), `${info.electronVersion} · Node ${info.nodeVersion} · Chrome ${info.chromeVersion}`],
    [t('diagnostics.platform'), info.platform],
    [t('diagnostics.dataFolder'), <code key="d" className="break-all font-mono text-[13px]">{info.dataDir}</code>],
    [t('diagnostics.dbFile'), <code key="f" className="break-all font-mono text-[13px]">{info.dbPath}</code>],
    [t('diagnostics.dbSize'), fmtSize(info.dbSizeBytes)],
    [t('diagnostics.dbMode'), <Badge key="w" tone="success">{t('diagnostics.wal')}</Badge>],
    [t('diagnostics.schema'), `v${info.schemaVersion}`],
  ];

  return (
    <div>
      <PageHeader
        title={t('diagnostics.title')}
        subtitle={t('diagnostics.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={runCheck} loading={busy}>{t('diagnostics.runCheck')}</Button>
            <Button variant="secondary" onClick={copyInfo}>{t('diagnostics.copyInfo')}</Button>
          </>
        }
      />
      {check && (
        <Alert tone={check.ok ? 'success' : 'danger'} className="mb-4">
          {check.ok ? t('diagnostics.checkOk') : t('diagnostics.checkFailed', { detail: check.detail })}
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('diagnostics.appVersion')}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-0">
                <span className="shrink-0 text-muted">{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('diagnostics.licenseSection')}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between border-b border-border pb-2"><span className="text-muted">Mode</span><strong>{info.license.mode}</strong></div>
            <div className="flex justify-between border-b border-border pb-2"><span className="text-muted">{t('license.tier')}</span><strong>{info.license.tierLabel ?? '—'}</strong></div>
            <div className="flex justify-between border-b border-border pb-2"><span className="text-muted">{t('license.machineCode')}</span><code className="font-mono">{info.license.machineCode}</code></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('diagnostics.backupSection')}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between border-b border-border pb-2"><span className="text-muted">{t('backup.lastBackup')}</span><strong>{info.backup.lastBackupAt ? new Date(info.backup.lastBackupAt).toLocaleString() : t('backup.never')}</strong></div>
            <div className="flex justify-between"><span className="text-muted">{t('backup.healthTitle')}</span>
              {info.backup.overdue ? <Badge tone="danger">{t('backup.overdue')}</Badge> : <Badge tone="success">{t('backup.healthy')}</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
