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
import type { VoucherRow, MasterItem } from '@shared/types';

const today = () => new Date().toISOString().slice(0, 10);

function VouchersTab() {
  const [rows, setRows] = React.useState<VoucherRow[]>([]);
  const [open, setOpen] = React.useState(false);
  const [ledgers, setLedgers] = React.useState<MasterItem[]>([]);
  const [type, setType] = React.useState<'receipt' | 'payment' | 'journal' | 'contra'>('payment');
  const [form, setForm] = React.useState({ date: today(), ledger_name: '', amount: '', mode: 'cash', narration: '' });
  const [filterType, setFilterType] = React.useState('');
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    setRows(await invoke('vouchers:list', { type: filterType || undefined, limit: 200 }));
    setLedgers(await invoke('masters:list', { kind: 'ledger' }));
  }, [filterType]);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setMsg('');
    const r = await invoke('vouchers:create', {
      type, date: form.date, ledger_id: null, ledger_name: form.ledger_name,
      amount: parseFloat(form.amount) || 0, mode: form.mode, narration: form.narration,
    });
    if (!r.ok) { setMsg(r.error); return; }
    setOpen(false);
    setForm({ date: today(), ledger_name: '', amount: '', mode: 'cash', narration: '' });
    void load();
  };

  const columns: Column<VoucherRow>[] = [
    { key: 'voucher_no', header: 'Voucher no.', render: (r) => <span className="font-medium">{r.voucher_no}</span> },
    { key: 'date', header: t('modules.accounting.date') },
    { key: 'type', header: t('modules.accounting.type'), render: (r) => <Badge tone={r.type === 'receipt' ? 'success' : r.type === 'payment' ? 'danger' : 'muted'}>{r.type}</Badge> },
    { key: 'ledger_name', header: t('modules.accounting.ledger') },
    { key: 'amount', header: t('modules.accounting.amount'), render: (r) => `₹${r.amount.toFixed(2)}` },
    { key: 'mode', header: t('modules.accounting.mode') },
    { key: 'narration', header: t('modules.accounting.narration') },
  ];

  return (
    <div>
      {msg && <Alert tone="danger" title="Error" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex items-end gap-2">
        <div><Label>{t('modules.accounting.type')}</Label>
          <Select value={filterType} onValueChange={setFilterType} placeholder="All types"
            options={[{ value: '', label: t('modules.accounting.allTypes') }, { value: 'receipt', label: 'Receipt' }, { value: 'payment', label: 'Payment' }, { value: 'journal', label: 'Journal' }, { value: 'contra', label: 'Contra' }]} className="w-40" />
        </div>
        <Button className="ml-auto" onClick={() => setOpen(true)}>+ New voucher</Button>
      </div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title={t('modules.accounting.noVouchers')} />} />
      <Dialog open={open} onOpenChange={setOpen} title={t('modules.accounting.voucherTitle')}>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t('modules.accounting.type')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}
                options={[{ value: 'receipt', label: 'Receipt' }, { value: 'payment', label: 'Payment' }, { value: 'journal', label: 'Journal' }, { value: 'contra', label: 'Contra' }]} />
            </div>
            <div><Label>{t('modules.accounting.date')}</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div><Label>{t('modules.accounting.ledger')}</Label>
            <Input list="ledger-list" value={form.ledger_name} onChange={(e) => setForm({ ...form, ledger_name: e.target.value })} placeholder="e.g. Stationery" />
            <datalist id="ledger-list">{ledgers.map((l) => <option key={l.id} value={l.name} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>{t('modules.accounting.mode')}</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}
                options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }, { value: 'upi', label: 'UPI' }]} />
            </div>
          </div>
          <div><Label>{t('modules.accounting.narration')}</Label><Textarea value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.accounting.cancel')}</Button>
          <Button onClick={() => void save()}>{t('modules.accounting.save')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function ReportsTab() {
  const [from, setFrom] = React.useState(new Date().toISOString().slice(0, 7) + '-01');
  const [to, setTo] = React.useState(today());
  const [summary, setSummary] = React.useState<{ income: { ledger: string; total: number }[]; expense: { ledger: string; total: number }[]; totalIncome: number; totalExpense: number } | null>(null);
  const [daybook, setDaybook] = React.useState<VoucherRow[]>([]);
  const [msg, setMsg] = React.useState('');

  const load = async () => {
    setSummary(await invoke('accounting:incomeExpense', { from, to }));
    setDaybook(await invoke('vouchers:list', { from, to, limit: 5000 }));
  };

  const tally = async () => {
    setMsg('');
    const r = await invoke('accounting:tallyExport', { from, to });
    setMsg(r.ok ? `Tally XML saved.` : r.error === 'cancelled' ? '' : r.error);
  };

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button onClick={() => void load()}>{t('modules.accounting.run')}</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => void tally()}>{t('modules.accounting.tallyExport')}</Button>
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>{t('modules.accounting.print')}</Button>
        </div>
      </div>
      {summary && (
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <StatCard label={t('modules.accounting.totalIncome')} value={`₹${summary.totalIncome.toFixed(2)}`} />
          <StatCard label={t('modules.accounting.totalExpense')} value={`₹${summary.totalExpense.toFixed(2)}`} />
          <StatCard label={t('modules.accounting.surplus')} value={`₹${(summary.totalIncome - summary.totalExpense).toFixed(2)}`} />
        </div>
      )}
      {summary && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Card className="p-4"><h4 className="mb-2 font-semibold">{t('modules.accounting.incomeByLedger')}</h4>
            {summary.income.map((r) => <div key={r.ledger} className="flex justify-between py-1 text-sm"><span>{r.ledger}</span><span className="font-medium">₹{r.total.toFixed(2)}</span></div>)}
          </Card>
          <Card className="p-4"><h4 className="mb-2 font-semibold">{t('modules.accounting.expenseByLedger')}</h4>
            {summary.expense.map((r) => <div key={r.ledger} className="flex justify-between py-1 text-sm"><span>{r.ledger}</span><span className="font-medium">₹{r.total.toFixed(2)}</span></div>)}
          </Card>
        </div>
      )}
      {daybook.length > 0 && (
        <Card className="p-0">
          <h4 className="px-4 pt-4 font-semibold">Day book</h4>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-2">Date</th><th className="px-4 py-2">Voucher</th><th className="px-4 py-2">Ledger</th>
              <th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Narration</th>
            </tr></thead>
            <tbody>{daybook.map((v) => (
              <tr key={v.id} className="border-b border-border">
                <td className="px-4 py-1.5">{v.date}</td><td className="px-4 py-1.5">{v.voucher_no}</td>
                <td className="px-4 py-1.5">{v.ledger_name} <Badge tone={v.type === 'receipt' ? 'success' : 'danger'}>{v.type}</Badge></td>
                <td className="px-4 py-1.5 text-right">₹{v.amount.toFixed(2)}</td><td className="px-4 py-1.5 text-muted">{v.narration}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ExpensesTab() {
  const [rows, setRows] = React.useState<{ id: number; date: string; ledger_name: string; amount: number; narration: string; bill_no: string; status: string; entered_by_name: string }[]>([]);
  const [open, setOpen] = React.useState(false);
  const [ledgers, setLedgers] = React.useState<MasterItem[]>([]);
  const [form, setForm] = React.useState({ date: today(), ledger_name: '', amount: '', narration: '', bill_no: '' });
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    setRows(await invoke('expenses:list', {}));
    setLedgers(await invoke('masters:list', { kind: 'ledger' }));
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await invoke('expenses:create', {
      date: form.date, ledger_id: null, ledger_name: form.ledger_name,
      amount: parseFloat(form.amount) || 0, narration: form.narration, bill_no: form.bill_no,
    });
    if (!r.ok) { setMsg(r.error); return; }
    setOpen(false); setForm({ date: today(), ledger_name: '', amount: '', narration: '', bill_no: '' });
    void load();
  };

  const decide = async (id: number, approve: boolean) => {
    const r = await invoke('expenses:decide', { id, approve });
    if (!r.ok) setMsg(r.error);
    void load();
  };

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <div>
      {msg && <Alert tone="danger" title="Error" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="warning">{t('modules.accounting.pendingApproval', { n: pending.length })}</Badge>
        <Button className="ml-auto" onClick={() => setOpen(true)}>+ Add expense</Button>
      </div>
      <DataTable
        columns={[
          { key: 'date', header: t('modules.accounting.date') },
          { key: 'ledger_name', header: t('modules.accounting.ledger') },
          { key: 'narration', header: t('modules.accounting.narration') },
          { key: 'bill_no', header: t('modules.accounting.billNo') },
          { key: 'amount', header: t('modules.accounting.amount'), render: (r) => `₹${r.amount.toFixed(2)}` },
          { key: 'entered_by_name', header: t('modules.accounting.enteredBy') },
          { key: 'status', header: t('modules.fees.status'), render: (r) => <Badge tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge> },
          {
            key: 'actions', header: '',
            render: (r) => r.status === 'pending' ? (
              <div className="flex gap-1">
                <Button variant="secondary" onClick={() => void decide(r.id, true)}>Approve</Button>
                <Button variant="secondary" onClick={() => void decide(r.id, false)}>Reject</Button>
              </div>
            ) : null,
          },
        ]}
        rows={rows}
        empty={<EmptyState title={t('modules.accounting.noExpenses')} />}
      />
      <Dialog open={open} onOpenChange={setOpen} title={t('modules.accounting.expenseTitle')}>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t('modules.accounting.date')}</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div><Label>{t('modules.accounting.ledger')}</Label>
            <Input list="exp-ledger" value={form.ledger_name} onChange={(e) => setForm({ ...form, ledger_name: e.target.value })} />
            <datalist id="exp-ledger">{ledgers.map((l) => <option key={l.id} value={l.name} />)}</datalist>
          </div>
          <div><Label>{t('modules.accounting.narration')}</Label><Input value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} /></div>
          <div><Label>{t('modules.accounting.billNo')}</Label><Input value={form.bill_no} onChange={(e) => setForm({ ...form, bill_no: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.accounting.cancel')}</Button>
          <Button onClick={() => void save()}>{t('modules.accounting.submitApproval')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function PettyCashTab() {
  const [date, setDate] = React.useState(today());
  const [form, setForm] = React.useState({ opening: '', closing: '', physical_count: '', notes: '' });
  const [diff, setDiff] = React.useState<number | null>(null);
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    const r = await invoke('pettycash:get', { date });
    if (r) {
      setForm({ opening: String(r.opening), closing: String(r.closing), physical_count: r.physical_count != null ? String(r.physical_count) : '', notes: r.notes });
      setDiff(r.difference);
    } else { setForm({ opening: '', closing: '', physical_count: '', notes: '' }); setDiff(null); }
  }, [date]);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await invoke('pettycash:save', {
      date, opening: parseFloat(form.opening) || 0, closing: parseFloat(form.closing) || 0,
      physical_count: form.physical_count === '' ? null : parseFloat(form.physical_count), notes: form.notes,
    });
    setMsg(r.ok ? 'Saved.' : r.error);
    void load();
  };

  return (
    <Card className="max-w-xl p-6">
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="grid gap-3">
        <div><Label>{t('modules.accounting.date')}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('modules.accounting.opening')}</Label><Input type="number" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} /></div>
          <div><Label>{t('modules.accounting.closing')}</Label><Input type="number" value={form.closing} onChange={(e) => setForm({ ...form, closing: e.target.value })} /></div>
        </div>
        <div><Label>{t('modules.accounting.physical')}</Label><Input type="number" value={form.physical_count} onChange={(e) => setForm({ ...form, physical_count: e.target.value })} placeholder={t('modules.accounting.physicalPh')} /></div>
        {diff != null && diff !== 0 && <Alert tone="danger" title={`Difference: ₹${diff.toFixed(2)}`}>Physical cash doesn't match the books. Investigate before closing the day.</Alert>}
        {diff === 0 && <Alert tone="success" title="Cash tallies exactly">Physical count matches the books.</Alert>}
        <div><Label>{t('modules.accounting.notes')}</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={() => void save()}>{t('modules.accounting.savePetty')}</Button></div>
    </Card>
  );
}

export function AccountingScreen() {
  const [tab, setTab] = React.useState('vouchers');
  return (
    <div>
      <PageHeader title={t('nav.accounting')} />
      <Tabs
        tabs={[
          { value: 'vouchers', label: t('modules.accounting.vouchers'), content: <VouchersTab /> },
          { value: 'reports', label: t('modules.accounting.daybook'), content: <ReportsTab /> },
          { value: 'expenses', label: t('modules.accounting.expenses'), content: <ExpensesTab /> },
          { value: 'petty', label: t('modules.accounting.pettyCash'), content: <PettyCashTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
    </div>
  );
}
