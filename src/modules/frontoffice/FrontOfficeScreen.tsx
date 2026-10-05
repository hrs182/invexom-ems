import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label, Textarea } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Dialog } from '../../components/ui/dialog';
import { DataTable, type Column } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert, StatCard } from '../../components/ui/feedback';
import { Tabs } from '../../components/ui/primitives';
import type { EnquiryRow, MasterItem } from '@shared/types';

const today = () => new Date().toISOString().slice(0, 10);
const waLink = (phone: string, text: string) =>
  `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;

function EnquiriesTab() {
  const [rows, setRows] = React.useState<EnquiryRow[]>([]);
  const [filter, setFilter] = React.useState('open');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', phone: '', class_interested: '', source: 'Walk-in', followup_date: today(), counsellor: '', notes: '' });
  const [sources, setSources] = React.useState<MasterItem[]>([]);
  const [fuOpen, setFuOpen] = React.useState(false);
  const [fuEnq, setFuEnq] = React.useState<EnquiryRow | null>(null);
  const [fuForm, setFuForm] = React.useState({ outcome: '', notes: '', nextDate: today() });
  const [convOpen, setConvOpen] = React.useState(false);
  const [convClass, setConvClass] = React.useState('');
  const [convSection, setConvSection] = React.useState('');
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    const f = filter === 'today' ? { today: true } : filter === 'overdue' ? { overdue: true } : { status: filter === 'all' ? undefined : filter };
    setRows(await invoke('enquiries:list', f));
    setSources(await invoke('masters:list', { kind: 'enquiry-source' }));
  }, [filter]);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setMsg('');
    const r = await invoke('enquiries:create', form);
    if (!r.ok) { setMsg(r.error); return; }
    setOpen(false);
    setForm({ name: '', phone: '', class_interested: '', source: 'Walk-in', followup_date: today(), counsellor: '', notes: '' });
    void load();
  };

  const saveFollowup = async () => {
    if (!fuEnq) return;
    const r = await invoke('enquiries:followup', { id: fuEnq.id, outcome: fuForm.outcome, notes: fuForm.notes, nextDate: fuForm.nextDate });
    if (r.ok) { setFuOpen(false); void load(); } else setMsg(r.error);
  };

  const convert = async () => {
    if (!fuEnq) return;
    const r = await invoke('enquiries:convert', { id: fuEnq.id, className: convClass, section: convSection });
    if (!r.ok) { setMsg(r.error); return; }
    setConvOpen(false); setFuOpen(false);
    setMsg(`Admitted as ${r.admission_no}.`);
    void load();
  };

  const markLost = async (id: number) => {
    await invoke('enquiries:lost', { id });
    void load();
  };

  const columns: Column<EnquiryRow>[] = [
    {
      key: 'name', header: 'Name',
      render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{r.phone}</div></div>,
    },
    { key: 'class_interested', header: 'Class' },
    { key: 'source', header: 'Source' },
    { key: 'followup_date', header: t('modules.frontoffice.followUp') },
    { key: 'counsellor', header: 'Counsellor' },
    {
      key: 'status', header: 'Status',
      render: (r) => <Badge tone={r.status === 'open' ? 'brand' : r.status === 'converted' ? 'success' : 'muted'}>{r.status}</Badge>,
    },
    {
      key: 'actions', header: '',
      render: (r) => r.status === 'open' ? (
        <div className="flex gap-1">
          <Button variant="secondary" onClick={() => { setFuEnq(r); setFuForm({ outcome: '', notes: '', nextDate: today() }); setFuOpen(true); }}>{t('modules.frontoffice.followUp')}</Button>
          <a target="_blank" rel="noreferrer" href={waLink(r.phone, `Hello ${r.name}, this is a follow-up regarding your enquiry for class ${r.class_interested}. Let us know if you have any questions!`)}>
            <Button variant="secondary">{t('modules.frontoffice.whatsapp')}</Button>
          </a>
          <Button variant="secondary" onClick={() => void markLost(r.id)}>{t('modules.frontoffice.lost')}</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex items-end gap-2">
        <div><Label>Show</Label>
          <Select value={filter} onValueChange={setFilter} placeholder="Filter"
            options={[
              { value: 'open', label: 'Open' }, { value: 'today', label: 'Due today' },
              { value: 'overdue', label: 'Overdue' }, { value: 'converted', label: 'Converted' },
              { value: 'lost', label: 'Lost' }, { value: 'all', label: 'All' },
            ]} className="w-40" />
        </div>
        <Button className="ml-auto" onClick={() => setOpen(true)}>+ New enquiry</Button>
      </div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title={t('modules.frontoffice.noEnquiries')} />} />

      <Dialog open={open} onOpenChange={setOpen} title={t('modules.frontoffice.enquiryTitle')}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Class interested</Label><Input value={form.class_interested} onChange={(e) => setForm({ ...form, class_interested: e.target.value })} /></div>
          <div><Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}
              options={sources.map((s) => ({ value: s.name, label: s.name }))} />
          </div>
          <div><Label>{t('modules.frontoffice.nextFollowUp')}</Label><Input type="date" value={form.followup_date} onChange={(e) => setForm({ ...form, followup_date: e.target.value })} /></div>
          <div><Label>Counsellor</Label><Input value={form.counsellor} onChange={(e) => setForm({ ...form, counsellor: e.target.value })} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.frontoffice.cancel')}</Button>
          <Button onClick={() => void save()}>Save enquiry</Button>
        </div>
      </Dialog>

      <Dialog open={fuOpen} onOpenChange={setFuOpen} title={t('modules.frontoffice.followUpTitle', { n: fuEnq?.name ?? '' })}>
        <div className="grid gap-3">
          <div><Label>{t('modules.frontoffice.outcome')}</Label><Input value={fuForm.outcome} onChange={(e) => setFuForm({ ...fuForm, outcome: e.target.value })} placeholder="e.g. Interested, asked for fee details" /></div>
          <div><Label>{t('modules.frontoffice.notes')}</Label><Textarea value={fuForm.notes} onChange={(e) => setFuForm({ ...fuForm, notes: e.target.value })} /></div>
          <div><Label>{t('modules.frontoffice.nextFollowUp')}</Label><Input type="date" value={fuForm.nextDate} onChange={(e) => setFuForm({ ...fuForm, nextDate: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-between">
          <Button variant="secondary" onClick={() => setConvOpen(true)}>{t('modules.frontoffice.convertTo')}</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setFuOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveFollowup()}>Log follow-up</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={convOpen} onOpenChange={setConvOpen} title={t('modules.frontoffice.convertTitle')}>
        <p className="mb-3 text-sm text-muted">{t('modules.frontoffice.convertHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Class</Label><Input value={convClass} onChange={(e) => setConvClass(e.target.value)} placeholder={fuEnq?.class_interested} /></div>
          <div><Label>Section</Label><Input value={convSection} onChange={(e) => setConvSection(e.target.value)} placeholder="A" /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConvOpen(false)}>Back</Button>
          <Button onClick={() => void convert()}>{t('modules.frontoffice.admit')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function VisitorsTab() {
  const [rows, setRows] = React.useState<{ id: number; name: string; phone: string; purpose: string; whom_to_meet: string; in_time: string; out_time: string }[]>([]);
  const [form, setForm] = React.useState({ name: '', phone: '', purpose: '', whom_to_meet: '', in_time: new Date().toTimeString().slice(0, 5) });

  const load = React.useCallback(async () => setRows(await invoke('visitors:list', { date: today() })), []);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await invoke('visitors:log', form);
    if (r.ok) { setForm({ name: '', phone: '', purpose: '', whom_to_meet: '', in_time: new Date().toTimeString().slice(0, 5) }); void load(); }
  };
  const out = async (id: number) => {
    await invoke('visitors:out', { id, outTime: new Date().toTimeString().slice(0, 5) });
    void load();
  };

  return (
    <div>
      <Card className="mb-4 p-4">
        <h4 className="mb-3 font-medium">{t('modules.frontoffice.logVisitor')}</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Purpose</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
          <div><Label>Whom to meet</Label><Input value={form.whom_to_meet} onChange={(e) => setForm({ ...form, whom_to_meet: e.target.value })} /></div>
          <div className="flex items-end"><Button onClick={() => void save()}>Check in</Button></div>
        </div>
      </Card>
      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'phone', header: 'Phone' },
          { key: 'purpose', header: 'Purpose' },
          { key: 'whom_to_meet', header: 'To meet' },
          { key: 'in_time', header: 'In' },
          { key: 'out_time', header: 'Out', render: (r) => r.out_time || <Button variant="secondary" onClick={() => void out(r.id)}>{t('modules.frontoffice.checkOut')}</Button> },
        ]}
        rows={rows}
        empty={<EmptyState title={t('modules.frontoffice.noVisitors')} />}
      />
    </div>
  );
}

function ComplaintsTab() {
  const [rows, setRows] = React.useState<{ id: number; date: string; complainant: string; phone: string; type: string; description: string; status: string }[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ complainant: '', phone: '', type: '', description: '' });
  const [types, setTypes] = React.useState<MasterItem[]>([]);

  const load = React.useCallback(async () => {
    setRows(await invoke('complaints:list', {}));
    setTypes(await invoke('masters:list', { kind: 'complaint-type' }));
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await invoke('complaints:create', form);
    if (r.ok) { setOpen(false); setForm({ complainant: '', phone: '', type: '', description: '' }); void load(); }
  };
  const setStatus = async (id: number, status: string) => {
    await invoke('complaints:status', { id, status, notes: '' });
    void load();
  };

  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setOpen(true)}>{t('modules.frontoffice.newComplaint')}</Button></div>
      <DataTable
        columns={[
          { key: 'date', header: 'Date' },
          { key: 'complainant', header: 'Complainant' },
          { key: 'type', header: 'Type' },
          { key: 'description', header: 'Description' },
          { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'resolved' ? 'success' : r.status === 'in-progress' ? 'warning' : 'danger'}>{r.status}</Badge> },
          {
            key: 'actions', header: '',
            render: (r) => r.status !== 'resolved' ? (
              <div className="flex gap-1">
                {r.status === 'open' && <Button variant="secondary" onClick={() => void setStatus(r.id, 'in-progress')}>{t('modules.frontoffice.start')}</Button>}
                <Button variant="secondary" onClick={() => void setStatus(r.id, 'resolved')}>{t('modules.frontoffice.resolve')}</Button>
              </div>
            ) : null,
          },
        ]}
        rows={rows}
        empty={<EmptyState title={t('modules.frontoffice.noComplaints')} />}
      />
      <Dialog open={open} onOpenChange={setOpen} title={t('modules.frontoffice.complaintTitle')}>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Complainant</Label><Input value={form.complainant} onChange={(e) => setForm({ ...form, complainant: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} placeholder="Type"
              options={types.map((x) => ({ value: x.name, label: x.name }))} />
          </div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.frontoffice.cancel')}</Button>
          <Button onClick={() => void save()}>{t('modules.frontoffice.save')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function ConversionTab() {
  const [report, setReport] = React.useState<{ bySource: { source: string; enquiries: number; converted: number; rate: number }[]; byCounsellor: { counsellor: string; enquiries: number; converted: number; rate: number }[] } | null>(null);

  React.useEffect(() => { invoke('frontoffice:conversionReport', undefined).then(setReport).catch(() => {}); }, []);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="p-4"><h4 className="mb-2 font-semibold">{t('modules.frontoffice.bySource')}</h4>
        {report?.bySource.map((r) => (
          <div key={r.source} className="flex items-center justify-between py-1.5 text-sm">
            <span>{r.source || '(unspecified)'}</span>
            <span className="text-muted">{r.converted}/{r.enquiries} <strong className="text-text">{r.rate}%</strong></span>
          </div>
        ))}
        {!report?.bySource.length && <p className="text-sm text-muted">{t('modules.frontoffice.noData')}</p>}
      </Card>
      <Card className="p-4"><h4 className="mb-2 font-semibold">{t('modules.frontoffice.byCounsellor')}</h4>
        {report?.byCounsellor.map((r) => (
          <div key={r.counsellor} className="flex items-center justify-between py-1.5 text-sm">
            <span>{r.counsellor}</span>
            <span className="text-muted">{r.converted}/{r.enquiries} <strong className="text-text">{r.rate}%</strong></span>
          </div>
        ))}
        {!report?.byCounsellor.length && <p className="text-sm text-muted">{t('modules.frontoffice.noData')}</p>}
      </Card>
    </div>
  );
}

export function FrontOfficeScreen() {
  const [tab, setTab] = React.useState('enquiries');
  const [due, setDue] = React.useState(0);
  React.useEffect(() => {
    invoke('enquiries:list', { overdue: true }).then((r) => setDue(r.length)).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader
        title={t('nav.frontoffice')}
        actions={due > 0 ? [<StatCard key="d" label={t('modules.frontoffice.followUp')} value={String(due)} />] : undefined}
      />
      <Tabs
        tabs={[
          { value: 'enquiries', label: t('modules.frontoffice.enquiries'), content: <EnquiriesTab /> },
          { value: 'visitors', label: t('modules.frontoffice.visitors'), content: <VisitorsTab /> },
          { value: 'complaints', label: t('modules.frontoffice.complaints'), content: <ComplaintsTab /> },
          { value: 'conversion', label: t('modules.frontoffice.conversion'), content: <ConversionTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
    </div>
  );
}
