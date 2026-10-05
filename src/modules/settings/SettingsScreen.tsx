import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { PageHeader, EmptyState, Alert } from '../../components/ui/feedback';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input, Textarea, Field } from '../../components/ui/input';
import { Tabs } from '../../components/ui/primitives';
import { Badge } from '../../components/ui/badge';
import { DataTable } from '../../components/ui/data-table';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Dialog } from '../../components/ui/dialog';
import type { MasterKind, InstitutionProfile, SessionRow, NumberingPattern, AuditEntry } from '@shared/types';

function InstitutionTab() {
  const [form, setForm] = React.useState<InstitutionProfile | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { invoke('settings:institution:get', undefined).then(setForm); }, []);
  if (!form) return <p className="text-sm text-muted">{t('common.loading')}</p>;
  const set = (k: keyof InstitutionProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => p ? { ...p, [k]: e.target.value } : p);
  const save = async () => {
    setBusy(true);
    const r = await invoke('settings:institution:set', form);
    setBusy(false);
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-muted">{t('settings.institutionSubtitle')}</p>
      <Field label={t('setup.schoolName')} required><Input value={form.name} onChange={set('name')} /></Field>
      <Field label={t('setup.address')}><Textarea value={form.address} onChange={set('address')} rows={2} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('setup.phone')}><Input value={form.phone} onChange={set('phone')} /></Field>
        <Field label={t('setup.email')}><Input value={form.email} onChange={set('email')} /></Field>
        <Field label={t('settings.website')}><Input value={form.website} onChange={set('website')} /></Field>
        <Field label={t('setup.upiId')}><Input value={form.upiId} onChange={set('upiId')} /></Field>
        <Field label={t('setup.regNo')}><Input value={form.regNo} onChange={set('regNo')} /></Field>
        <Field label={t('setup.principalName')}><Input value={form.principalName} onChange={set('principalName')} /></Field>
      </div>
      <Field label={t('settings.headerHtml')} hint="HTML"><Textarea value={form.headerHtml} onChange={set('headerHtml')} rows={2} /></Field>
      <Field label={t('settings.footerHtml')} hint="HTML"><Textarea value={form.footerHtml} onChange={set('footerHtml')} rows={2} /></Field>
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy}>{t('common.save')}</Button>
        {saved && <span className="text-sm text-success">{t('settings.saved')}</span>}
      </div>
    </div>
  );
}

function SessionsTab() {
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  const [name, setName] = React.useState('');
  const [start, setStart] = React.useState('2027-04-01');
  const [end, setEnd] = React.useState('2028-03-31');
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => { invoke('settings:sessions:list', undefined).then(setRows); }, []);
  React.useEffect(load, [load]);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const r = await invoke('settings:sessions:create', { name: name.trim(), startDate: start, endDate: end });
    setBusy(false);
    if (r.ok) { setName(''); load(); }
  };
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted">{t('settings.sessionsSubtitle')}</p>
      <DataTable
        columns={[
          { key: 'name', header: t('common.name'), sticky: true },
          { key: 'startDate', header: t('setup.startDate') },
          { key: 'endDate', header: t('setup.endDate') },
          {
            key: 'status', header: t('common.status'),
            render: (r) => r.isActive ? <Badge tone="success">{t('settings.sessionActive')}</Badge>
              : r.isLocked ? <Badge tone="muted">{t('settings.sessionLocked')}</Badge> : <Badge tone="muted">—</Badge>,
          },
        ]}
        rows={rows}
        empty={<EmptyState title={t('empty.sessions')} />}
      />
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('setup.sessionName')} className="min-w-48"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('setup.sessionNamePh')} /></Field>
        <Field label={t('setup.startDate')}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label={t('setup.endDate')}><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Button onClick={create} loading={busy} disabled={!name.trim()}>{t('settings.newSession')}</Button>
      </div>
    </div>
  );
}

function MastersTab({ kind }: { kind: MasterKind }) {
  const [rows, setRows] = React.useState<{ id: number; name: string }[]>([]);
  const [name, setName] = React.useState('');
  const [editing, setEditing] = React.useState<{ id: number; name: string } | null>(null);
  const [removing, setRemoving] = React.useState<{ id: number; name: string } | null>(null);
  const load = React.useCallback(() => { invoke('masters:list', { kind }).then(setRows); }, [kind]);
  React.useEffect(load, [load]);
  const add = async () => {
    if (!name.trim()) return;
    const r = await invoke('masters:add', { kind, name: name.trim() });
    if (r.ok) { setName(''); load(); }
  };
  const doRename = async () => {
    if (!editing || !editing.name.trim()) return;
    const r = await invoke('masters:rename', { kind, id: editing.id, name: editing.name.trim() });
    if (r.ok) { setEditing(null); load(); }
  };
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('common.name')}
          onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} />
        <Button onClick={add} disabled={!name.trim()}>{t('settings.addItem')}</Button>
      </div>
      <DataTable
        columns={[
          { key: 'name', header: t('common.name'), sticky: true },
          {
            key: 'actions', header: t('common.actions'), className: 'text-right',
            render: (r) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>{t('settings.rename')}</Button>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(r)}>{t('settings.remove')}</Button>
              </span>
            ),
          },
        ]}
        rows={rows}
        empty={<EmptyState title={t('empty.masters')} />}
      />
      <Dialog
        open={!!editing} onOpenChange={(v) => !v && setEditing(null)}
        title={t('settings.rename')}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label={t('common.name')}>
              <Input value={editing.name} autoFocus onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void doRename(); }} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              <Button onClick={() => void doRename()}>{t('common.save')}</Button>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}
        title={t('settings.remove')} message={removing ? t('settings.removeConfirm', { name: removing.name }) : ''}
        confirmLabel={t('common.delete')} danger
        onConfirm={async () => {
          if (!removing) return;
          const r = await invoke('masters:remove', { kind, id: removing.id });
          if (r.ok) { setRemoving(null); load(); }
        }}
      />
    </div>
  );
}

