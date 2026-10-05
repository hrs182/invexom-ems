import * as React from 'react';
import { invoke, openExternal } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { PageHeader, Alert } from '../../components/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Tabs } from '../../components/ui/primitives';

function ShortcutsTab() {
  const rows: [string, string][] = [
    ['Ctrl K', t('help.scSearch')],
    ['P / A / L', t('help.scAttendance')],
    ['Tab', t('help.scSave')],
  ];
  return (
    <table className="w-full max-w-xl border-collapse text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-border last:border-0">
            <td className="py-2.5 pr-4"><kbd className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[13px]">{k}</kbd></td>
            <td className="py-2.5">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HelpScreen() {
  const [update, setUpdate] = React.useState<{ state: 'idle' | 'checking' | 'available' | 'uptodate' | 'error'; version?: string; url?: string; notes?: string }>({ state: 'idle' });

  const check = async () => {
    setUpdate({ state: 'checking' });
    const r = await invoke('app:checkForUpdates', undefined);
    if (r.error) setUpdate({ state: 'error' });
    else if (r.available) setUpdate({ state: 'available', version: r.version, url: r.url, notes: r.notes });
    else setUpdate({ state: 'uptodate' });
  };

  return (
    <div>
      <PageHeader
        title={t('help.title')}
        actions={<Button variant="secondary" onClick={check} loading={update.state === 'checking'}>{t('help.checkUpdates')}</Button>}
      />
      {update.state === 'available' && (
        <Alert tone="brand" className="mb-4">
          {t('help.updateAvailable', { v: update.version ?? '' })}
          {update.notes && <p className="mt-1">{update.notes}</p>}
          {update.url && <Button size="sm" className="mt-2" onClick={() => void openExternal(update.url!)}>{t('help.downloadUpdate')}</Button>}
        </Alert>
      )}
      {update.state === 'uptodate' && <Alert tone="success" className="mb-4">{t('help.upToDate')}</Alert>}
      {update.state === 'error' && <Alert tone="warning" className="mb-4">{t('help.updateError')}</Alert>}

      <Card><CardContent>
        <Tabs tabs={[
          {
            value: 'guide', label: t('help.tabs.guide'),
            content: (
              <div className="max-w-2xl">
                <h3 className="mb-2 text-[16px] font-semibold">{t('help.guideTitle')}</h3>
                <p className="text-sm leading-relaxed text-muted">{t('help.guideBody')}</p>
              </div>
            ),
          },
          {
            value: 'shortcuts', label: t('help.tabs.shortcuts'),
            content: (
              <div className="max-w-2xl">
                <h3 className="mb-3 text-[16px] font-semibold">{t('help.shortcutsTitle')}</h3>
                <ShortcutsTab />
              </div>
            ),
          },
          {
            value: 'safety', label: t('help.tabs.safety'),
            content: (
              <div className="flex max-w-2xl flex-col gap-3">
                <h3 className="text-[16px] font-semibold">{t('help.safetyTitle')}</h3>
                <p className="text-sm leading-relaxed text-muted">{t('help.safetyBody')}</p>
                <Alert tone="warning">{t('help.safetyWarning')}</Alert>
              </div>
            ),
          },
          {
            value: 'about', label: t('help.tabs.about'),
            content: (
              <div className="max-w-2xl">
                <CardHeader><CardTitle>{t('help.aboutTitle')}</CardTitle></CardHeader>
                <CardDescription>{t('help.aboutBody')}</CardDescription>
                <p className="mt-3 text-[13px] text-faint">Invexom EMS v1.0.0 · {t('app.by')}</p>
              </div>
            ),
          },
        ]} />
      </CardContent></Card>
    </div>
  );
}
