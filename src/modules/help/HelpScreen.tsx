import * as React from 'react';
import { invoke, openExternal } from '../../lib/ipc';
import { t } from '../../i18n/index';
import en from '../../i18n/en.json';
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
                <div className="mt-4 rounded-xl border border-border p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted">{t('help.companyLabel')}</p>
                  <p className="mt-1 text-[16px] font-bold">{t('help.companyName')}</p>
                  <p className="text-muted">{t('help.companyAddr')}</p>
                  <div className="mt-2 flex flex-col gap-1">
                    <span>🌐 {t('help.companyWeb')}</span>
                    <span>✉️ {t('help.companyEmail')}</span>
                    <span>📞 {t('help.companyPhone')}</span>
                  </div>
                </div>
                <p className="mt-3 text-[13px] text-faint">Invexom EMS v1.0.0 · {t('app.by')}</p>
              </div>
            ),
          },
          {
            value: 'license', label: t('help.tabs.license'),
            content: (
              <div className="max-w-2xl">
                <h3 className="mb-2 text-[16px] font-semibold">{t('help.licenseTitle')}</h3>
                <p className="text-sm leading-relaxed text-muted">{t('help.licenseBody')}</p>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {(en.help.licensePoints as string[]).map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand">✓</span><span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          },
          {
            value: 'support', label: t('help.tabs.support'),
            content: (
              <div className="max-w-2xl">
                <h3 className="mb-2 text-[16px] font-semibold">{t('help.supportTitle')}</h3>
                <p className="text-sm leading-relaxed text-muted">{t('help.supportBody')}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted">{t('help.supportWebsite')}</p>
                    <p className="font-semibold">{t('help.companyWeb')}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted">{t('help.supportEmailL')}</p>
                    <p className="font-semibold">{t('help.companyEmail')}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted">{t('help.supportPhoneL')}</p>
                    <p className="font-semibold">{t('help.companyPhone')}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted">{t('help.supportAddrL')}</p>
                    <p className="font-semibold">{t('help.companyName')}</p>
                    <p className="text-muted">{t('help.companyAddr')}</p>
                  </div>
                </div>
                <Alert tone="brand" className="mt-4">{t('help.supportTip')}</Alert>
              </div>
            ),
          },
        ]} />
      </CardContent></Card>
    </div>
  );
}
