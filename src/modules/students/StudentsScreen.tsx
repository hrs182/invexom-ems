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
import { PageHeader, EmptyState, Alert } from '../../components/ui/feedback';
import type { StudentRow, StudentInput, SessionRow, MasterItem } from '@shared/types';

const EMPTY: StudentInput = { name: '', class_name: '', section: '', gender: '', category: '' };

const FIELDS: { key: keyof StudentInput; label: string; type?: string }[] = [
  { key: 'name', label: t('modules.students.fldName') },
  { key: 'class_name', label: t('modules.students.fldClass') },
  { key: 'section', label: t('modules.students.fldSection') },
  { key: 'roll_no', label: t('modules.students.fldRoll') },
  { key: 'dob', label: t('modules.students.fldDob'), type: 'date' },
  { key: 'gender', label: t('modules.students.fldGender') },
  { key: 'blood_group', label: t('modules.students.fldBlood') },
  { key: 'category', label: t('modules.students.fldCategory') },
  { key: 'religion', label: t('modules.students.fldReligion') },
  { key: 'admission_date', label: t('modules.students.fldAdmDate'), type: 'date' },
  { key: 'previous_school', label: t('modules.students.fldPrevSchool') },
  { key: 'father_name', label: t('modules.students.fldFather') },
  { key: 'father_phone', label: t('modules.students.fldFatherPhone') },
  { key: 'father_occupation', label: t('modules.students.fldFatherOcc') },
  { key: 'mother_name', label: t('modules.students.fldMother') },
  { key: 'mother_phone', label: t('modules.students.fldMotherPhone') },
  { key: 'guardian_name', label: t('modules.students.fldGuardian') },
  { key: 'guardian_phone', label: t('modules.students.fldGuardianPhone') },
  { key: 'address', label: t('modules.students.fldAddress') },
  { key: 'sibling_info', label: t('modules.students.fldSibling') },
];