function NumberingTab() {
  const [rows, setRows] = React.useState<NumberingPattern[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState('');
  const load = React.useCallback(() => { invoke('numbering:list', undefined).then(setRows); }, []);
  React.useEffect(load, [load]);
  const save = async (key: string) => {
    const pattern = drafts[key];
    if (!pattern) return;
    const r = await invoke('numbering:set', { key, pattern });
    if (r.ok) { setMsg(t('settings.patternSaved')); load(); }
    else setMsg(r.error);
    setTimeout(() => setMsg(''), 3000);
  };
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted">{t('settings.numberingSubtitle')}</p>
      <Alert tone="brand">{t('settings.patternHint')}</Alert>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-3 rounded-xl border border-border px-4 py-3">
          <div><p className="text-sm font-medium">{r.label}</p><p className="text-xs text-faint">{r.key}</p></div>
          <Input value={drafts[r.key] ?? r.pattern} onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))} />
          <span className="text-[13px] text-muted">{t('settings.nextNumber')}: <strong className="text-text">{r.example}</strong></span>
          <Button variant="secondary" size="sm" disabled={(drafts[r.key] ?? r.pattern) === r.pattern} onClick={() => void save(r.key)}>{t('common.save')}</Button>
        </div>
      ))}
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}

function RulesTab() {
  const [rules, setRules] = React.useState<Record<string, string>>({});
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    invoke('rules:get', undefined).then((r) => { setRules(r); setDrafts(r); });
  }, []);
  const save = async () => {
    for (const [k, v] of Object.entries(drafts)) {
      if (v !== rules[k]) await invoke('rules:set', { key: k, value: v });
    }
    setRules(drafts);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };
  const fields = [
    { key: 'attendance.threshold', label: t('settings.attendanceThreshold'), type: 'number' },
    { key: 'lock.timeoutMinutes', label: t('settings.lockTimeout'), type: 'number' },
    { key: 'library_fine_per_day', label: t('settings.libraryFinePerDay'), type: 'number' },
  ];
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted">{t('settings.rulesSubtitle')}</p>
      {fields.map((f) => (
        <Field key={f.key} label={f.label}>
          <Input type={f.type} value={drafts[f.key] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))} />
        </Field>
      ))}
      <div className="flex items-center gap-3">
        <Button onClick={save}>{t('common.save')}</Button>
        {saved && <span className="text-sm text-success">{t('settings.saved')}</span>}
      </div>
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = React.useState<AuditEntry[]>([]);
  React.useEffect(() => { invoke('audit:recent', { limit: 200 }).then(setRows); }, []);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('settings.auditSubtitle')}</p>
      <DataTable
        columns={[
          { key: 'createdAt', header: t('backup.date'), render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: 'username', header: t('auth.username'), sticky: true },
          { key: 'action', header: t('common.actions') },
          { key: 'entity', header: 'Entity' },
          { key: 'entityId', header: 'ID' },
        ]}
        rows={rows}
        empty={<EmptyState title={t('settings.auditEmpty')} />}
      />
    </div>
  );
}

export function SettingsScreen({ onNavigate }: { onNavigate?: (k: string) => void }) {
  const masterTabs: { value: string; label: string; content: React.ReactNode }[] = [
    { value: 'institution', label: t('settings.tabs.institution'), content: <InstitutionTab /> },
    { value: 'sessions', label: t('settings.tabs.sessions'), content: <SessionsTab /> },
    { value: 'classes', label: t('settings.tabs.classes'), content: <MastersTab kind="class" /> },
    { value: 'subjects', label: t('settings.tabs.subjects'), content: <MastersTab kind="subject" /> },
    { value: 'feeHeads', label: t('settings.tabs.feeHeads'), content: <MastersTab kind="fee-head" /> },
    { value: 'ledgers', label: t('settings.tabs.ledgers'), content: <MastersTab kind="ledger" /> },
    { value: 'leaveTypes', label: t('settings.tabs.leaveTypes'), content: <MastersTab kind="leave-type" /> },
    { value: 'sources', label: t('settings.tabs.sources'), content: <MastersTab kind="enquiry-source" /> },
    { value: 'numbering', label: t('settings.tabs.numbering'), content: <NumberingTab /> },
    { value: 'rules', label: t('settings.tabs.rules'), content: <RulesTab /> },
    { value: 'audit', label: t('settings.tabs.audit'), content: <AuditTab /> },
  ];
  return (
    <div>
      <PageHeader
        title={t('settings.title')}
        actions={onNavigate ? [<Button key="tpl" variant="secondary" onClick={() => onNavigate('templates')}>Template studio</Button>] : undefined}
      />
      <Card><CardContent><Tabs tabs={masterTabs} /></CardContent></Card>
    </div>
  );
}
