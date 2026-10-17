import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { isWebDemo } from '../../stores/app';
import { PageHeader, EmptyState, Alert } from '../../components/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input, Field } from '../../components/ui/input';
import { Switch } from '../../components/ui/primitives';
import { Badge } from '../../components/ui/badge';
import { DataTable } from '../../components/ui/data-table';
import { AdminPasswordDialog } from '../../components/ui/confirm-dialog';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import type { BackupEntry, DriveFile } from '@shared/types';

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupScreen() {
  const [entries, setEntries] = React.useState<BackupEntry[]>([]);
  const [cfg, setCfg] = React.useState({ enabled: true, time: '20:00', keepLast: 30, usbPath: '', reminderDays: 7 });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [restoreFor, setRestoreFor] = React.useState<BackupEntry | null>(null);
  const [restoreStep, setRestoreStep] = React.useState<'confirm' | 'password'>('confirm');
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [healthTick, setHealthTick] = React.useState(0);

  const openRestore = (entry: BackupEntry) => { setRestoreFor(entry); setRestoreStep('confirm'); };
  const closeRestore = () => { setRestoreFor(null); setRestoreStep('confirm'); };

  const load = React.useCallback(() => {
    invoke('backup:list', undefined).then(setEntries);
    invoke('backup:config:get', undefined).then(setCfg);
  }, []);
  React.useEffect(load, [load]);

  const backupNow = async () => {
    setBusy(true); setMsg('');
    const r = await invoke('backup:now', undefined);
    setBusy(false);
    setMsg(r.ok ? t('backup.backupDone') : r.error);
    if (r.ok) { load(); setHealthTick((n) => n + 1); }
    setTimeout(() => setMsg(''), 4000);
  };

  const downloadLocal = async () => {
    setBusy(true); setMsg('');
    const r = await invoke('backup:download', undefined);
    setBusy(false);
    if (r.ok) { setMsg(t('backup.downloadDone')); load(); }
    else if (r.error !== 'cancelled') setMsg(r.error);
    setTimeout(() => setMsg(''), 4000);
  };

  const saveToDrive = async () => {
    setBusy(true); setMsg('');
    const r = await invoke('drive:upload', undefined);
    setBusy(false);
    setMsg(r.ok ? `${t('backup.driveUploaded')} ${r.fileName}` : r.error);
    if (r.ok) load();
    setTimeout(() => setMsg(''), 5000);
  };

  const saveCfg = async () => {
    const r = await invoke('backup:config:set', cfg);
    if (r.ok) { setMsg(t('backup.configSaved')); setTimeout(() => setMsg(''), 3000); }
  };

  const doRestore = async (adminPassword: string) => {
    if (!restoreFor) return;
    setRestoreBusy(true);
    const r = await invoke('backup:restore', { id: restoreFor.id, adminPassword });
    setRestoreBusy(false);
    if (r.ok) {
      // main relaunches the app after restore
    } else {
      setMsg(r.error);
      closeRestore();
    }
  };

  return (
    <div>
      <PageHeader
        title={t('backup.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadLocal} loading={busy}>{t('backup.downloadLocal')}</Button>
            {!isWebDemo && <Button variant="secondary" onClick={saveToDrive} loading={busy}>{t('backup.saveToDrive')}</Button>}
            <Button onClick={backupNow} loading={busy}>{t('backup.backupNow')}</Button>
          </div>
        }
      />
      {msg && <Alert tone={msg.includes('✓') || msg === t('backup.backupDone') || msg === t('backup.configSaved') || msg === t('backup.downloadDone') || msg.startsWith(t('backup.driveUploaded')) ? 'success' : 'danger'} className="mb-4">{msg}</Alert>}

      {!isWebDemo && <DriveCard onDone={load} />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('backup.autoTitle')}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} label={t('backup.autoEnabled')} />
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('backup.autoTime')}><Input type="time" value={cfg.time} onChange={(e) => setCfg({ ...cfg, time: e.target.value })} /></Field>
              <Field label={t('backup.keepLast')}><Input type="number" min={1} max={365} value={cfg.keepLast} onChange={(e) => setCfg({ ...cfg, keepLast: Number(e.target.value) })} /></Field>
            </div>
            <Field label={t('backup.usbPath')} hint={t('backup.usbHint')}>
              <Input value={cfg.usbPath} onChange={(e) => setCfg({ ...cfg, usbPath: e.target.value })} placeholder="E:\EMS-Backups" />
            </Field>
            <Field label={t('backup.reminderDays')}>
              <Input type="number" min={1} max={90} value={cfg.reminderDays} onChange={(e) => setCfg({ ...cfg, reminderDays: Number(e.target.value) || 7 })} />
            </Field>
            <div><Button variant="secondary" onClick={saveCfg}>{t('backup.saveConfig')}</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('backup.healthTitle')}</CardTitle></CardHeader>
          <CardContent>
            <HealthPanel onDone={load} refreshKey={healthTick} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>{t('backup.historyTitle')}</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: 'createdAt', header: t('backup.date'), sticky: true, render: (r) => new Date(r.createdAt).toLocaleString() },
              { key: 'fileName', header: t('common.name') },
              { key: 'sizeBytes', header: t('backup.size'), render: (r) => fmtSize(r.sizeBytes) },
              { key: 'triggeredBy', header: t('backup.triggeredBy'), render: (r) => <Badge tone="muted">{r.triggeredBy}</Badge> },
              {
                key: 'actions', header: t('common.actions'), className: 'text-right',
                render: (r) => (
                  <Button variant="secondary" size="sm" onClick={() => openRestore(r)}>{t('backup.restore')}</Button>
                ),
              },
            ]}
            rows={entries}
            empty={<EmptyState title={t('empty.backups')} actionLabel={t('backup.backupNow')} onAction={backupNow} />}
          />
        </CardContent>
      </Card>

      {/* Two-step restore: confirm first, then admin password re-entry (PERM-02). */}
      <ConfirmDialog
        open={!!restoreFor && restoreStep === 'confirm'} onOpenChange={(v) => !v && closeRestore()}
        title={t('backup.restoreTitle')}
        message={restoreFor ? t('backup.restoreConfirm', { date: new Date(restoreFor.createdAt).toLocaleString() }) : ''}
        confirmLabel={t('backup.restore')} danger
        onConfirm={() => setRestoreStep('password')}
      />
      <AdminPasswordDialog
        open={!!restoreFor && restoreStep === 'password'} onOpenChange={(v) => !v && closeRestore()}
        title={t('backup.restoreTitle')}
        message={t('backup.restoreAdminPassword')}
        loading={restoreBusy}
        onConfirm={doRestore}
      />
    </div>
  );
}

