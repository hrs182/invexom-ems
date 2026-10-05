import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { FeeReceiptPrint } from '../../components/print/documents';
import { Dialog } from '../../components/ui/dialog';
import { DataTable, type Column } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert, StatCard } from '../../components/ui/feedback';
import { Tabs } from '../../components/ui/primitives';
import type { DueRow, ReceiptRow, ReceiptDetail, DefaulterRow, StudentRow, SessionRow, MasterItem, FeeStructureRow } from '@shared/types';

/** Amount in words (English) for receipts — FR-FEE-06. */
export function amountInWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number): string => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
  const three = (x: number): string => (x > 99 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
  if (n === 0) return 'Zero';
  let out = '';
  const cr = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) out += three(cr) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (th) out += two(th) + ' Thousand ';
  if (n) out += three(Math.floor(n));
  return (out.trim() + ' Rupees Only').replace(/\s+/g, ' ');
}

const waLink = (phone: string, text: string) =>
  `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;

const MODES = [
  { value: 'cash', label: t('modules.fees.cash') },
  { value: 'upi', label: t('modules.fees.upi') },
  { value: 'cheque', label: t('modules.fees.cheque') },
  { value: 'neft', label: t('modules.fees.neft') },
];

function CollectTab() {
  const [q, setQ] = React.useState('');
  const [matches, setMatches] = React.useState<StudentRow[]>([]);
  const [student, setStudent] = React.useState<StudentRow | null>(null);
  const [dues, setDues] = React.useState<DueRow[]>([]);
  const [tendered, setTendered] = React.useState('');
  const [mode, setMode] = React.useState('cash');
  const [refNo, setRefNo] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [discounts, setDiscounts] = React.useState<Record<number, { amount: string; reason: string; approved_by: string }>>({});
  const [receipt, setReceipt] = React.useState<ReceiptDetail | null>(null);
  const [error, setError] = React.useState('');
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);

  React.useEffect(() => { invoke('settings:sessions:list', undefined).then(setSessions).catch(() => {}); }, []);

  const search = async () => {
    const r = await invoke('students:list', { q, limit: 10 });
    setMatches(r.rows);
  };

  const pick = async (s: StudentRow) => {
    setStudent(s); setMatches([]); setReceipt(null); setError('');
    setDues(await invoke('fees:dues:list', { studentId: s.id }));
  };

  const totalPayable = dues.reduce((a, d) => a + d.payable, 0);

  const collect = async () => {
    setError('');
    if (!student) return;
    const active = sessions.find((s) => s.isActive);
    const disc = Object.entries(discounts)
      .filter(([, v]) => parseFloat(v.amount) > 0)
      .map(([due_id, v]) => ({ due_id: Number(due_id), amount: parseFloat(v.amount), reason: v.reason, approved_by: v.approved_by }));
    const r = await invoke('fees:collect', {
      student_id: student.id, session_id: active?.id ?? null,
      tendered: parseFloat(tendered) || 0, mode: mode as 'cash' | 'upi' | 'cheque' | 'neft',
      ref_no: refNo, notes, discounts: disc,
    });
    if (!r.ok) { setError(r.error); return; }
    const detail = await invoke('fees:receipts:get', { id: r.receipt_id });
    setReceipt(detail);
    setDues(await invoke('fees:dues:list', { studentId: student.id }));
    setTendered(''); setDiscounts({});
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit p-4">
        <Label>{t('modules.fees.findStudent')}</Label>
        <div className="flex gap-2">
          <Input placeholder={t('modules.fees.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} />
          <Button onClick={() => void search()}>{t('modules.fees.search')}</Button>
        </div>
        {matches.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {matches.map((m) => (
              <li key={m.id}>
                <button className="w-full cursor-pointer px-3 py-2 text-left hover:bg-surface-2" onClick={() => void pick(m)}>
                  <div className="text-sm font-medium">{m.name}</div>
                  <div className="text-xs text-muted">{m.admission_no} · {m.class_name}-{m.section}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {student && (
          <div className="mt-4 rounded-xl bg-surface-2 p-3">
            <div className="font-semibold">{student.name}</div>
            <div className="text-sm text-muted">{student.admission_no} · Class {student.class_name}-{student.section}</div>
            <div className="text-sm text-muted">{student.father_name} · {student.father_phone}</div>
          </div>
        )}
      </Card>

      <div>
        {error && <Alert tone="danger" title="Error" className="mb-4">{error}</Alert>}
        {!student ? (
          <EmptyState title={t('modules.fees.selectStudent')} />
        ) : receipt ? (
          <>
          <Card className="p-6">
            <div className="print-area">
              <div className="mb-4 text-center">
                <h2 className="text-xl font-bold">{t('modules.fees.receiptTitle')}</h2>
                <p className="text-sm text-muted">{receipt.receipt_no} · {receipt.date}</p>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted">Student:</span> <strong>{receipt.student_name}</strong></div>
                <div><span className="text-muted">Adm. no.:</span> {receipt.admission_no}</div>
                <div><span className="text-muted">Class:</span> {receipt.class_name}</div>
                <div><span className="text-muted">Mode:</span> {receipt.mode.toUpperCase()}{receipt.ref_no ? ` (${receipt.ref_no})` : ''}</div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-y border-border text-left text-muted"><th className="py-2">Fee head</th><th className="py-2 text-right">{t('modules.fees.amount')}</th></tr></thead>
                <tbody>
                  {receipt.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border"><td className="py-2">{l.head_name}</td><td className="py-2 text-right">₹{l.amount.toFixed(2)}</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td className="py-2 font-bold">{t('modules.fees.total')}</td><td className="py-2 text-right font-bold">₹{receipt.total.toFixed(2)}</td></tr>
                  <tr><td className="py-1 text-muted">{t('modules.fees.tenderedRow')}</td><td className="py-1 text-right text-muted">₹{receipt.tendered.toFixed(2)}</td></tr>
                  {receipt.change_given > 0 && <tr><td className="py-1 text-muted">{t('modules.fees.change')}</td><td className="py-1 text-right text-muted">₹{receipt.change_given.toFixed(2)}</td></tr>}
                </tfoot>
              </table>
              <p className="mt-3 text-sm italic text-muted">{amountInWords(receipt.total)}</p>
              {receipt.notes && <p className="mt-1 text-sm text-muted">Note: {receipt.notes}</p>}
            </div>
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <Button onClick={() => window.print()}>{t('modules.fees.printPdf')}</Button>
              <Button variant="secondary" onClick={() => setReceipt(null)}>{t('modules.fees.collectAnother')}</Button>
              <a className="ml-auto" target="_blank" rel="noreferrer"
                href={waLink(student.father_phone || student.mother_phone || student.guardian_phone,
                  `Fee receipt ${receipt.receipt_no}: ₹${receipt.total.toFixed(2)} received for ${student.name}. Thank you!`)}>
                <Button variant="secondary">{t('modules.fees.waReceipt')}</Button>
              </a>
            </div>
          </Card>
          <FeeReceiptPrint receipt={receipt} />
          </>
        ) : (
          <Card className="p-4">
            <h3 className="mb-3 font-semibold">{t('modules.fees.dues')} — {t('modules.fees.totalPayable')} ₹{totalPayable.toFixed(2)}</h3>
            {dues.length === 0 ? (
              <EmptyState title={t('modules.fees.noDues')} />
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-muted">
                  <th className="py-2">{t('modules.fees.head')}</th><th className="py-2 text-right">{t('modules.fees.due')}</th><th className="py-2 text-right">{t('modules.fees.fine')}</th>
                  <th className="py-2 text-right">{t('modules.fees.discount')}</th><th className="py-2 text-right">{t('modules.fees.payable')}</th>
                </tr></thead>
                <tbody>
                  {dues.map((d) => (
                    <React.Fragment key={d.id}>
                      <tr className="border-b border-border">
                        <td className="py-2">{d.head_name}<div className="text-xs text-muted">due {d.due_date}</div></td>
                        <td className="py-2 text-right">₹{d.amount.toFixed(2)}</td>
                        <td className="py-2 text-right">₹{d.fine.toFixed(2)}</td>
                        <td className="py-2 text-right">₹{d.discount.toFixed(2)}</td>
                        <td className="py-2 text-right font-semibold">₹{d.payable.toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-border bg-surface-2/50">
                        <td colSpan={5} className="px-2 py-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted">{t('modules.fees.discountRow')}</span>
                            <Input className="h-7 w-24" placeholder="₹" value={discounts[d.id]?.amount ?? ''}
                              onChange={(e) => setDiscounts({ ...discounts, [d.id]: { amount: e.target.value, reason: discounts[d.id]?.reason ?? '', approved_by: discounts[d.id]?.approved_by ?? '' } })} />
                            <Input className="h-7 w-32" placeholder={t('modules.fees.reasonPh')} value={discounts[d.id]?.reason ?? ''}
                              onChange={(e) => setDiscounts({ ...discounts, [d.id]: { amount: discounts[d.id]?.amount ?? '', reason: e.target.value, approved_by: discounts[d.id]?.approved_by ?? '' } })} />
                            <Input className="h-7 w-32" placeholder={t('modules.fees.approvedByPh')} value={discounts[d.id]?.approved_by ?? ''}
                              onChange={(e) => setDiscounts({ ...discounts, [d.id]: { amount: discounts[d.id]?.amount ?? '', reason: discounts[d.id]?.reason ?? '', approved_by: e.target.value } })} />
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div><Label>{t('modules.fees.tendered')}</Label><Input type="number" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={totalPayable.toFixed(2)} /></div>
              <div><Label>{t('modules.fees.mode')}</Label><Select value={mode} onValueChange={setMode} options={MODES} /></div>
              <div><Label>{t('modules.fees.refPh')}</Label><Input value={refNo} onChange={(e) => setRefNo(e.target.value)} /></div>
              <div><Label>{t('modules.fees.notes')}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => void collect()} disabled={dues.length === 0}>{t('modules.fees.collectBtn', { n: (parseFloat(tendered) || 0).toFixed(2) })}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReceiptsTab() {
  const [rows, setRows] = React.useState<ReceiptRow[]>([]);
  const [q, setQ] = React.useState('');
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelId, setCancelId] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    const r = await invoke('fees:receipts:list', { q: q || undefined, limit: 100 });
    setRows(r.rows);
  }, [q]);
  React.useEffect(() => { void load(); }, [load]);

  const doCancel = async () => {
    setError('');
    if (cancelId == null) return;
    const r = await invoke('fees:receipts:cancel', { id: cancelId, reason, adminPassword });
    if (!r.ok) { setError(r.error); return; }
    setCancelOpen(false); setCancelId(null); setReason(''); setAdminPassword('');
    void load();
  };

  const columns: Column<ReceiptRow>[] = [
    {
      key: 'receipt_no', header: t('modules.fees.receiptNo'),
      render: (r) => <span className={r.status === 'cancelled' ? 'line-through' : 'font-medium'}>{r.receipt_no}</span>,
    },
    { key: 'date', header: t('modules.fees.date') },
    { key: 'student_name', header: t('modules.fees.student') },
    { key: 'total', header: t('modules.fees.total'), render: (r) => `₹${r.total.toFixed(2)}` },
    { key: 'mode', header: t('modules.fees.mode'), render: (r) => r.mode.toUpperCase() },
    {
      key: 'status', header: t('modules.fees.status'),
      render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'danger'}>{r.status}</Badge>,
    },
    {
      key: 'actions', header: '',
      render: (r) => r.status === 'active' ? (
        <Button variant="secondary" onClick={() => { setCancelId(r.id); setCancelOpen(true); }}>Cancel</Button>
      ) : null,
    },
  ];

  return (
    <div>
      {error && <Alert tone="danger" title="Error" className="mb-4">{error}</Alert>}
      <div className="mb-3 flex gap-2">
        <Input placeholder={t('modules.fees.searchReceiptsPh')} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title={t('modules.fees.noReceipts')} />} />
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen} title={t('modules.fees.cancelTitle')}>
        <p className="mb-4 text-sm text-muted">{t('modules.fees.cancelMsg')}</p>
        <div className="grid gap-3">
          <div><Label>{t('modules.fees.cancelReason')}</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div><Label>{t('modules.fees.adminPw')}</Label><Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>{t('modules.fees.back')}</Button>
          <Button variant="danger" onClick={() => void doCancel()}>{t('modules.fees.cancelTitle')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function DefaultersTab() {
  const [rows, setRows] = React.useState<DefaulterRow[]>([]);
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = React.useState('');
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [className, setClassName] = React.useState('');

  React.useEffect(() => {
    invoke('settings:sessions:list', undefined).then((s) => {
      setSessions(s);
      const active = s.find((x) => x.isActive);
      if (active) setSessionId(String(active.id));
    }).catch(() => {});
    invoke('masters:list', { kind: 'class' }).then(setClasses).catch(() => {});
  }, []);

  const load = React.useCallback(async () => {
    setRows(await invoke('fees:defaulters', { sessionId: sessionId ? Number(sessionId) : null, className: className || undefined }));
  }, [sessionId, className]);
  React.useEffect(() => { void load(); }, [load]);

  const total = rows.reduce((a, r) => a + r.total_due, 0);

  const columns: Column<DefaulterRow>[] = [
    {
      key: 'student_name', header: t('modules.fees.student'),
      render: (r) => <div><div className="font-medium">{r.student_name}</div><div className="text-xs text-muted">{r.admission_no}</div></div>,
    },
    { key: 'class_name', header: t('modules.fees.class') },
    { key: 'father_phone', header: t('modules.students.fatherPhone') },
    { key: 'bucket_0_30', header: '0–30d', render: (r) => `₹${r.bucket_0_30.toFixed(0)}` },
    { key: 'bucket_31_60', header: '31–60d', render: (r) => `₹${r.bucket_31_60.toFixed(0)}` },
    { key: 'bucket_61_90', header: '61–90d', render: (r) => `₹${r.bucket_61_90.toFixed(0)}` },
    { key: 'bucket_90p', header: '90d+', render: (r) => `₹${r.bucket_90p.toFixed(0)}` },
    { key: 'total_due', header: t('modules.fees.totalOutstanding'), render: (r) => <strong>₹{r.total_due.toFixed(2)}</strong> },
    {
      key: 'remind', header: '',
      render: (r) => (
        <a target="_blank" rel="noreferrer" href={waLink(r.father_phone,
          `Dear parent, school fees of ₹${r.total_due.toFixed(2)} are pending for ${r.student_name} (${r.admission_no}). Kindly pay at the earliest.`)}>
          <Button variant="secondary">{t('modules.fees.remind')}</Button>
        </a>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div><Label>{t('modules.fees.session')}</Label>
          <Select value={sessionId} onValueChange={setSessionId} placeholder="Session"
            options={sessions.map((s) => ({ value: String(s.id), label: s.name }))} className="w-40" />
        </div>
        <div><Label>{t('modules.fees.class')}</Label>
          <Select value={className} onValueChange={setClassName} placeholder={t('modules.students.allClasses')}
            options={[{ value: '', label: 'All classes' }, ...classes.map((c) => ({ value: c.name, label: c.name }))]} className="w-40" />
        </div>
        <div className="ml-auto"><StatCard label={t('modules.fees.totalOutstanding')} value={`₹${total.toFixed(2)}`} /></div>
      </div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title={t('modules.fees.noDefaulters')} />} />
    </div>
  );
}

function StructureTab() {
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = React.useState('');
  const [rows, setRows] = React.useState<FeeStructureRow[]>([]);
  const [heads, setHeads] = React.useState<MasterItem[]>([]);
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    Promise.all([
      invoke('settings:sessions:list', undefined),
      invoke('masters:list', { kind: 'fee-head' }),
      invoke('masters:list', { kind: 'class' }),
    ]).then(([s, h, c]) => {
      setSessions(s); setHeads(h); setClasses(c);
      const active = s.find((x) => x.isActive);
      if (active) setSessionId(String(active.id));
    }).catch(() => {});
  }, []);

  const load = React.useCallback(async () => {
    if (!sessionId) return;
    setRows(await invoke('fees:structure:list', { sessionId: Number(sessionId) }));
  }, [sessionId]);
  React.useEffect(() => { void load(); }, [load]);

  const update = (id: number, patch: Partial<FeeStructureRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => {
    if (!classes.length || !heads.length) return;
    setRows([...rows, {
      id: -Date.now(), session_id: Number(sessionId), class_name: classes[0].name,
      head_id: heads[0].id, head_name: heads[0].name, amount: 0, fine_flat: 0, fine_percent: 0, due_day: 10,
    }]);
  };

  const save = async () => {
    setMsg('');
    const r = await invoke('fees:structure:save', {
      sessionId: Number(sessionId),
      rows: rows.map(({ class_name, head_id, amount, fine_flat, fine_percent, due_day }) => ({ class_name, head_id, amount, fine_flat, fine_percent, due_day })),
    });
    setMsg(r.ok ? 'Saved.' : r.error);
    void load();
  };

  const copyPrev = async () => {
    const idx = sessions.findIndex((s) => String(s.id) === sessionId);
    const prev = sessions[idx + 1];
    if (!prev) { setMsg('No previous session found.'); return; }
    const r = await invoke('fees:structure:copy', { fromSessionId: prev.id, toSessionId: Number(sessionId) });
    setMsg(r.ok ? `Copied ${r.count} rows from ${prev.name}.` : r.error);
    void load();
  };

  const generate = async () => {
    const r = await invoke('fees:dues:generate', { sessionId: Number(sessionId), monthLabel: month });
    setMsg(r.ok ? `Generated ${r.count} dues for ${month}.` : r.error);
  };

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><Label>{t('modules.fees.session')}</Label>
          <Select value={sessionId} onValueChange={setSessionId} placeholder="Session"
            options={sessions.map((s) => ({ value: String(s.id), label: s.name }))} className="w-40" />
        </div>
        <Button variant="secondary" onClick={() => void copyPrev()}>{t('modules.fees.copyPrev')}</Button>
        <div className="ml-auto flex items-end gap-2">
          <div><Label>{t('modules.fees.month')}</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" /></div>
          <Button variant="secondary" onClick={() => void generate()}>{t('modules.fees.generateDues')}</Button>
          <Button variant="secondary" onClick={addRow}>{t('modules.fees.addRow')}</Button>
          <Button onClick={() => void save()}>{t('modules.fees.saveStructure')}</Button>
        </div>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2">{t('modules.fees.class')}</th><th className="px-3 py-2">{t('modules.fees.feeHead')}</th>
            <th className="px-3 py-2 text-right">{t('modules.fees.amount')} ₹</th><th className="px-3 py-2 text-right">{t('modules.fees.fineFlat')}</th>
            <th className="px-3 py-2 text-right">{t('modules.fees.finePct')}</th><th className="px-3 py-2 text-right">{t('modules.fees.dueDay')}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="px-3 py-1">
                  <Select value={r.class_name} onValueChange={(v) => update(r.id, { class_name: v })}
                    options={classes.map((c) => ({ value: c.name, label: c.name }))} />
                </td>
                <td className="px-3 py-1">
                  <Select value={String(r.head_id)} onValueChange={(v) => {
                    const h = heads.find((x) => String(x.id) === v);
                    update(r.id, { head_id: Number(v), head_name: h?.name ?? '' });
                  }} options={heads.map((h) => ({ value: String(h.id), label: h.name }))} />
                </td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={r.amount} onChange={(e) => update(r.id, { amount: parseFloat(e.target.value) || 0 })} /></td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={r.fine_flat} onChange={(e) => update(r.id, { fine_flat: parseFloat(e.target.value) || 0 })} /></td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={r.fine_percent} onChange={(e) => update(r.id, { fine_percent: parseFloat(e.target.value) || 0 })} /></td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={r.due_day} onChange={(e) => update(r.id, { due_day: parseInt(e.target.value) || 10 })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function FeesScreen() {
  const [tab, setTab] = React.useState('collect');
  return (
    <div>
      <PageHeader title={t('nav.fees')} />
      <Tabs
        tabs={[
          { value: 'collect', label: t('modules.fees.collect'), content: <CollectTab /> },
          { value: 'receipts', label: t('modules.fees.receipts'), content: <ReceiptsTab /> },
          { value: 'defaulters', label: t('modules.fees.defaulters'), content: <DefaultersTab /> },
          { value: 'structure', label: t('modules.fees.structure'), content: <StructureTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
    </div>
  );
}
