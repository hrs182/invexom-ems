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
import { PageHeader, EmptyState, Alert, StatCard, TabFooter } from '../../components/ui/feedback';
import { downloadExcel } from '../../lib/exportExcel';
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

/** Month options: 12 past + 12 future, value "YYYY-MM", label "Month YYYY". */
function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (let i = -12; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value: v, label: `${names[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
const MONTHS = monthOptions();

function CollectTab() {
  const [q, setQ] = React.useState('');
  const [matches, setMatches] = React.useState<StudentRow[]>([]);
  const [student, setStudent] = React.useState<StudentRow | null>(null);
  const [tendered, setTendered] = React.useState('');
  const [mode, setMode] = React.useState('cash');
  const [refNo, setRefNo] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [receipt, setReceipt] = React.useState<ReceiptDetail | null>(null);
  const [error, setError] = React.useState('');
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [monthMode, setMonthMode] = React.useState<'single' | 'range'>('single');
  const [singleMonth, setSingleMonth] = React.useState(MONTHS[12].value);
  const [fromMonth, setFromMonth] = React.useState(MONTHS[12].value);
  const [toMonth, setToMonth] = React.useState(MONTHS[14].value);
  const [monthsLoaded, setMonthsLoaded] = React.useState<string[]>([]);
  const [loadingDues, setLoadingDues] = React.useState(false);
  const [amountsEdited, setAmountsEdited] = React.useState(false);
  /** Consolidated per-head rows: { head_id, head_name, amount (editable), discount, reason, approved_by, enabled, isExtra } */
  const [headRows, setHeadRows] = React.useState<{ head_id: number; head_name: string; amount: string; discount: string; reason: string; approved_by: string; enabled: boolean; isExtra: boolean }[]>([]);
  const [carryInfo, setCarryInfo] = React.useState('');

  React.useEffect(() => { invoke('settings:sessions:list', undefined).then(setSessions).catch(() => {}); }, []);

  const search = async () => {
    const r = await invoke('students:list', { q, limit: 10 });
    setMatches(r.rows);
  };

  const pick = async (s: StudentRow) => {
    setStudent(s); setMatches([]); setReceipt(null); setError('');
    setHeadRows([]); setMonthsLoaded([]); setTendered(''); setCarryInfo(''); setAmountsEdited(false);
  };

  /** Expand the selected month(s) into YYYY-MM labels. */
  const selectedMonths = (): string[] => {
    if (monthMode === 'single') return [singleMonth];
    const out: string[] = [];
    const [fy, fm] = fromMonth.split('-').map(Number);
    const [ty, tm] = toMonth.split('-').map(Number);
    let y = fy, m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
      if (out.length > 24) break;
    }
    return out;
  };

  /** All YYYY-MM labels from `from` to `to` inclusive. */
  const monthRange = (from: string, to: string): string[] => {
    const out: string[] = [];
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return out;
    let y = fy, m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
      if (out.length > 24) break;
    }
    return out;
  };

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  };

  const loadDues = async () => {
    if (!student) return;
    const active = sessions.find((s) => s.isActive);
    if (!active) { setError('No active session'); return; }
    const picked = selectedMonths();
    // Auto-expand: from the season's fee start month up to the latest picked month,
    // so every unpaid due since the season began shows up (database-checked).
    const feeStart = active.feeStartMonth || active.startDate.slice(0, 7);
    const maxPicked = [...picked].sort().pop()!;
    const labels = feeStart && feeStart < maxPicked ? monthRange(feeStart, maxPicked) : picked;
    setLoadingDues(true); setError(''); setCarryInfo('');
    try {
      for (const ml of labels) {
        await invoke('fees:dues:generate', { sessionId: active.id, monthLabel: ml });
      }
      // carryForward: include all unpaid dues up to the latest selected month
      const rows = await invoke('fees:dues:list', { studentId: student.id, monthLabels: labels, carryForward: true });
      const struct = await invoke('fees:structure:list', { sessionId: active.id });
      // Carry-forward info: dues from months before the picked selection
      const minPicked = [...picked].sort()[0];
      const carried = rows.filter((d) => d.month_label < minPicked);
      const bits: string[] = [];
      if (labels.length > picked.length) {
        bits.push(`Auto-loaded dues from ${monthLabel(feeStart)} (season start) to ${monthLabel(maxPicked)}`);
      }
      if (carried.length) {
        const cMonths = [...new Set(carried.map((d) => d.month_label))].sort();
        bits.push(`includes unpaid dues carried forward from ${cMonths.map(monthLabel).join(', ')} (₹${carried.reduce((a, d) => a + (d.amount + d.fine - d.discount - d.paid), 0).toFixed(2)})`);
      }
      setCarryInfo(bits.join(' · '));
      // Consolidate by head
      const byHead = new Map<number, { head_name: string; total: number; discount: number }>();
      for (const d of rows) {
        const e = byHead.get(d.head_id) ?? { head_name: d.head_name, total: 0, discount: 0 };
        e.total += d.amount + d.fine - d.paid;
        e.discount += d.discount;
        byHead.set(d.head_id, e);
      }
      // All structure heads for this class (show even if zero)
      const classHeads = struct.filter((r) => r.class_name === student.class_name);
      const seen = new Set<number>();
      const out: typeof headRows = [];
      for (const r of classHeads) {
        if (seen.has(r.head_id)) continue;
        seen.add(r.head_id);
        const agg = byHead.get(r.head_id);
        out.push({
          head_id: r.head_id, head_name: r.head_name,
          amount: String(Math.round(((agg?.total ?? 0)) * 100) / 100),
          discount: String(agg?.discount ?? 0), reason: '', approved_by: '',
          enabled: true, isExtra: false,
        });
      }
      // Any other heads with dues not in structure (e.g. ad-hoc)
      for (const [hid, agg] of byHead) {
        if (seen.has(hid)) continue;
        seen.add(hid);
        out.push({
          head_id: hid, head_name: agg.head_name,
          amount: String(Math.round(agg.total * 100) / 100),
          discount: String(agg.discount), reason: '', approved_by: '',
          enabled: true, isExtra: false,
        });
      }
      // Extra options: Miscellaneous + Admission fee (disabled by default)
      out.push({ head_id: 0, head_name: 'Miscellaneous', amount: '', discount: '0', reason: '', approved_by: '', enabled: false, isExtra: true });
      out.push({ head_id: 0, head_name: 'Admission Fee', amount: '', discount: '0', reason: '', approved_by: '', enabled: false, isExtra: true });
      setHeadRows(out);
      setMonthsLoaded(labels);
      setAmountsEdited(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDues(false);
    }
  };

  const setRow = (i: number, patch: Partial<(typeof headRows)[0]>) => {
    if (patch.amount !== undefined) setAmountsEdited(true);
    setHeadRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  /** Live payable per head row. */
  const rowPayable = (r: (typeof headRows)[0]): number => {
    if (!r.enabled) return 0;
    const amt = parseFloat(r.amount || '0') || 0;
    const disc = parseFloat(r.discount || '0') || 0;
    return Math.max(0, Math.round((amt - disc) * 100) / 100);
  };
  const totalPayable = headRows.reduce((a, r) => a + rowPayable(r), 0);
  const tenderedNum = parseFloat(tendered) || 0;
  const balance = Math.round((tenderedNum - totalPayable) * 100) / 100;

  const collect = async () => {
    setError('');
    if (!student) return;
    try {
      const active = sessions.find((s) => s.isActive);
      // Sync edited amounts back to dues first (only if user changed them)
      if (amountsEdited) {
        const syncHeads = headRows
          .filter((r) => r.enabled && (parseFloat(r.amount || '0') || 0) >= 0)
          .map((r) => ({ head_id: r.head_id, head_name: r.head_name, amount: parseFloat(r.amount || '0') || 0 }));
        const sync = await invoke('fees:dues:sync', {
          studentId: student.id, sessionId: active?.id ?? 0, monthLabels: monthsLoaded, heads: syncHeads,
        });
        if (!sync.ok) { setError(sync.error); return; }
      }
      // Discounts keyed by head — map to due_ids via a fresh dues fetch
      const freshDues = await invoke('fees:dues:list', { studentId: student.id, monthLabels: monthsLoaded, carryForward: true });
      const disc: { due_id: number; amount: number; reason: string; approved_by: string }[] = [];
      for (const r of headRows) {
        const dAmt = parseFloat(r.discount || '0') || 0;
        if (!r.enabled || dAmt <= 0) continue;
        // Apply discount to the latest due of this head
        const ds = freshDues.filter((d) => d.head_name === r.head_name).sort((a, b) => a.month_label.localeCompare(b.month_label));
        const target = ds[ds.length - 1];
        if (target) disc.push({ due_id: target.id, amount: dAmt, reason: r.reason, approved_by: r.approved_by });
      }
      const r = await invoke('fees:collect', {
        student_id: student.id, session_id: active?.id ?? null,
        tendered: parseFloat(tendered) || 0, mode: mode as 'cash' | 'upi' | 'cheque' | 'neft',
        ref_no: refNo, notes, discounts: disc,
      });
      if (!r.ok) { setError(r.error); return; }
      const detail = await invoke('fees:receipts:get', { id: r.receipt_id });
      setReceipt(detail);
      setHeadRows([]); setMonthsLoaded([]);
      setTendered('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
                {receipt.fee_months.length > 0 && (
                  <p className="mt-1 text-sm font-semibold text-brand">
                    Fee for: {receipt.fee_months.length === 1 ? monthLabel(receipt.fee_months[0])
                      : `${monthLabel(receipt.fee_months[0])} – ${monthLabel(receipt.fee_months[receipt.fee_months.length - 1])}`}
                  </p>
                )}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted">Student:</span> <strong>{receipt.student_name}</strong></div>
                <div><span className="text-muted">Adm. no.:</span> {receipt.admission_no}</div>
                <div><span className="text-muted">Class:</span> {receipt.class_name}</div>
                <div><span className="text-muted">Mode:</span> {receipt.mode.toUpperCase()}{receipt.ref_no ? ` (${receipt.ref_no})` : ''}</div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-y border-border text-left text-muted"><th className="py-2">Fee head</th><th className="py-2">Month</th><th className="py-2 text-right">{t('modules.fees.amount')}</th></tr></thead>
                <tbody>
                  {receipt.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border"><td className="py-2">{l.head_name}</td><td className="py-2 text-muted">{l.month_display ?? (l.month_label ? monthLabel(l.month_label) : '—')}</td><td className="py-2 text-right">₹{l.amount.toFixed(2)}</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td className="py-2 font-bold" colSpan={2}>{t('modules.fees.total')}</td><td className="py-2 text-right font-bold">₹{receipt.total.toFixed(2)}</td></tr>
                  <tr><td className="py-1 text-muted" colSpan={2}>{t('modules.fees.tenderedRow')}</td><td className="py-1 text-right text-muted">₹{receipt.tendered.toFixed(2)}</td></tr>
                  {receipt.change_given > 0 && <tr><td className="py-1 text-muted" colSpan={2}>{t('modules.fees.change')}</td><td className="py-1 text-right text-muted">₹{receipt.change_given.toFixed(2)}</td></tr>}
                  <tr className={receipt.remaining_due > 0.005 ? 'text-warning' : 'text-success'}>
                    <td className="py-1 font-semibold" colSpan={2}>Remaining due</td>
                    <td className="py-1 text-right font-semibold">₹{receipt.remaining_due.toFixed(2)}</td>
                  </tr>
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
          <>
          <Card className="p-4">
            <h3 className="mb-3 font-semibold">{t('modules.fees.dues')} — {t('modules.fees.totalPayable')} ₹{totalPayable.toFixed(2)}</h3>
            {/* Month picker: single month or a month range */}
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-3">
              <div className="flex gap-1 rounded-lg border border-border p-0.5">
                <Button variant={monthMode === 'single' ? 'primary' : 'ghost'} size="sm" onClick={() => setMonthMode('single')}>
                  {t('modules.fees.singleMonth')}
                </Button>
                <Button variant={monthMode === 'range' ? 'primary' : 'ghost'} size="sm" onClick={() => setMonthMode('range')}>
                  {t('modules.fees.monthRange')}
                </Button>
              </div>
              {monthMode === 'single' ? (
                <div className="min-w-44"><Label>{t('modules.fees.month')}</Label>
                  <Select value={singleMonth} onValueChange={setSingleMonth} options={MONTHS} />
                </div>
              ) : (
                <>
                  <div className="min-w-40"><Label>{t('modules.fees.fromMonth')}</Label>
                    <Select value={fromMonth} onValueChange={setFromMonth} options={MONTHS} />
                  </div>
                  <div className="min-w-40"><Label>{t('modules.fees.toMonth')}</Label>
                    <Select value={toMonth} onValueChange={setToMonth} options={MONTHS} />
                  </div>
                </>
              )}
              <Button onClick={() => void loadDues()} disabled={loadingDues}>
                {loadingDues ? t('common.loading') : t('modules.fees.loadDues')}
              </Button>
              {monthsLoaded.length > 0 && (
                <span className="text-xs text-muted">
                  {t('modules.fees.showingMonths', { defaultValue: 'Showing: {n}', n: monthsLoaded.map((m) => MONTHS.find((x) => x.value === m)?.label ?? m).join(', ') })}
                </span>
              )}
            </div>
            {headRows.length === 0 ? (
              <EmptyState title={t('modules.fees.noDues')} />
            ) : (
              <>
              {carryInfo && <p className="mb-2 text-xs text-warning">{carryInfo}</p>}
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-muted">
                  <th className="py-2">{t('modules.fees.head')}</th>
                  <th className="py-2 text-right">{t('modules.fees.amount')} ₹</th>
                  <th className="py-2 text-right">{t('modules.fees.discount')}</th>
                  <th className="py-2 text-right">{t('modules.fees.payable')}</th>
                </tr></thead>
                <tbody>
                  {headRows.map((r, i) => (
                    <React.Fragment key={`${r.head_name}-${i}`}>
                      <tr className={`border-b border-border ${!r.enabled ? 'opacity-50' : ''}`}>
                        <td className="py-2">
                          {r.isExtra && (
                            <input type="checkbox" className="mr-2" checked={r.enabled}
                              onChange={(e) => setRow(i, { enabled: e.target.checked })} />
                          )}
                          <span className="font-medium">{r.head_name}</span>
                          {r.isExtra && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">optional</span>}
                        </td>
                        <td className="py-2 text-right">
                          <Input type="number" className="ml-auto h-8 w-28 text-right" placeholder="0"
                            disabled={!r.enabled} value={r.amount}
                            onChange={(e) => setRow(i, { amount: e.target.value })} />
                        </td>
                        <td className="py-2 text-right">
                          <Input type="number" className="ml-auto h-8 w-24 text-right" placeholder="₹"
                            disabled={!r.enabled} value={r.discount}
                            onChange={(e) => setRow(i, { discount: e.target.value })} />
                        </td>
                        <td className="py-2 text-right font-semibold">₹{rowPayable(r).toFixed(2)}</td>
                      </tr>
                      {r.enabled && (
                        <tr className="border-b border-border bg-surface-2/50">
                          <td colSpan={4} className="px-2 py-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-muted">{t('modules.fees.discountRow')}</span>
                              <Input className="h-7 w-32" placeholder={t('modules.fees.reasonPh')} value={r.reason}
                                onChange={(e) => setRow(i, { reason: e.target.value })} />
                              <Input className="h-7 w-32" placeholder={t('modules.fees.approvedByPh')} value={r.approved_by}
                                onChange={(e) => setRow(i, { approved_by: e.target.value })} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="py-2 font-bold" colSpan={3}>{t('modules.fees.totalPayable')}</td>
                    <td className="py-2 text-right font-bold">₹{totalPayable.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
              <TabFooter>
                Amounts are the <strong>total across {monthsLoaded.length} month{monthsLoaded.length > 1 ? 's' : ''}</strong>
                {monthsLoaded.length > 0 && ` (${monthsLoaded.map(monthLabel).join(', ')})`}, covering every unpaid due from the season's fee start month.
                You can edit any amount before collecting — changes are saved to the dues.
                Tick <strong>Miscellaneous</strong> or <strong>Admission Fee</strong> to add them (off by default).
              </TabFooter>
              </>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div><Label>{t('modules.fees.tendered')}</Label><Input type="number" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={totalPayable.toFixed(2)} /></div>
              <div><Label>{t('modules.fees.mode')}</Label><Select value={mode} onValueChange={setMode} options={MODES} /></div>
              <div><Label>{t('modules.fees.refPh')}</Label><Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder={t('modules.fees.refEg')} /></div>
              <div><Label>{t('modules.fees.notes')}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('modules.fees.notesPh')} /></div>
            </div>
            {/* Live balance summary */}
            {tenderedNum > 0 && (
              <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted">{t('modules.fees.totalPayable')}</span><span>₹{totalPayable.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted">{t('modules.fees.tendered')}</span><span>₹{tenderedNum.toFixed(2)}</span></div>
                {balance < 0 ? (
                  <div className="flex justify-between font-semibold text-warning"><span>{t('modules.fees.remainingDue')}</span><span>₹{(-balance).toFixed(2)}</span></div>
                ) : balance > 0 ? (
                  <div className="flex justify-between font-semibold text-success"><span>{t('modules.fees.changeReturn')}</span><span>₹{balance.toFixed(2)}</span></div>
                ) : (
                  <div className="flex justify-between font-semibold text-success"><span>{t('modules.fees.exactAmount')}</span><span>✓</span></div>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={() => void collect()} disabled={headRows.filter((r) => r.enabled).length === 0}>{t('modules.fees.collectBtn', { n: (parseFloat(tendered) || 0).toFixed(2) })}</Button>
            </div>
          </Card>
          <TabFooter>
            <strong>How fee collection works:</strong> Pick the month(s) you want to collect for, then "Load dues".
            Each row shows a fee head from the fee structure — type a discount to reduce it (reason + approver are recorded).
            If the tendered amount is less than the total, the payment is marked <em>partial</em> and the balance stays due.
            To collect advance fee, simply load future months and collect — no separate step needed.
          </TabFooter>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptsTab() {
  const [rows, setRows] = React.useState<ReceiptRow[]>([]);
  const [q, setQ] = React.useState('');
  const [admissionNo, setAdmissionNo] = React.useState('');
  const [fClass, setFClass] = React.useState('');
  const [fSection, setFSection] = React.useState('');
  const [fMonth, setFMonth] = React.useState('');
  const [classes, setClasses] = React.useState<{ id: number; name: string }[]>([]);
  const [sections, setSections] = React.useState<MasterItem[]>([]);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelId, setCancelId] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [printId, setPrintId] = React.useState<number | null>(null);
  const [printDetail, setPrintDetail] = React.useState<ReceiptDetail | null>(null);

  React.useEffect(() => {
    invoke('masters:list', { kind: 'class' }).then(setClasses).catch(() => {});
    invoke('masters:list', { kind: 'section' }).then(setSections).catch(() => {});
  }, []);

  const secsFor = fClass ? sections.filter((s) => {
    try {
      const ex = typeof s.extra === 'string' ? JSON.parse(s.extra || '{}') : (s.extra ?? {});
      return (ex as { class?: string }).class === fClass;
    } catch { return false; }
  }) : [];

  const load = React.useCallback(async () => {
    let from: string | undefined; let to: string | undefined;
    if (fMonth) {
      const [y, m] = fMonth.split('-').map(Number);
      from = `${fMonth}-01`;
      const last = new Date(y, m, 0).getDate();
      to = `${fMonth}-${String(last).padStart(2, '0')}`;
    }
    const r = await invoke('fees:receipts:list', {
      q: q || undefined, admissionNo: admissionNo || undefined,
      className: fClass || undefined, section: fSection || undefined,
      from, to, limit: 100,
    });
    setRows(r.rows);
  }, [q, admissionNo, fClass, fSection, fMonth]);
  React.useEffect(() => { void load(); }, [load]);

  const doPrint = async (id: number) => {
    const d = await invoke('fees:receipts:get', { id });
    setPrintDetail(d); setPrintId(id);
  };

  const exportReceiptsExcel = () => {
    downloadExcel(`fee-receipts-${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Receipts',
      rows: rows.map((r) => ({
        'Receipt No': r.receipt_no, 'Date': r.date,
        'Student': r.student_name, 'Adm No': r.admission_no,
        'Class': `${r.class_name}${r.section ? `-${r.section}` : ''}`,
        'Amount': r.total, 'Mode': r.mode, 'Status': r.status,
      })),
    }]);
  };

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
    { key: 'admission_no', header: t('modules.fees.admNo') },
    { key: 'class_name', header: t('modules.fees.class'), render: (r) => `${r.class_name}${r.section ? `-${r.section}` : ''}` },
    { key: 'total', header: t('modules.fees.total'), render: (r) => `₹${r.total.toFixed(2)}` },
    { key: 'mode', header: t('modules.fees.mode'), render: (r) => r.mode.toUpperCase() },
    {
      key: 'status', header: t('modules.fees.status'),
      render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'danger'}>{r.status}</Badge>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => void doPrint(r.id)} title={t('modules.fees.print')} aria-label={t('modules.fees.print')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </Button>
          {r.status === 'active' && (
            <Button variant="secondary" size="sm" onClick={() => { setCancelId(r.id); setCancelOpen(true); }}>Cancel</Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      {error && <Alert tone="danger" title="Error" className="mb-4">{error}</Alert>}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-44"><Label>{t('modules.fees.searchReceiptsPh')}</Label>
          <Input placeholder={t('modules.fees.searchReceiptsPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div><Label>{t('modules.fees.admNo')}</Label>
          <Input placeholder="INV/2026/…" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} className="w-36" />
        </div>
        <div><Label>{t('modules.fees.class')}</Label>
          <Select value={fClass} onValueChange={(v) => { setFClass(v); setFSection(''); }}
            options={[{ value: '', label: t('common.all') }, ...classes.map((c) => ({ value: c.name, label: c.name }))]}
            placeholder={t('common.all')} />
        </div>
        <div><Label>{t('modules.fees.section')}</Label>
          <Select value={fSection} onValueChange={setFSection}
            options={[{ value: '', label: t('common.all') }, ...secsFor.map((s) => ({ value: s.name, label: s.name }))]}
            placeholder={t('common.all')} disabled={!fClass} />
        </div>
        <div><Label>{t('modules.fees.month')}</Label>
          <Input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)} className="w-44" />
        </div>
        {(q || admissionNo || fClass || fSection || fMonth) && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(''); setAdmissionNo(''); setFClass(''); setFSection(''); setFMonth(''); }}>
            {t('common.clear')}
          </Button>
        )}
        <div className="ml-auto">
          <Button variant="secondary" className="no-print" onClick={exportReceiptsExcel} disabled={rows.length === 0}>{t('common.excel')}</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title={t('modules.fees.noReceipts')} />} />
      <TabFooter>
        <strong>Receipts:</strong> Filter by admission number, class, section or month to find a receipt quickly.
        Use the print button on any row to print that receipt in the official format.
        Cancelling a receipt needs the admin password and restores the dues — cancelled receipts are kept for audit and shown struck-through.
      </TabFooter>
      {/* Print preview: plain overlay (not a portal dialog) so the print CSS shows only the receipt. */}
      {printDetail && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setPrintId(null); setPrintDetail(null); }}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('modules.fees.print')} — {printDetail.receipt_no}</h3>
              <button className="cursor-pointer rounded-lg p-1.5 text-muted hover:bg-surface-2" onClick={() => { setPrintId(null); setPrintDetail(null); }} aria-label={t('common.close')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="rounded-lg border border-border bg-white p-4 text-black">
              <p className="text-sm"><strong>{printDetail.student_name}</strong> · {printDetail.admission_no} · {printDetail.class_name}{printDetail.section ? `-${printDetail.section}` : ''}</p>
              <p className="text-sm text-muted">{printDetail.date} · {printDetail.mode.toUpperCase()} · ₹{printDetail.total.toFixed(2)}</p>
              <p className="mt-2 text-xs text-muted">Full formatted receipt will print on paper.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setPrintId(null); setPrintDetail(null); }}>{t('common.close')}</Button>
              <Button onClick={() => window.print()}>{t('modules.fees.printPdf')}</Button>
            </div>
          </div>
        </div>
      )}
      {printDetail && <FeeReceiptPrint receipt={printDetail} />}
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

  const exportDefaultersExcel = () => {
    downloadExcel(`defaulters-${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Defaulters',
      rows: rows.map((r) => ({
        'Student': r.student_name, 'Adm No': r.admission_no,
        'Class': r.class_name, "Father's Phone": r.father_phone,
        'Due 0-30d': r.bucket_0_30, 'Due 31-60d': r.bucket_31_60,
        'Due 61-90d': r.bucket_61_90, 'Due 90d+': r.bucket_90p,
        'Total Due': r.total_due,
      })),
    }]);
  };

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
        <div className="ml-auto flex items-end gap-2">
          <Button variant="secondary" className="no-print" onClick={exportDefaultersExcel} disabled={rows.length === 0}>{t('common.excel')}</Button>
          <StatCard label={t('modules.fees.totalOutstanding')} value={`₹${total.toFixed(2)}`} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title={t('modules.fees.noDefaulters')} />} />
    </div>
  );
}

function StructureTab() {
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = React.useState('');
  const [allRows, setAllRows] = React.useState<FeeStructureRow[]>([]);
  const [heads, setHeads] = React.useState<MasterItem[]>([]);
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [sections, setSections] = React.useState<MasterItem[]>([]);
  const [selClass, setSelClass] = React.useState('');
  const [selSection, setSelSection] = React.useState(''); // '' = all sections
  const [mode, setMode] = React.useState<'all' | 'permonth'>('all');
  const [selMonth, setSelMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [genMonth, setGenMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [msg, setMsg] = React.useState('');
  // Draft amounts: head_id -> { amount, fine_flat, fine_percent, due_day }
  const [draft, setDraft] = React.useState<Record<number, { amount: string; fine_flat: string; fine_percent: string; due_day: string }>>({});

  React.useEffect(() => {
    Promise.all([
      invoke('settings:sessions:list', undefined),
      invoke('masters:list', { kind: 'fee-head' }),
      invoke('masters:list', { kind: 'class' }),
      invoke('masters:list', { kind: 'section' }),
    ]).then(([s, h, c, sec]) => {
      setSessions(s); setHeads(h); setClasses(c); setSections(sec);
      const active = s.find((x) => x.isActive);
      if (active) setSessionId(String(active.id));
      if (c.length) setSelClass(c[0].name);
    }).catch(() => {});
  }, []);

  const load = React.useCallback(async () => {
    if (!sessionId) return;
    setAllRows(await invoke('fees:structure:list', { sessionId: Number(sessionId) }));
  }, [sessionId]);
  React.useEffect(() => { void load(); }, [load]);

  const secsFor = selClass ? sections.filter((s) => {
    try {
      const ex = typeof s.extra === 'string' ? JSON.parse(s.extra) : (s.extra ?? {});
      return (ex as { class?: string }).class === selClass;
    } catch { return false; }
  }) : [];

  // Load draft from saved rows whenever class/section/mode/month changes
  React.useEffect(() => {
    const d: Record<number, { amount: string; fine_flat: string; fine_percent: string; due_day: string }> = {};
    for (const h of heads) {
      const mon = mode === 'all' ? '' : selMonth;
      const hit = allRows.find((r) => r.class_name === selClass && r.section === selSection && r.head_id === h.id && r.month_label === mon);
      d[h.id] = {
        amount: String(hit?.amount ?? 0),
        fine_flat: String(hit?.fine_flat ?? 0),
        fine_percent: String(hit?.fine_percent ?? 0),
        due_day: String(hit?.due_day ?? 10),
      };
    }
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selClass, selSection, mode, selMonth, allRows, heads]);

  const setD = (headId: number, k: string, v: string) =>
    setDraft((d) => ({ ...d, [headId]: { ...d[headId], [k]: v } }));

  const save = async () => {
    setMsg('');
    const mon = mode === 'all' ? '' : selMonth;
    const rows = heads.map((h) => ({
      class_name: selClass, section: selSection, head_id: h.id, month_label: mon,
      amount: parseFloat(draft[h.id]?.amount || '0') || 0,
      fine_flat: parseFloat(draft[h.id]?.fine_flat || '0') || 0,
      fine_percent: parseFloat(draft[h.id]?.fine_percent || '0') || 0,
      due_day: parseInt(draft[h.id]?.due_day || '10') || 10,
    }));
    const r = await invoke('fees:structure:save', { sessionId: Number(sessionId), rows });
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
    const r = await invoke('fees:dues:generate', { sessionId: Number(sessionId), monthLabel: genMonth });
    setMsg(r.ok ? `Generated ${r.count} dues for ${genMonth}.` : r.error);
  };

  return (
    <div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><Label>{t('modules.fees.session')}</Label>
          <Select value={sessionId} onValueChange={setSessionId} placeholder="Session"
            options={sessions.map((s) => ({ value: String(s.id), label: s.name }))} className="w-40" />
        </div>
        <div><Label>{t('modules.fees.class')}</Label>
          <Select value={selClass} onValueChange={(v) => { setSelClass(v); setSelSection(''); }} placeholder="Class"
            options={classes.map((c) => ({ value: c.name, label: c.name }))} className="w-32" />
        </div>
        <div><Label>{t('modules.fees.section')}</Label>
          <Select value={selSection} onValueChange={setSelSection} placeholder="All sections"
            options={[{ value: '', label: 'All sections' }, ...secsFor.map((s) => ({ value: s.name, label: s.name }))]} className="w-36" />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <Button variant={mode === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('all')}>Set to all months</Button>
          <Button variant={mode === 'permonth' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('permonth')}>Per month</Button>
        </div>
        {mode === 'permonth' && (
          <div><Label>{t('modules.fees.month')}</Label>
            <Input type="month" value={selMonth} onChange={(e) => setSelMonth(e.target.value)} className="w-40" />
          </div>
        )}
        <Button onClick={() => void save()}>{t('modules.fees.saveStructure')}</Button>
        <Button variant="secondary" onClick={() => void copyPrev()}>{t('modules.fees.copyPrev')}</Button>
        <div className="ml-auto flex items-end gap-2">
          <div><Label>Generate dues for</Label><Input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="w-40" /></div>
          <Button variant="secondary" onClick={() => void generate()}>{t('modules.fees.generateDues')}</Button>
        </div>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2">{t('modules.fees.feeHead')}</th>
            <th className="px-3 py-2 text-right">{t('modules.fees.amount')} ₹</th>
            <th className="px-3 py-2 text-right">{t('modules.fees.fineFlat')}</th>
            <th className="px-3 py-2 text-right">{t('modules.fees.finePct')}</th>
            <th className="px-3 py-2 text-right">{t('modules.fees.dueDay')}</th>
          </tr></thead>
          <tbody>
            {heads.map((h) => (
              <tr key={h.id} className="border-b border-border">
                <td className="px-3 py-1 font-medium">{h.name}</td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={draft[h.id]?.amount ?? '0'} onChange={(e) => setD(h.id, 'amount', e.target.value)} placeholder="0" /></td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={draft[h.id]?.fine_flat ?? '0'} onChange={(e) => setD(h.id, 'fine_flat', e.target.value)} placeholder="0" /></td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={draft[h.id]?.fine_percent ?? '0'} onChange={(e) => setD(h.id, 'fine_percent', e.target.value)} placeholder="0" /></td>
                <td className="px-3 py-1"><Input type="number" className="text-right" value={draft[h.id]?.due_day ?? '10'} onChange={(e) => setD(h.id, 'due_day', e.target.value)} placeholder="10" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <TabFooter>
        <strong>Fee structure:</strong> Pick a class{selSection ? ' and section' : ''} then set each fee head's amount.
        "Set to all months" applies the same amount every month; "Per month" lets you set a different amount for a specific month
        (e.g. higher transport in winter). Section-specific amounts override the class default for that section.
      </TabFooter>
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
