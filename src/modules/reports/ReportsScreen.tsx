import * as React from 'react';
import { invoke, downloadExportResult } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { PageHeader, Alert } from '../../components/ui/feedback';
import { ReportPrint } from '../../components/print/documents';
import type { ReportDef, ReportResult, SessionRow, MasterItem } from '@shared/types';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 7) + '-01';

export function ReportsScreen() {
  const [defs, setDefs] = React.useState<ReportDef[]>([]);
  const [key, setKey] = React.useState('');
  const [params, setParams] = React.useState<Record<string, string>>({ from: monthStart(), to: today(), date: today(), month: new Date().toISOString().slice(0, 7) });
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    invoke('reports:list', undefined).then((d) => { setDefs(d); if (d.length) setKey(d[0].key); }).catch(() => {});
    invoke('settings:sessions:list', undefined).then((s) => {
      setSessions(s);
      const active = s.find((x) => x.isActive);
      if (active) setParams((p) => ({ ...p, session: String(active.id) }));
    }).catch(() => {});
    invoke('masters:list', { kind: 'class' }).then(setClasses).catch(() => {});
  }, []);

  const def = defs.find((d) => d.key === key);

  const run = async () => {
    setMsg('');
    setResult(await invoke('reports:run', { key, params }));
  };

  const exportXlsx = async () => {
    const r = await invoke('reports:export', { key, params, title: def?.title ?? key });
    setMsg(downloadExportResult(r));
  };

  const set = (k: string, v: string) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <PageHeader
        title={t('nav.reports')}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>{t('modules.reports.print')}</Button>
            <Button variant="secondary" onClick={() => void exportXlsx()}>{t('modules.reports.exportExcel')}</Button>
            <Button onClick={() => void run()}>{t('modules.reports.run')}</Button>
          </>
        }
      />
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>{t('modules.reports.report')}</Label>
            <Select value={key} onValueChange={setKey} placeholder="Report"
              options={defs.map((d) => ({ value: d.key, label: d.title }))} className="w-64" />
          </div>
          {def?.params.includes('from') && <div><Label>From</Label><Input type="date" value={params.from} onChange={(e) => set('from', e.target.value)} /></div>}
          {def?.params.includes('to') && <div><Label>To</Label><Input type="date" value={params.to} onChange={(e) => set('to', e.target.value)} /></div>}
          {def?.params.includes('date') && <div><Label>Date</Label><Input type="date" value={params.date} onChange={(e) => set('date', e.target.value)} /></div>}
          {def?.params.includes('month') && <div><Label>Month</Label><Input type="month" value={params.month} onChange={(e) => set('month', e.target.value)} /></div>}
          {def?.params.includes('session') && <div><Label>Session</Label>
            <Select value={params.session ?? ''} onValueChange={(v) => set('session', v)} placeholder="Session"
              options={sessions.map((s) => ({ value: String(s.id), label: s.name }))} className="w-40" />
          </div>}
          {def?.params.includes('class') && <div><Label>Class</Label>
            <Select value={params.class ?? ''} onValueChange={(v) => set('class', v)} placeholder="All"
              options={[{ value: '', label: 'All' }, ...classes.map((c) => ({ value: c.name, label: c.name }))]} className="w-40" />
          </div>}
        </div>
      </Card>
      {result && (
        <>
        <Card className="overflow-x-auto p-0">
          <div className="print-area px-4 pt-4">
            <h3 className="mb-2 hidden text-lg font-bold print:block">{def?.title}</h3>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted">
              {result.columns.map((c) => <th key={c.key} className="px-3 py-2">{c.header}</th>)}
            </tr></thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-border">
                  {result.columns.map((c) => <td key={c.key} className="px-3 py-1.5">{String(row[c.key] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-sm text-muted no-print">{result.rows.length} rows</p>
        </Card>
        <ReportPrint
          title={def?.title ?? key}
          columns={result.columns}
          rows={result.rows as Record<string, unknown>[]}
        />
        </>
      )}
    </div>
  );
}
