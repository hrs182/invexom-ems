import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Dialog } from '../../components/ui/dialog';
import { DataTable, type Column } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert, ProgressBar } from '../../components/ui/feedback';
import { Tabs } from '../../components/ui/primitives';
import type { MasterItem, LeaveRow } from '@shared/types';

const today = () => new Date().toISOString().slice(0, 10);
const STATUS = ['P', 'A', 'L', 'H'] as const;

function StudentTab() {
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [className, setClassName] = React.useState('');
  const [section, setSection] = React.useState('A');
  const [date, setDate] = React.useState(today());
  const [roster, setRoster] = React.useState<{ id: number; name: string; admission_no: string; roll_no: string }[]>([]);
  const [marks, setMarks] = React.useState<Record<number, string>>({});
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    invoke('masters:list', { kind: 'class' }).then((c) => {
      setClasses(c);
      if (c.length) setClassName((prev) => prev || c[0].name);
    }).catch(() => {});
  }, []);

  const load = React.useCallback(async () => {
    if (!className) return;
    const [r, m] = await Promise.all([
      invoke('attendance:roster', { className, section }),
      invoke('attendance:get', { className, section, date }),
    ]);
    setRoster(r);
    setMarks(Object.fromEntries(r.map((s) => [s.id, m[s.id] ?? 'P'])));
  }, [className, section, date]);
  React.useEffect(() => { void load(); }, [load]);

  const markAll = (s: string) => setMarks(Object.fromEntries(roster.map((r) => [r.id, s])));

  const save = async () => {
    setMsg('');
    const r = await invoke('attendance:mark', {
      className, section, date,
      cells: roster.map((s) => ({ student_id: s.id, status: marks[s.id] ?? 'P' })),
    });
    setMsg(r.ok ? `Saved attendance for ${roster.length} students.` : r.error);
  };

  const counts = STATUS.map((s) => ({ s, n: roster.filter((r) => (marks[r.id] ?? 'P') === s).length }));

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><Label>{t('modules.attendance.class')}</Label>
          <Select value={className} onValueChange={setClassName} placeholder="Class"
            options={classes.map((c) => ({ value: c.name, label: c.name }))} className="w-36" />
        </div>
        <div><Label>{t('modules.attendance.section')}</Label><Input value={section} onChange={(e) => setSection(e.target.value)} className="w-20" /></div>
        <div><Label>{t('modules.attendance.date')}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => markAll('P')}>{t('modules.attendance.allPresent')}</Button>
          <Button onClick={() => void save()}>{t('modules.attendance.saveAttendance')}</Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        {counts.map((c) => <span key={c.s}><Badge tone={c.s === 'P' ? 'success' : c.s === 'A' ? 'danger' : 'muted'}>{c.s}</Badge> {c.n}</span>)}
        <span className="text-muted">{t('modules.attendance.tip')}</span>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2">{t('modules.attendance.roll')}</th><th className="px-3 py-2">{t('modules.attendance.student')}</th><th className="px-3 py-2">{t('modules.attendance.status')}</th>
          </tr></thead>
          <tbody>
            {roster.map((s) => (
              <tr key={s.id} className="border-b border-border">
                <td className="px-3 py-1.5 text-muted">{s.roll_no}</td>
                <td className="px-3 py-1.5 font-medium">{s.name}<span className="ml-2 text-xs text-muted">{s.admission_no}</span></td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1" role="radiogroup" aria-label={`${s.name} attendance`}>
                    {STATUS.map((st) => (
                      <button key={st} role="radio" aria-checked={(marks[s.id] ?? 'P') === st}
                        onClick={() => setMarks({ ...marks, [s.id]: st })}
                        onKeyDown={(e) => {
                          const k = e.key.toUpperCase();
                          if ((STATUS as readonly string[]).includes(k)) { setMarks({ ...marks, [s.id]: k }); e.preventDefault(); }
                        }}
                        className={`h-8 w-10 cursor-pointer rounded-lg border text-sm font-bold ${(marks[s.id] ?? 'P') === st
                          ? st === 'P' ? 'border-success bg-success-soft text-success'
                          : st === 'A' ? 'border-danger bg-danger-soft text-danger'
                          : 'border-brand bg-brand-soft text-brand'
                          : 'border-border text-muted hover:bg-surface-2'}`}>
                        {st}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StaffTab() {
  const [date, setDate] = React.useState(today());
  const [roster, setRoster] = React.useState<{ id: number; name: string; employee_code: string; designation: string }[]>([]);
  const [marks, setMarks] = React.useState<Record<number, { status: string; in_time: string; late: number }>>({});
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    const [r, m] = await Promise.all([
      invoke('staff:list', undefined),
      invoke('staff-attendance:get', { date }),
    ]);
    setRoster(r.map((s) => ({ id: s.id, name: s.name, employee_code: s.employee_code, designation: s.designation })));
    setMarks(m);
  }, [date]);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await invoke('staff-attendance:mark', {
      date,
      cells: roster.map((s) => ({ staff_id: s.id, status: marks[s.id]?.status ?? 'P', in_time: marks[s.id]?.in_time ?? '', late: !!marks[s.id]?.late })),
    });
    setMsg(r.ok ? 'Saved.' : r.error);
  };

  const set = (id: number, patch: Partial<{ status: string; in_time: string; late: number }>) =>
    setMarks((m) => ({ ...m, [id]: { status: m[id]?.status ?? 'P', in_time: m[id]?.in_time ?? '', late: m[id]?.late ?? 0, ...patch } }));

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex items-end gap-2">
        <div><Label>{t('modules.attendance.date')}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <Button className="ml-auto" onClick={() => void save()}>{t('modules.attendance.saveStaff')}</Button>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2">{t('modules.attendance.staff')}</th><th className="px-3 py-2">{t('modules.attendance.status')}</th><th className="px-3 py-2">{t('modules.attendance.inTime')}</th><th className="px-3 py-2">{t('modules.attendance.late')}</th>
          </tr></thead>
          <tbody>
            {roster.map((s) => (
              <tr key={s.id} className="border-b border-border">
                <td className="px-3 py-1.5 font-medium">{s.name}<span className="ml-2 text-xs text-muted">{s.designation}</span></td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1">
                    {STATUS.map((st) => (
                      <button key={st} onClick={() => set(s.id, { status: st })}
                        className={`h-8 w-10 cursor-pointer rounded-lg border text-sm font-bold ${(marks[s.id]?.status ?? 'P') === st ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted hover:bg-surface-2'}`}>{st}</button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-1.5"><Input type="time" className="w-28" value={marks[s.id]?.in_time ?? ''}
                  onChange={(e) => set(s.id, { in_time: e.target.value })} /></td>
                <td className="px-3 py-1.5"><input type="checkbox" checked={!!marks[s.id]?.late}
                  onChange={(e) => set(s.id, { late: e.target.checked ? 1 : 0 })} aria-label="Late" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function LeavesTab() {
  const [rows, setRows] = React.useState<LeaveRow[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ applicant_type: 'student', applicant_id: '', from_date: today(), to_date: today(), leave_type: 'Sick Leave', reason: '' });
  const [types, setTypes] = React.useState<MasterItem[]>([]);

  const load = React.useCallback(async () => {
    setRows(await invoke('leaves:list', { status: undefined }));
    setTypes(await invoke('masters:list', { kind: 'leave-type' }));
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const apply = async () => {
    const r = await invoke('leaves:apply', { ...form, applicant_id: Number(form.applicant_id) });
    if (r.ok) { setOpen(false); void load(); }
  };
  const decide = async (id: number, approve: boolean) => {
    await invoke('leaves:decide', { id, approve });
    void load();
  };

  const columns: Column<LeaveRow>[] = [
    { key: 'applicant_type', header: t('modules.attendance.applicantType') },
    { key: 'from_date', header: t('modules.attendance.from') },
    { key: 'to_date', header: t('modules.attendance.to') },
    { key: 'leave_type', header: t('modules.attendance.leaveType') },
    { key: 'reason', header: t('modules.attendance.reason') },
    {
      key: 'status', header: t('modules.attendance.status'),
      render: (r) => <Badge tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'muted'}>{r.status}</Badge>,
    },
    {
      key: 'actions', header: '',
      render: (r) => r.status === 'pending' ? (
        <div className="flex gap-1">
          <Button variant="secondary" onClick={() => void decide(r.id, true)}>{t('modules.attendance.approve')}</Button>
          <Button variant="secondary" onClick={() => void decide(r.id, false)}>{t('modules.attendance.reject')}</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setOpen(true)}>{t('modules.attendance.newLeave')}</Button></div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title={t('modules.attendance.noLeaves')} />} />
      <Dialog open={open} onOpenChange={setOpen} title={t('modules.attendance.leaveTitle')}>
        <div className="grid gap-3">
          <div><Label>{t('modules.attendance.applicantType')}</Label>
            <Select value={form.applicant_type} onValueChange={(v) => setForm({ ...form, applicant_type: v })}
              options={[{ value: 'student', label: 'Student' }, { value: 'staff', label: 'Staff' }]} /></div>
          <div><Label>{t('modules.attendance.applicantId')}</Label><Input value={form.applicant_id} onChange={(e) => setForm({ ...form, applicant_id: e.target.value })} placeholder="Student/staff ID" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t('modules.attendance.from')}</Label><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
            <div><Label>{t('modules.attendance.to')}</Label><Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
          </div>
          <div><Label>{t('modules.attendance.leaveType')}</Label>
            <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}
              options={types.map((x) => ({ value: x.name, label: x.name }))} /></div>
          <div><Label>{t('modules.attendance.reason')}</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.attendance.cancel')}</Button>
          <Button onClick={() => void apply()}>{t('modules.attendance.submit')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function PercentTab() {
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [className, setClassName] = React.useState('');
  const [section, setSection] = React.useState('A');
  const [from, setFrom] = React.useState(new Date().toISOString().slice(0, 7) + '-01');
  const [to, setTo] = React.useState(today());
  const [rows, setRows] = React.useState<{ student_id: number; name: string; admission_no: string; present: number; total: number; percent: number; below: boolean }[]>([]);

  React.useEffect(() => {
    invoke('masters:list', { kind: 'class' }).then((c) => {
      setClasses(c);
      if (c.length) setClassName((prev) => prev || c[0].name);
    }).catch(() => {});
  }, []);

  const load = async () => {
    if (!className) return;
    setRows(await invoke('attendance:percent', { className, section, from, to }));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><Label>{t('modules.attendance.class')}</Label>
          <Select value={className} onValueChange={setClassName} placeholder="Class"
            options={classes.map((c) => ({ value: c.name, label: c.name }))} className="w-36" />
        </div>
        <div><Label>{t('modules.attendance.section')}</Label><Input value={section} onChange={(e) => setSection(e.target.value)} className="w-20" /></div>
        <div><Label>{t('modules.attendance.from')}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>{t('modules.attendance.to')}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button onClick={() => void load()}>{t('modules.attendance.compute')}</Button>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2">{t('modules.attendance.student')}</th><th className="px-3 py-2 text-right">{t('modules.attendance.present')}</th>
            <th className="px-3 py-2 text-right">{t('modules.attendance.total')}</th><th className="px-3 py-2" style={{ width: 220 }}>%</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id} className="border-b border-border">
                <td className="px-3 py-1.5 font-medium">{r.name}{r.below && <Badge tone="danger" className="ml-2">{t('modules.attendance.belowThreshold')}</Badge>}</td>
                <td className="px-3 py-1.5 text-right">{r.present}</td>
                <td className="px-3 py-1.5 text-right">{r.total}</td>
                <td className="px-3 py-1.5"><ProgressBar value={r.percent} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AttendanceScreen() {
  const [tab, setTab] = React.useState('students');
  return (
    <div>
      <PageHeader title={t('nav.attendance')} />
      <Tabs
        tabs={[
          { value: 'students', label: t('modules.attendance.students'), content: <StudentTab /> },
          { value: 'staff', label: t('modules.attendance.staff'), content: <StaffTab /> },
          { value: 'leaves', label: t('modules.attendance.leaves'), content: <LeavesTab /> },
          { value: 'percent', label: t('modules.attendance.percent'), content: <PercentTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
    </div>
  );
}
