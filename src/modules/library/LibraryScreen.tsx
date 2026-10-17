import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { PageHeader, EmptyState, StatCard } from '../../components/ui/feedback';
import { Button } from '../../components/ui/button';
import { Input, Field, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Tabs } from '../../components/ui/primitives';
import { DataTable, type Column } from '../../components/ui/data-table';
import { Dialog } from '../../components/ui/dialog';
import { downloadExcel } from '../../lib/exportExcel';
import { Badge } from '../../components/ui/badge';

const T = (k: string, v?: Record<string, string | number>) => t(`modules.library.${k}` as never, v);

function CatalogTab() {
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({});
  const [issueFor, setIssueFor] = React.useState<any>(null);
  const [issueForm, setIssueForm] = React.useState({ memberType: 'student', memberId: '', dueDays: 14 });
  const load = async () => setRows(await invoke('library:books', { q }));
  React.useEffect(() => { void load(); }, []);

  const exportExcel = () => {
    downloadExcel(`library-catalog-${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Books',
      rows: rows.map((r) => ({
        'Title': r.title, 'Author': r.author ?? '',
        'ISBN': r.isbn ?? '', 'Category': r.category ?? '',
        'Rack': r.rack_no ?? '', 'Available': r.available_copies,
        'Total Copies': r.total_copies,
      })),
    }]);
  };
  const cols: Column<any>[] = React.useMemo(() => [
    { key: 'title', header: T('title'), render: (r) => <strong>{r.title}</strong> },
    { key: 'author', header: T('author'), render: (r) => r.author ?? '—' },
    { key: 'isbn', header: T('isbn'), render: (r) => r.isbn ?? '—' },
    { key: 'category', header: T('category'), render: (r) => r.category ?? '—' },
    { key: 'rack_no', header: T('rack'), render: (r) => r.rack_no ?? '—' },
    { key: 'copies', header: T('copies'), render: (r) => `${r.available_copies}/${r.total_copies}` },
    {
      key: 'actions', header: '', render: (r) => (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setIssueFor(r); setIssueForm({ memberType: 'student', memberId: '', dueDays: 14 }); }}>{T('issueBook')}</Button>
          <Button variant="secondary" onClick={() => { setForm(r); setOpen(true); }}>{T('edit')}</Button>
        </div>
      ),
    },
  ], []);
  const save = async () => {
    if (!form.title?.trim()) return;
    const r = await invoke('library:saveBook', form);
    if (r.ok) { setOpen(false); setForm({}); void load(); }
  };
  const issue = async () => {
    const mid = parseInt(issueForm.memberId);
    if (!mid) return;
    const r = await invoke('library:issue', { bookId: issueFor.id, memberType: issueForm.memberType as 'student' | 'staff', memberId: mid, dueDays: issueForm.dueDays });
    if (r.ok) { setIssueFor(null); void load(); } else alert(r.error);
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input className="max-w-xs" placeholder={T('searchPh')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }} />
        <div className="flex gap-2">
          <Button variant="secondary" className="no-print" onClick={exportExcel} disabled={rows.length === 0}>{t('common.excel')}</Button>
          <Button onClick={() => { setForm({}); setOpen(true); }}>{T('addBook')}</Button>
        </div>
      </div>
      {rows.length === 0 ? <EmptyState title={T('noBooks')} /> : <DataTable columns={cols} rows={rows} empty={T('noBooks')} />}
      <Dialog open={open} onOpenChange={setOpen} title={form.id ? T('edit') : T('addBook')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label={T('title')}><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field></div>
          <Field label={T('author')}><Input value={form.author ?? ''} onChange={(e) => setForm({ ...form, author: e.target.value })} /></Field>
          <Field label={T('isbn')}><Input value={form.isbn ?? ''} onChange={(e) => setForm({ ...form, isbn: e.target.value })} /></Field>
          <Field label={T('category')}><Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label={T('rack')}><Input value={form.rack_no ?? ''} onChange={(e) => setForm({ ...form, rack_no: e.target.value })} /></Field>
          <Field label={T('copies')}><Input type="number" value={form.total_copies ?? 1} onChange={(e) => setForm({ ...form, total_copies: parseInt(e.target.value) || 1 })} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{T('cancel')}</Button>
          <Button onClick={() => void save()}>{T('save')}</Button>
        </div>
      </Dialog>
      <Dialog open={!!issueFor} onOpenChange={(o) => { if (!o) setIssueFor(null); }} title={`${T('issueBook')} — ${issueFor?.title}`}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{T('memberType')}</Label>
            <Select value={issueForm.memberType} onValueChange={(v: string) => setIssueForm({ ...issueForm, memberType: v })}
              options={[{ value: 'student', label: 'Student' }, { value: 'staff', label: 'Staff' }]} />
          </div>
          <div><Label>{T('memberId')}</Label><Input type="number" value={issueForm.memberId} onChange={(e) => setIssueForm({ ...issueForm, memberId: e.target.value })} /></div>
          <div><Label>{T('dueDays')}</Label><Input type="number" value={issueForm.dueDays} onChange={(e) => setIssueForm({ ...issueForm, dueDays: parseInt(e.target.value) || 14 })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIssueFor(null)}>{T('cancel')}</Button>
          <Button onClick={() => void issue()}>{T('issue')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function IssuedTab() {
  const [rows, setRows] = React.useState<any[]>([]);
  const load = async () => setRows(await invoke('library:openLoans', undefined));
  React.useEffect(() => { void load(); }, []);
  const ret = async (id: number) => {
    const r = await invoke('library:return', { loanId: id });
    if (r.ok) { void load(); }
  };
  const cols: Column<any>[] = React.useMemo(() => [
    { key: 'title', header: T('title'), render: (r) => <strong>{r.title}</strong> },
    { key: 'member_name', header: T('member'), render: (r) => `${r.member_name} (${r.member_type})` },
    { key: 'issue_date', header: T('issueDate') },
    { key: 'due_date', header: T('dueDate') },
    { key: 'ret', header: '', render: (r) => <Button variant="secondary" onClick={() => void ret(r.id)}>{T('return')}</Button> },
  ], []);
  return rows.length === 0 ? <EmptyState title={T('noLoans')} /> : <DataTable columns={cols} rows={rows} empty={T('noLoans')} />;
}

function OverdueTab() {
  const [rows, setRows] = React.useState<any[]>([]);
  React.useEffect(() => { invoke('library:overdue', undefined).then(setRows).catch(() => {}); }, []);
  const cols: Column<any>[] = React.useMemo(() => [
    { key: 'title', header: T('title'), render: (r) => <strong>{r.title}</strong> },
    { key: 'member_name', header: T('member'), render: (r) => `${r.member_name} (${r.member_type})` },
    { key: 'due_date', header: T('dueDate') },
    { key: 'overdue_days', header: T('overdueDays'), render: (r) => String(r.overdue_days) },
    { key: 'computed_fine', header: T('fine'), render: (r) => `₹${Number(r.computed_fine).toFixed(0)}` },
  ], []);
  return rows.length === 0 ? <EmptyState title={T('noOverdue')} /> : <DataTable columns={cols} rows={rows} empty={T('noOverdue')} />;
}

export default function LibraryScreen() {
  const [tab, setTab] = React.useState('catalog');
  const [stats, setStats] = React.useState({ books: 0, copies: 0, issued: 0, overdue: 0 });
  React.useEffect(() => { invoke('library:stats', undefined).then(setStats).catch(() => {}); }, []);
  return (
    <div>
      <PageHeader title={t('nav.library')} />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={T('booksCount')} value={String(stats.books)} />
        <StatCard label={T('copiesCount')} value={String(stats.copies)} />
        <StatCard label={T('issuedCount')} value={String(stats.issued)} />
        <StatCard label={T('overdueCount')} value={String(stats.overdue)} />
      </div>
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'catalog', label: T('catalog'), content: <CatalogTab /> },
          { value: 'issued', label: T('issued'), content: <IssuedTab /> },
          { value: 'overdue', label: `${T('overdue')}${stats.overdue ? ` (${stats.overdue})` : ''}`, content: <OverdueTab /> },
        ]}
      />
    </div>
  );
}
