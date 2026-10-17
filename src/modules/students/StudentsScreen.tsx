import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Dialog } from '../../components/ui/dialog';
import { downloadExcel } from '../../lib/exportExcel';
import { DataTable, type Column } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert, TabFooter } from '../../components/ui/feedback';
import type { StudentRow, StudentInput, SessionRow, MasterItem } from '@shared/types';

const EMPTY: StudentInput = { name: '', class_name: '', section: '', gender: '', category: '' };

const FIELDS: { key: keyof StudentInput; label: string; type?: string; placeholder?: string; required?: boolean }[] = [
  { key: 'name', label: t('modules.students.fldName'), placeholder: 'e.g. Aarav Sharma', required: true },
  { key: 'class_name', label: t('modules.students.fldClass'), required: true },
  { key: 'section', label: t('modules.students.fldSection'), required: true },
  { key: 'roll_no', label: t('modules.students.fldRoll'), placeholder: 'e.g. 12' },
  { key: 'dob', label: t('modules.students.fldDob'), type: 'date' },
  { key: 'gender', label: t('modules.students.fldGender') },
  { key: 'blood_group', label: t('modules.students.fldBlood') },
  { key: 'category', label: t('modules.students.fldCategory') },
  { key: 'religion', label: t('modules.students.fldReligion'), placeholder: 'e.g. Hindu' },
  { key: 'admission_date', label: t('modules.students.fldAdmDate'), type: 'date' },
  { key: 'previous_school', label: t('modules.students.fldPrevSchool'), placeholder: 'e.g. City Public School' },
  { key: 'father_name', label: t('modules.students.fldFather'), placeholder: 'e.g. Rohit Sharma' },
  { key: 'father_phone', label: t('modules.students.fldFatherPhone'), placeholder: 'e.g. 9810000000' },
  { key: 'father_occupation', label: t('modules.students.fldFatherOcc'), placeholder: 'e.g. Teacher' },
  { key: 'mother_name', label: t('modules.students.fldMother'), placeholder: 'e.g. Priya Sharma' },
  { key: 'mother_phone', label: t('modules.students.fldMotherPhone'), placeholder: 'e.g. 9810000001' },
  { key: 'guardian_name', label: t('modules.students.fldGuardian'), placeholder: 'e.g. Amit Verma' },
  { key: 'guardian_phone', label: t('modules.students.fldGuardianPhone'), placeholder: 'e.g. 9810000002' },
  { key: 'address', label: t('modules.students.fldAddress'), placeholder: 'e.g. 12 MG Road, Moradabad' },
  { key: 'sibling_info', label: t('modules.students.fldSibling'), placeholder: 'e.g. Sister in Class III' },
];