export function StudentsScreen() {
  const [rows, setRows] = React.useState<StudentRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [q, setQ] = React.useState('');
  const [classFilter, setClassFilter] = React.useState('');
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StudentRow | null>(null);
  const [form, setForm] = React.useState<StudentInput>(EMPTY);
  const [duplicates, setDuplicates] = React.useState<StudentRow[]>([]);
  const [error, setError] = React.useState('');
  const [promoteOpen, setPromoteOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [promoteTo, setPromoteTo] = React.useState({ class_name: '', section: '' });

  const load = React.useCallback(async () => {
    const [s, c] = await Promise.all([
      invoke('students:list', { q: q || undefined, class_name: classFilter || undefined, limit: 200 }),
      invoke('masters:list', { kind: 'class' }),
    ]);
    setRows(s.rows); setTotal(s.total); setClasses(c);
    setSessions(await invoke('settings:sessions:list', undefined));
  }, [q, classFilter]);

  React.useEffect(() => { void load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setDuplicates([]); setError(''); setDialogOpen(true); };
  const openEdit = async (row: StudentRow) => {
    const full = await invoke('students:get', { id: row.id });
    if (!full) return;
    setEditing(row);
    setForm({
      name: full.name, dob: full.dob, gender: full.gender, blood_group: full.blood_group,
      category: full.category, religion: full.religion, nationality: full.nationality,
      class_name: full.class_name, section: full.section, roll_no: full.roll_no,
      admission_date: full.admission_date, previous_school: full.previous_school,
      sibling_info: full.sibling_info, father_name: full.father_name,
      father_occupation: full.father_occupation, father_phone: full.father_phone,
      mother_name: full.mother_name, mother_occupation: full.mother_occupation,
      mother_phone: full.mother_phone, guardian_name: full.guardian_name,
      guardian_phone: full.guardian_phone, address: full.address,
    });
    setDuplicates([]); setError(''); setDialogOpen(true);
  };

  const save = async (force = false) => {
    setError('');
    if (editing) {
      const r = await invoke('students:update', { id: editing.id, patch: form });
      if (!r.ok) { setError(r.error); return; }
    } else {
      const activeSession = sessions.find((s) => s.isActive);
      const r = await invoke('students:create', { input: form, sessionId: activeSession?.id ?? null, force });
      if (!r.ok) {
        if (r.error === 'duplicate-found' && r.duplicates) { setDuplicates(r.duplicates); return; }
        setError(r.error); return;
      }
    }
    setDialogOpen(false);
    void load();
  };

  const doPromote = async () => {
    const activeSession = sessions.find((s) => s.isActive);
    const r = await invoke('students:promote', {
      ids: [...selected], toClass: promoteTo.class_name, toSection: promoteTo.section, sessionId: activeSession?.id ?? null,
    });
    if (!r.ok) { setError(r.error); return; }
    setPromoteOpen(false); setSelected(new Set());
    void load();
  };

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const columns: Column<StudentRow>[] = [
    {
      key: 'sel', header: '', className: 'w-10',
      render: (r) => <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />,
    },
    { key: 'admission_no', header: t('modules.students.admNo') },
    {
      key: 'name', header: t('modules.students.name'),
      render: (r) => <button className="cursor-pointer font-medium text-brand hover:underline" onClick={() => void openEdit(r)}>{r.name}</button>,
    },
    { key: 'class_name', header: t('modules.students.class'), render: (r) => `${r.class_name}${r.section ? `-${r.section}` : ''}` },
    { key: 'roll_no', header: t('modules.students.roll') },
    { key: 'father_phone', header: t('modules.students.fatherPhone') },
    {
      key: 'status', header: t('modules.students.status'),
      render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'muted'}>{r.status}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.students')}
        subtitle={`${total} students`}
        actions={
          <>
            {selected.size > 0 && (
              <Button variant="secondary" onClick={() => setPromoteOpen(true)}>
                {t('modules.students.promote')} ({selected.size})
              </Button>
            )}
            <Button onClick={openAdd}>{t('modules.students.add')}</Button>
          </>
        }
      />
      {error && <Alert tone="danger" title="Error" className="mb-4">{error}</Alert>}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-3">
          <Input placeholder={t('modules.students.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select
            value={classFilter}
            onValueChange={setClassFilter}
            placeholder={t('modules.students.allClasses')}
            options={[{ value: '', label: t('modules.students.allClasses') }, ...classes.map((c) => ({ value: c.name, label: c.name }))]}
            className="w-44"
          />
        </div>
      </Card>
      <DataTable
        columns={columns}
        rows={rows}
        empty={<EmptyState title={t('modules.students.noStudents')} actionLabel={t('modules.students.add')} onAction={openAdd} />}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? t('modules.students.edit') : t('modules.students.newAdmission')} wide>
        {duplicates.length > 0 && (
          <Alert tone="warning" title={t('modules.students.dupTitle')} className="mb-4">
            <ul className="mt-1 list-disc pl-5 text-sm">
              {duplicates.map((d) => (
                <li key={d.id}>{d.name} — {d.admission_no} ({d.class_name})</li>
              ))}
            </ul>
            <Button variant="secondary" className="mt-2" onClick={() => void save(true)}>{t('modules.students.saveAnyway')}</Button>
          </Alert>
        )}
        {error && <Alert tone="danger" title="Error" className="mb-4">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type={f.type ?? 'text'}
                value={String(form[f.key] ?? '')}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t('modules.students.cancel')}</Button>
          <Button onClick={() => void save(false)}>{editing ? t('modules.students.save') : t('modules.students.admit')}</Button>
        </div>
      </Dialog>

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen} title={t('modules.students.promoteTitle', { n: selected.size })}>
        <p className="mb-4 text-sm text-muted">{t('modules.students.promoteSubtitle')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('modules.students.fldClass')}</Label><Input value={promoteTo.class_name} onChange={(e) => setPromoteTo({ ...promoteTo, class_name: e.target.value })} placeholder="e.g. VI" /></div>
          <div><Label>{t('modules.students.fldSection')}</Label><Input value={promoteTo.section} onChange={(e) => setPromoteTo({ ...promoteTo, section: e.target.value })} placeholder="e.g. A" /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPromoteOpen(false)}>Cancel</Button>
          <Button onClick={() => void doPromote()}>{t('modules.students.promote')}</Button>
        </div>
      </Dialog>
    </div>
  );
}