/** Google Drive backup card (desktop only — hidden in the web demo). */
function DriveCard({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = React.useState<{ connected: boolean; email?: string; clientIdSet: boolean } | null>(null);
  const [files, setFiles] = React.useState<DriveFile[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  const [showClientId, setShowClientId] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const s = await invoke('drive:status', undefined).catch(() => null);
    setStatus(s);
    if (s?.connected) {
      const l = await invoke('drive:list', undefined).catch(() => null);
      if (l?.ok) setFiles(l.files);
    } else {
      const c = await invoke('drive:clientId:get', undefined).catch(() => null);
      if (c) setClientId(c.clientId);
    }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);

  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 5000); };

  const connect = async () => {
    setBusy(true); setMsg(t('backup.driveConnectWaiting'));
    const r = await invoke('drive:connect', undefined);
    setBusy(false);
    if (r.ok) { say(`✓ ${t('backup.driveConnectedAs')}: ${r.email}`); }
    else { say(r.error); }
    void refresh();
  };

  const disconnect = async () => {
    await invoke('drive:disconnect', undefined);
    setFiles([]);
    void refresh();
  };

  const upload = async () => {
    setBusy(true); setMsg(t('backup.driveUploading'));
    const r = await invoke('drive:upload', undefined);
    setBusy(false);
    say(r.ok ? `✓ ${t('backup.driveUploaded')} ${r.fileName}` : r.error);
    if (r.ok) { void refresh(); onDone(); }
  };

  const download = async (f: DriveFile) => {
    setBusy(true); setMsg(t('backup.driveUploading'));
    const r = await invoke('drive:download', { id: f.id, name: f.name });
    setBusy(false);
    say(r.ok ? `✓ ${f.name}` : r.error);
    if (r.ok) onDone();
  };

  const saveClientId = async () => {
    const r = await invoke('drive:clientId:set', { clientId });
    say(r.ok ? t('backup.driveClientIdSaved') : r.error);
    void refresh();
  };

  return (
    <Card className="mb-4">
      <CardHeader><CardTitle>{t('backup.driveTitle')}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('backup.driveDesc')}</p>
        {msg && <Alert tone={msg.startsWith('✓') ? 'success' : 'danger'}>{msg}</Alert>}
        {!status ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : !status.connected ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full bg-muted" aria-hidden />
              <strong>{t('backup.driveNotConnected')}</strong>
            </div>
            {!status.clientIdSet && (
              <Alert tone="warning">
                <span className="text-sm">{t('backup.driveClientIdHint')}</span>
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={connect} loading={busy} disabled={!status.clientIdSet}>{t('backup.driveConnect')}</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowClientId((v) => !v)}>{t('backup.driveClientId')}</Button>
            </div>
            {showClientId && (
              <Field label={t('backup.driveClientId')} hint={t('backup.driveClientIdHint')}>
                <div className="flex gap-2">
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className="flex-1" />
                  <Button variant="secondary" onClick={saveClientId}>{t('backup.saveConfig')}</Button>
                </div>
              </Field>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full bg-success" aria-hidden />
              <strong>{t('backup.driveConnectedAs')}: {status.email}</strong>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={upload} loading={busy}>{t('backup.saveToDrive')}</Button>
              <Button variant="secondary" onClick={disconnect}>{t('backup.driveDisconnect')}</Button>
            </div>
            {files.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">{t('backup.driveFilesTitle')}</h4>
                <DataTable
                  columns={[
                    { key: 'name', header: t('common.name') },
                    {
                      key: 'createdTime', header: t('backup.date'),
                      render: (r: DriveFile) => new Date(r.createdTime).toLocaleString(),
                    },
                    {
                      key: 'actions', header: t('common.actions'), className: 'text-right',
                      render: (r: DriveFile) => (
                        <Button variant="secondary" size="sm" onClick={() => void download(r)}>{t('backup.driveDownload')}</Button>
                      ),
                    },
                  ]}
                  rows={files}
                  empty={<span className="text-sm text-muted">—</span>}
                />
                <p className="mt-2 text-xs text-muted">{t('backup.driveRestoreHint')}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HealthPanel({ onDone, refreshKey }: { onDone: () => void; refreshKey: number }) {  const [health, setHealth] = React.useState<{ lastBackupAt: string | null; overdue: boolean; autoEnabled: boolean; scheduledTime: string } | null>(null);
  React.useEffect(() => { invoke('backup:health', undefined).then(setHealth); }, [refreshKey]);
  if (!health) return <p className="text-sm text-muted">{t('common.loading')}</p>;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${health.overdue ? 'bg-danger' : 'bg-success'}`} aria-hidden />
        <strong>{health.overdue ? t('backup.overdue') : t('backup.healthy')}</strong>
      </div>
      <p className="text-muted">{t('backup.lastBackup')}: {health.lastBackupAt ? new Date(health.lastBackupAt).toLocaleString() : t('backup.never')}</p>
      <p className="text-muted">{t('backup.autoTime')}: {health.scheduledTime} · {health.autoEnabled ? t('common.yes') : t('common.no')}</p>
      <div><Button variant="secondary" size="sm" onClick={() => { invoke('backup:health', undefined).then(setHealth); onDone(); }}>{t('common.refresh')}</Button></div>
    </div>
  );
}
