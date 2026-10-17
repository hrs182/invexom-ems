import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { SalarySlipPrint, PayrollRegisterPrint } from '../../components/print/documents';
import { downloadExcel } from '../../lib/exportExcel';
import { Dialog } from '../../components/ui/dialog';
import { DataTable, type Column } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert, StatCard, TabFooter } from '../../components/ui/feedback';
import { Tabs } from '../../components/ui/primitives';
import type { StaffDetail, SalaryComponent, PayrollLine } from '@shared/types';

const STAFF_FIELDS: { key: keyof StaffDetail; label: string; type?: string }[] = [
  { key: 'name', label: 'Full name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'joining_date', label: 'Joining date', type: 'date' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'gender', label: 'Gender' },
  { key: 'pan', label: 'PAN' },
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'bank_name', label: 'Bank name' },
  { key: 'bank_account', label: 'Bank account' },
  { key: 'bank_ifsc', label: 'Bank IFSC' },
  { key: 'address', label: 'Address' },
];

function StaffTab() {
  const [rows, setRows] = React.useState<StaffDetail[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StaffDetail | null>(null);
  const [form, setForm] = React.useState<Partial<StaffDetail>>({});
  const [structOpen, setStructOpen] = React.useState(false);
  const [structStaff, setStructStaff] = React.useState<StaffDetail | null>(null);
  const [components, setComponents] = React.useState<SalaryComponent[]>([]);
  const [msg, setMsg] = React.useState('');
  const [q, setQ] = React.useState('');
  const [desigFilter, setDesigFilter] = React.useState('');
  const [deptFilter, setDeptFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');

  const load = React.useCallback(async () => setRows(await invoke('staff:full:list', undefined)), []);
  React.useEffect(() => { void load(); }, [load]);

  const designations = React.useMemo(() => [...new Set(rows.map((r) => r.designation).filter(Boolean))].sort(), [rows]);
  const departments = React.useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), [rows]);
  const filtered = rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.employee_code.toLowerCase().includes(q.toLowerCase()) || r.phone.includes(q)) &&
    (!desigFilter || r.designation === desigFilter) &&
    (!deptFilter || r.department === deptFilter) &&
    (!statusFilter || r.status === statusFilter)
  );

  const exportExcel = () => {
    downloadExcel(`staff-${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Staff',
      rows: filtered.map((r) => ({
        'Employee Code': r.employee_code, 'Name': r.name,
        'Designation': r.designation, 'Department': r.department,
        'Phone': r.phone, 'Email': r.email,
        'Joining Date': r.joining_date, 'Status': r.status,
      })),
    }]);
  };

  const openAdd = () => { setEditing(null); setForm({}); setOpen(true); };
  const openEdit = async (r: StaffDetail) => {
    const full = await invoke('staff:full:get', { id: r.id });
    setEditing(r); setForm(full ?? r); setOpen(true);
  };
  const save = async () => {
    setMsg('');
    const r = editing
      ? await invoke('staff:full:update', { id: editing.id, patch: form })
      : await invoke('staff:full:create', form);
    if (!r.ok) { setMsg(r.error); return; }
    setOpen(false); void load();
  };

  const openStructure = async (r: StaffDetail) => {
    const full = await invoke('staff:full:get', { id: r.id });
    setStructStaff(r);
    setComponents(full?.structure ?? []);
    setStructOpen(true);
  };
  const saveStructure = async () => {
    if (!structStaff) return;
    const r = await invoke('staff:salary:save', { staffId: structStaff.id, components });
    if (r.ok) { setStructOpen(false); setMsg('Salary structure saved.'); }
    else setMsg(r.error);
  };
  const addComp = (kind: 'earning' | 'deduction') =>
    setComponents([...components, { component: '', kind, amount: 0, is_percent: 0, percent_of: 'basic' }]);

  const columns: Column<StaffDetail>[] = [
    { key: 'employee_code', header: 'Code' },
    {
      key: 'name', header: 'Name',
      render: (r) => <button className="cursor-pointer font-medium text-brand hover:underline" onClick={() => void openEdit(r)}>{r.name}</button>,
    },
    { key: 'designation', header: 'Designation' },
    { key: 'phone', header: 'Phone' },
    {
      key: 'salary', header: 'Salary',
      render: (r) => <Button variant="secondary" onClick={() => void openStructure(r)}>Structure</Button>,
    },
  ];

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><Label>Search</Label>
          <Input placeholder="Name, code or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </div>
        <div><Label>Designation</Label>
          <Select value={desigFilter} onValueChange={setDesigFilter} placeholder="All"
            options={[{ value: '', label: 'All' }, ...designations.map((d) => ({ value: d, label: d }))]} className="w-40" />
        </div>
        <div><Label>Department</Label>
          <Select value={deptFilter} onValueChange={setDeptFilter} placeholder="All"
            options={[{ value: '', label: 'All' }, ...departments.map((d) => ({ value: d, label: d }))]} className="w-40" />
        </div>
        <div><Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter} placeholder="All"
            options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} className="w-32" />
        </div>
        {(q || desigFilter || deptFilter || statusFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(''); setDesigFilter(''); setDeptFilter(''); setStatusFilter(''); }}>Clear</Button>
        )}
        <div className="ml-auto flex items-end gap-2">
          <Button variant="secondary" className="no-print" onClick={exportExcel} disabled={filtered.length === 0}>{t('common.excel')}</Button>
          <Button onClick={openAdd}>{t('modules.staff.addStaff')}</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={filtered} empty={<EmptyState title={t('modules.staff.noStaff')} actionLabel={t('modules.staff.addStaff')} onAction={openAdd} />} />

      <Dialog open={open} onOpenChange={setOpen} title={editing ? t('modules.staff.editStaff') : t('modules.staff.newStaff')} wide>
        <div className="grid grid-cols-2 gap-3">
          {STAFF_FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input type={f.type ?? 'text'} value={String(form[f.key] ?? '')}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.staff.cancel')}</Button>
          <Button onClick={() => void save()}>{t('modules.staff.save')}</Button>
        </div>
      </Dialog>

      <Dialog open={structOpen} onOpenChange={setStructOpen} title={t('modules.staff.structureFor', { n: structStaff?.name ?? '' })} wide>
        <div className="mb-2 flex gap-2">
          <Button variant="secondary" onClick={() => addComp('earning')}>{t('modules.staff.addEarning')}</Button>
          <Button variant="secondary" onClick={() => addComp('deduction')}>{t('modules.staff.addDeduction')}</Button>
        </div>
        {components.map((c, i) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_110px_110px_110px_40px] items-center gap-2">
            <Input placeholder="Component (e.g. Basic, HRA, PF)" value={c.component}
              onChange={(e) => setComponents(components.map((x, j) => j === i ? { ...x, component: e.target.value } : x))} />
            <Badge tone={c.kind === 'earning' ? 'success' : 'warning'}>{c.kind}</Badge>
            <Input type="number" value={c.amount}
              onChange={(e) => setComponents(components.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={!!c.is_percent}
                onChange={(e) => setComponents(components.map((x, j) => j === i ? { ...x, is_percent: e.target.checked ? 1 : 0 } : x))} /> % of
            </label>
            <button className="cursor-pointer text-danger" onClick={() => setComponents(components.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
          </div>
        ))}
        <p className="mt-1 text-xs text-muted">% components compute off Basic (or Gross for ESI-style). PF/ESI rates configurable in Settings → Rules.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStructOpen(false)}>{t('modules.staff.cancel')}</Button>
          <Button onClick={() => void saveStructure()}>{t('modules.staff.save')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function PayrollTab() {
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [run, setRun] = React.useState<{ id: number; month: string; status: string } | null>(null);
  const [lines, setLines] = React.useState<PayrollLine[]>([]);
  const [msg, setMsg] = React.useState('');
  const [slip, setSlip] = React.useState<PayrollLine | null>(null);

  const load = React.useCallback(async () => {
    const r = await invoke('payroll:get', { month });
    setRun(r.run); setLines(r.lines);
  }, [month]);
  React.useEffect(() => { void load(); }, [load]);

  const runPayroll = async () => {
    setMsg('');
    const r = await invoke('payroll:run', { month });
    if (!r.ok) { setMsg(r.error); return; }
    setMsg(`Payroll computed for ${r.lines.length} staff.`);
    void load();
  };

  const adjust = async (line: PayrollLine, field: 'arrears' | 'bonus', value: number) => {
    const r = await invoke('payroll:adjust', {
      lineId: line.id,
      arrears: field === 'arrears' ? value : line.arrears,
      bonus: field === 'bonus' ? value : line.bonus,
    });
    if (r.ok) void load(); else setMsg(r.error);
  };

  const finalize = async () => {
    if (!run) return;
    if (!confirm(`Finalize payroll for ${month}? This posts salary vouchers to accounting.`)) return;
    const r = await invoke('payroll:finalize', { runId: run.id });
    setMsg(r.ok ? `Finalized — ${r.count} salary vouchers posted.` : r.error);
    void load();
  };

  const total = lines.reduce((a, l) => a + l.net, 0);

  const exportPayrollExcel = () => {
    downloadExcel(`salary-register-${month}`, [{
      name: `Salary ${month}`,
      rows: lines.map((l) => ({
        'Employee Code': l.employee_code, 'Name': l.staff_name,
        'Designation': l.designation, 'Department': l.department,
        'Payable Days': l.payable_days, 'LOP Days': l.lop_days,
        'Gross': l.gross, 'Deductions': l.total_deductions,
        'Arrears': l.arrears, 'Bonus': l.bonus, 'Net Pay': l.net,
      })),
    }]);
  };

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div><Label>{t('modules.staff.month')}</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" /></div>
        <Button onClick={() => void runPayroll()}>{t('modules.staff.runPayroll')}</Button>
        {run && <Badge tone={run.status === 'finalized' ? 'success' : 'muted'}>{run.status}</Badge>}
        <div className="ml-auto flex items-end gap-2">
          <StatCard label={t('modules.staff.totalPayout')} value={`₹${total.toFixed(2)}`} />
          {run?.status !== 'finalized' && lines.length > 0 && <Button onClick={() => void finalize()}>{t('modules.staff.finalize')}</Button>}
          <Button variant="secondary" className="no-print" onClick={() => window.print()} disabled={lines.length === 0}>{t('modules.staff.printRegister')}</Button>
          <Button variant="secondary" className="no-print" onClick={exportPayrollExcel} disabled={lines.length === 0}>{t('common.excel')}</Button>
        </div>
      </div>

      {lines.length === 0 ? <EmptyState title={t('modules.staff.noPayroll')} /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-2">{t('modules.staff.staff')}</th><th className="px-3 py-2 text-right">{t('modules.staff.payableDays')}</th>
              <th className="px-3 py-2 text-right">{t('modules.staff.lop')}</th><th className="px-3 py-2 text-right">{t('modules.staff.gross')}</th>
              <th className="px-3 py-2 text-right">{t('modules.staff.deductions')}</th><th className="px-3 py-2 text-right">{t('modules.staff.arrears')}</th>
              <th className="px-3 py-2 text-right">{t('modules.staff.bonus')}</th><th className="px-3 py-2 text-right">{t('modules.staff.net')}</th>
              <th className="px-3 py-2 no-print"></th>
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border">
                  <td className="px-3 py-1.5 font-medium">{l.staff_name}<div className="text-xs text-muted">{l.employee_code}</div></td>
                  <td className="px-3 py-1.5 text-right">{l.payable_days}</td>
                  <td className="px-3 py-1.5 text-right">{l.lop_days}</td>
                  <td className="px-3 py-1.5 text-right">₹{l.gross.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right">₹{l.total_deductions.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Input type="number" className="h-7 w-24 text-right" disabled={run?.status === 'finalized'}
                      value={l.arrears} onChange={(e) => void adjust(l, 'arrears', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Input type="number" className="h-7 w-24 text-right" disabled={run?.status === 'finalized'}
                      value={l.bonus} onChange={(e) => void adjust(l, 'bonus', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold">₹{l.net.toFixed(2)}</td>
                  <td className="px-3 py-1.5 no-print"><Button variant="secondary" onClick={() => setSlip(l)}>{t('modules.staff.slip')}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {lines.length > 0 && !slip && <PayrollRegisterPrint month={month} lines={lines} />}
      <Dialog open={!!slip} onOpenChange={(v) => !v && setSlip(null)} title={t('modules.staff.slipTitle', { m: month })}>
        {slip && (
          <>
            <div className="print-area">
              <div className="mb-4 text-center"><h3 className="text-lg font-bold">Salary Slip</h3><p className="text-sm text-muted">{month}</p></div>
              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted">Name:</span> <strong>{slip.staff_name}</strong></div>
                <div><span className="text-muted">Code:</span> {slip.employee_code}</div>
                <div><span className="text-muted">Designation:</span> {slip.designation || '—'}</div>
                <div><span className="text-muted">Department:</span> {slip.department || '—'}</div>
                <div><span className="text-muted">Payable days:</span> {slip.payable_days}</div>
                <div><span className="text-muted">LOP:</span> {slip.lop_days}</div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><h4 className="mb-1 font-semibold">Earnings</h4>
                  {slip.earnings.map((e) => <div key={e.component} className="flex justify-between py-0.5"><span>{e.component}</span><span>₹{e.amount.toFixed(2)}</span></div>)}
                  {slip.bonus > 0 && <div className="flex justify-between py-0.5"><span>Bonus</span><span>₹{slip.bonus.toFixed(2)}</span></div>}
                  {slip.arrears > 0 && <div className="flex justify-between py-0.5"><span>Arrears</span><span>₹{slip.arrears.toFixed(2)}</span></div>}
                </div>
                <div><h4 className="mb-1 font-semibold">Deductions</h4>
                  {slip.deductions.map((d) => <div key={d.component} className="flex justify-between py-0.5"><span>{d.component}</span><span>₹{d.amount.toFixed(2)}</span></div>)}
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-2 text-right text-lg font-bold">Net pay: ₹{slip.net.toFixed(2)}</div>
              {slip.bank_account && <p className="mt-1 text-sm text-muted">Bank: {slip.bank_name} · A/c {slip.bank_account}</p>}
            </div>
            <div className="no-print mt-4 flex justify-end"><Button onClick={() => window.print()}>{t('modules.fees.printPdf')}</Button></div>
          </>
        )}
      </Dialog>
      {slip && (
        <SalarySlipPrint slip={{
          month, employee_code: slip.employee_code, name: slip.staff_name,
          designation: slip.designation, department: slip.department,
          payable_days: slip.payable_days, lop_days: slip.lop_days,
          bank_name: slip.bank_name, bank_account: slip.bank_account,
          earnings: [
            ...slip.earnings,
            ...(slip.bonus > 0 ? [{ component: 'Bonus', amount: slip.bonus }] : []),
            ...(slip.arrears > 0 ? [{ component: 'Arrears', amount: slip.arrears }] : []),
          ],
          deductions: slip.deductions,
          gross: slip.gross, totalDeductions: slip.total_deductions, net: slip.net,
        }} />
      )}
    </div>
  );
}

export function StaffScreen() {
  const [tab, setTab] = React.useState('staff');
  return (
    <div>
      <PageHeader title={t('nav.staff')} />
      <Tabs
        tabs={[
          { value: 'staff', label: t('modules.staff.staff'), content: <StaffTab /> },
          { value: 'payroll', label: t('modules.staff.payroll'), content: <PayrollTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
      <TabFooter>
        <strong>Staff & payroll:</strong> Add staff with their salary structure (Basic, HRA, PF, …).
        Run payroll for a month to generate salary slips; LOP = Loss of Pay days deducted from payable days.
        Finalized payroll runs are locked and cannot be edited.
      </TabFooter>
    </div>
  );
}