export function StudentsScreen() {
  const [rows, setRows] = React.useState<StudentRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [q, setQ] = React.useState('');
  const [classFilter, setClassFilter] = React.useState('');
  const [sectionFilter, setSectionFilter] = React.useState('');
  const [genderFilter, setGenderFilter] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [sections, setSections] = React.useState<MasterItem[]>([]);
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
    const [s, c, sec] = await Promise.all([
      invoke('students:list', {
        q: q || undefined, class_name: classFilter || undefined,
        section: sectionFilter || undefined, gender: genderFilter || undefined,
        category: categoryFilter || undefined, status: statusFilter || undefined,
        limit: 200,
      }),
      invoke('masters:list', { kind: 'class' }),
      invoke('masters:list', { kind: 'section' }),
    ]);
    setRows(s.rows); setTotal(s.total); setClasses(c); setSections(sec);
    setSessions(await invoke('settings:sessions:list', undefined));
  }, [q, classFilter, sectionFilter, genderFilter, categoryFilter, statusFilter]);

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
      transport_allocated: !!full.transport_allocated, transport_amount: full.transport_amount ?? 0,
      photo_path: full.photo_path,
    });
    setDuplicates([]); setError(''); setDialogOpen(true);
  };

  /** Passport-size photo: JPG/PNG only, ≤2MB, downscaled client-side to keep the DB small. */
  const handlePhoto = async (file: File) => {
    setError('');
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      setError(t('modules.students.photoTypeError')); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('modules.students.photoSizeError')); return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 240, MAX_H = 300;
        const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('photo-load-failed'));
      img.src = URL.createObjectURL(file);
    }).catch(() => null);
    if (!dataUrl) { setError(t('modules.students.photoTypeError')); return; }
    setForm({ ...form, photo_path: dataUrl });
  };

  const save = async (force = false) => {
    setError('');
    if (!form.name.trim()) { setError(t('modules.students.errNameRequired')); return; }
    if (!form.class_name) { setError(t('modules.students.errClassRequired')); return; }
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

  const exportExcel = () => {
    downloadExcel(`students-${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Students',
      rows: rows.map((r) => ({
        'Adm No': r.admission_no, 'Name': r.name,
        'Class': `${r.class_name}${r.section ? `-${r.section}` : ''}`,
        'Roll No': r.roll_no, 'DOB': r.dob, 'Gender': r.gender,
        'Blood Group': r.blood_group, 'Category': r.category,
        "Father's Name": r.father_name, "Father's Phone": r.father_phone,
        "Mother's Name": r.mother_name, "Mother's Phone": r.mother_phone,
        'Address': r.address, 'Status': r.status,
      })),
    }]);
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
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>{t('common.excel')}</Button>
          </>
        }
      />
      {error && <Alert tone="danger" title="Error" className="mb-4">{error}</Alert>}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>{t('modules.students.searchPh')}</Label>
            <Input placeholder={t('modules.students.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          </div>
          <div><Label>{t('modules.students.fldClass')}</Label>
            <Select
              value={classFilter}
              onValueChange={(v) => { setClassFilter(v); setSectionFilter(''); }}
              placeholder={t('modules.students.allClasses')}
              options={[{ value: '', label: t('modules.students.allClasses') }, ...classes.map((c) => ({ value: c.name, label: c.name }))]}
              className="w-36"
            />
          </div>
          <div><Label>{t('modules.students.fldSection')}</Label>
            <Select
              value={sectionFilter}
              onValueChange={setSectionFilter}
              placeholder={t('common.all')}
              options={[{ value: '', label: t('common.all') }, ...sections
                .filter((s) => {
                  if (!classFilter) return true;
                  try {
                    const ex = typeof s.extra === 'string' ? JSON.parse(s.extra) : (s.extra ?? {});
                    return (ex as { class?: string }).class === classFilter;
                  } catch { return false; }
                })
                .map((s) => ({ value: s.name, label: s.name }))]}
              className="w-28"
            />
          </div>
          <div><Label>{t('modules.students.fldGender')}</Label>
            <Select
              value={genderFilter}
              onValueChange={setGenderFilter}
              placeholder={t('common.all')}
              options={[
                { value: '', label: t('common.all') },
                { value: 'Male', label: t('modules.students.genderMale') },
                { value: 'Female', label: t('modules.students.genderFemale') },
                { value: 'Other', label: t('modules.students.genderOther') },
              ]}
              className="w-32"
            />
          </div>
          <div><Label>{t('modules.students.fldCategory')}</Label>
            <Select
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              placeholder={t('common.all')}
              options={[{ value: '', label: t('common.all') }, ...['General', 'EWS', 'OBC', 'SC', 'ST'].map((c) => ({ value: c, label: c }))]}
              className="w-32"
            />
          </div>
          <div><Label>{t('modules.students.status')}</Label>
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder={t('common.all')}
              options={[
                { value: '', label: t('common.all') },
                { value: 'active', label: t('modules.students.statusActive') },
                { value: 'inactive', label: t('modules.students.statusInactive') },
              ]}
              className="w-32"
            />
          </div>
          {(q || classFilter || sectionFilter || genderFilter || categoryFilter || statusFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(''); setClassFilter(''); setSectionFilter(''); setGenderFilter(''); setCategoryFilter(''); setStatusFilter(''); }}>
              {t('common.clear')}
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">{t('modules.students.filterCount', { n: total })}</p>
      </Card>
      <DataTable
        columns={columns}
        rows={rows}
        empty={<EmptyState title={t('modules.students.noStudents')} actionLabel={t('modules.students.add')} onAction={openAdd} />}
      />
      <TabFooter>
        <strong>Student list:</strong> Use the filters to narrow by class, section, gender, category or status.
        Status "active" means currently enrolled; "inactive" is for passed-out or transferred students (kept for records).
        Tick the checkbox on a row to select multiple students for bulk actions like promotion.
      </TabFooter>

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
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-border p-3">
          {form.photo_path ? (
            <img src={form.photo_path} alt="Student photo" className="h-20 w-16 rounded-lg border border-border object-cover" />
          ) : (
            <div className="flex h-20 w-16 items-center justify-center rounded-lg bg-surface-2 text-xs text-muted">Photo</div>
          )}
          <div>
            <Label>{t('modules.students.photo')}</Label>
            <input
              type="file" accept="image/jpeg,image/png"
              className="mt-1 block text-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhoto(f); e.target.value = ''; }}
            />
            <p className="mt-1 text-xs text-muted">{t('modules.students.photoHint')}</p>
            {form.photo_path && (
              <button className="mt-1 cursor-pointer text-xs text-danger underline" onClick={() => setForm({ ...form, photo_path: null })}>
                {t('modules.students.photoRemove')}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => {
            if (f.key === 'class_name') {
              return (
                <div key={f.key}>
                  <Label required={f.required} optional={!f.required}>{f.label}</Label>
                  <Select
                    value={form.class_name}
                    onValueChange={(v) => setForm({ ...form, class_name: v, section: '' })}
                    placeholder={t('modules.students.fldClass')}
                    options={classes.map((c) => ({ value: c.name, label: c.name }))}
                  />
                </div>
              );
            }
            if (f.key === 'section') {
              const opts = sections
                .filter((s) => {
                  if (!form.class_name) return true;
                  let ex: { class?: string } | null = null;
                  try { ex = typeof s.extra === 'string' ? JSON.parse(s.extra) : (s.extra as { class?: string } | undefined) ?? null; } catch { ex = null; }
                  return !ex?.class || ex.class === form.class_name;
                })
                .map((s) => ({ value: s.name, label: s.name }));
              return (
                <div key={f.key}>
                  <Label required={f.required} optional={!f.required}>{f.label}</Label>
                  <Select
                    value={form.section}
                    onValueChange={(v) => setForm({ ...form, section: v })}
                    placeholder={t('modules.students.fldSection')}
                    options={opts}
                  />
                </div>
              );
            }
            if (f.key === 'gender') {
              return (
                <div key={f.key}>
                  <Label required={f.required} optional={!f.required}>{f.label}</Label>
                  <Select
                    value={form.gender}
                    onValueChange={(v) => setForm({ ...form, gender: v })}
                    placeholder={t('modules.students.fldGender')}
                    options={[
                      { value: 'Male', label: t('modules.students.genderMale') },
                      { value: 'Female', label: t('modules.students.genderFemale') },
                      { value: 'Other', label: t('modules.students.genderOther') },
                    ]}
                  />
                </div>
              );
            }
            if (f.key === 'blood_group') {
              return (
                <div key={f.key}>
                  <Label required={f.required} optional={!f.required}>{f.label}</Label>
                  <Select
                    value={form.blood_group ?? ''}
                    onValueChange={(v) => setForm({ ...form, blood_group: v })}
                    placeholder={t('modules.students.fldBlood')}
                    options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => ({ value: b, label: b }))}
                  />
                </div>
              );
            }
            if (f.key === 'category') {
              return (
                <div key={f.key}>
                  <Label required={f.required} optional={!f.required}>{f.label}</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                    placeholder={t('modules.students.fldCategory')}
                    options={['General', 'EWS', 'OBC', 'SC', 'ST'].map((c) => ({ value: c, label: c }))}
                  />
                </div>
              );
            }
            return (
              <div key={f.key}>
                <Label required={f.required} optional={!f.required}>{f.label}</Label>
                <Input
                  type={f.type ?? 'text'}
                  placeholder={f.placeholder}
                  value={String(form[f.key] ?? '')}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            );
          })}
        </div>
        {/* Transport allocation */}
        <div className="mt-4 rounded-xl border border-border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4" checked={!!form.transport_allocated}
              onChange={(e) => setForm({ ...form, transport_allocated: e.target.checked })} />
            Transport allocated
            <span className="text-xs font-normal text-muted">(tick if this student uses school transport)</span>
          </label>
          {!!form.transport_allocated && (
            <div className="mt-2 max-w-52">
              <Label>Monthly transport fee ₹</Label>
              <Input type="number" placeholder="e.g. 800" value={String(form.transport_amount ?? '')}
                onChange={(e) => setForm({ ...form, transport_amount: parseFloat(e.target.value) || 0 })} />
              <p className="mt-1 text-xs text-muted">This amount will be added to the student's monthly fee dues wherever transport applies. Untick to stop future transport charges.</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t('modules.students.cancel')}</Button>
          <Button onClick={() => void save(false)}>{editing ? t('modules.students.save') : t('modules.students.admit')}</Button>
        </div>
      </Dialog>

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen} title={t('modules.students.promoteTitle', { n: selected.size })}>
        <p className="mb-4 text-sm text-muted">{t('modules.students.promoteSubtitle')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('modules.students.fldClass')}</Label>
            <Select
              value={promoteTo.class_name}
              onValueChange={(v) => setPromoteTo({ ...promoteTo, class_name: v, section: '' })}
              placeholder={t('modules.students.fldClass')}
              options={classes.map((c) => ({ value: c.name, label: c.name }))}
            />
          </div>
          <div>
            <Label>{t('modules.students.fldSection')}</Label>
            <Select
              value={promoteTo.section}
              onValueChange={(v) => setPromoteTo({ ...promoteTo, section: v })}
              placeholder={t('modules.students.fldSection')}
              options={sections
                .filter((s) => {
                  if (!promoteTo.class_name) return true;
                  let ex: { class?: string } | null = null;
                  try { ex = typeof s.extra === 'string' ? JSON.parse(s.extra) : (s.extra as { class?: string } | undefined) ?? null; } catch { ex = null; }
                  return !ex?.class || ex.class === promoteTo.class_name;
                })
                .map((s) => ({ value: s.name, label: s.name }))}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPromoteOpen(false)}>Cancel</Button>
          <Button onClick={() => void doPromote()}>{t('modules.students.promote')}</Button>
        </div>
      </Dialog>
    </div>
  );
}
