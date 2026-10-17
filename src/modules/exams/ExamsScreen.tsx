import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label, Field } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { ReportCardPrint, DatesheetPrint, ReportPrint } from '../../components/print/documents';
import { downloadExcel } from '../../lib/exportExcel';
import { Dialog } from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { DataTable, type Column } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert, StatCard, TabFooter } from '../../components/ui/feedback';
import { Tabs } from '../../components/ui/primitives';
import type { ExamRow, ExamSubject, DatesheetRow, ResultRow, SessionRow, MasterItem, CardTemplate } from '@shared/types';

function useExams() {
  const [exams, setExams] = React.useState<ExamRow[]>([]);
  const [examId, setExamId] = React.useState('');
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const load = React.useCallback(async () => {
    const s = await invoke('settings:sessions:list', undefined);
    setSessions(s);
    const active = s.find((x) => x.isActive);
    const list = await invoke('exams:list', { sessionId: active?.id ?? null });
    setExams(list);
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return { exams, examId, setExamId, sessions, reload: load };
}

function ExamPicker({ examId, setExamId, exams, onNew }: {
  examId: string; setExamId: (v: string) => void; exams: ExamRow[]; onNew: () => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div><Label>{t('modules.exams.exams')}</Label>
        <Select value={examId} onValueChange={setExamId} placeholder="Select exam"
          options={exams.map((e) => ({ value: String(e.id), label: `${e.name}${e.is_locked ? ' (locked)' : ''}` }))} className="w-64" />
      </div>
      <Button variant="secondary" onClick={onNew}>+ New exam</Button>
    </div>
  );
}

interface ExamTabProps {
  className: string;
  exams: ExamRow[];
  examId: string;
  setExamId: (v: string) => void;
  sessions: SessionRow[];
  reload: () => void;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  onNewExam: () => void;
}

function ExamsTab({ className, exams, examId, setExamId, sessions, reload, createOpen, setCreateOpen }: ExamTabProps) {
  const [form, setForm] = React.useState({ name: '', term: 'Term 1', classes: [] as string[] });
  const [lockMsg, setLockMsg] = React.useState('');
  const [subjects, setSubjects] = React.useState<ExamSubject[]>([]);
  const [subjRows, setSubjRows] = React.useState<{ subject: string; class_name: string; max_marks: number; pass_marks: number; weightage: number }[]>([]);
  const [usedSubjects, setUsedSubjects] = React.useState<string[]>([]);
  const [masterClasses, setMasterClasses] = React.useState<MasterItem[]>([]);

  React.useEffect(() => {
    invoke('masters:list', { kind: 'class' }).then(setMasterClasses).catch(() => {});
  }, []);
  // Suggest subject names already used in this class's earlier exams (keeps naming consistent).
  React.useEffect(() => {
    if (className) invoke('exams:subjects:used', { className }).then(setUsedSubjects).catch(() => {});
    else setUsedSubjects([]);
  }, [className]);
  React.useEffect(() => {
    if (examId) invoke('exams:subjects:list', { examId: Number(examId) }).then(setSubjects).catch(() => {});
    else setSubjects([]);
  }, [examId]);

  // This tab works on the globally selected class only.
  const classExamSubjects = subjects.filter((s) => s.class_name === className);

  // Whenever the create dialog opens, default it to the currently selected class
  // (works whether opened from this tab or via "+ New exam" in another tab).
  React.useEffect(() => {
    if (createOpen) setForm({ name: '', term: 'Term 1', classes: className ? [className] : [] });
  }, [createOpen, className]);
  const openCreate = () => setCreateOpen(true);

  const create = async () => {
    const active = sessions.find((s) => s.isActive);
    const r = await invoke('exams:create', {
      name: form.name, term: form.term, sessionId: active?.id ?? null,
      classes: form.classes,
    });
    if (r.ok) {
      setCreateOpen(false);
      setForm({ name: '', term: 'Term 1', classes: className ? [className] : [] });
      // Auto-select the newly created exam so subjects/rows added next
      // go to the right exam (was: selector stayed on the previous exam).
      setExamId(String(r.id));
      void reload();
    }
  };

  const exam = exams.find((e) => String(e.id) === examId);
  const [editingSubj, setEditingSubj] = React.useState<ExamSubject | null>(null);
  const [removingSubj, setRemovingSubj] = React.useState<ExamSubject | null>(null);
  const [subjErr, setSubjErr] = React.useState('');
  const reloadSubjects = React.useCallback(async () => {
    if (examId) setSubjects(await invoke('exams:subjects:list', { examId: Number(examId) }));
  }, [examId]);
  const addSubjRow = () => setSubjRows([...subjRows, { subject: usedSubjects[0] ?? '', class_name: className, max_marks: 100, pass_marks: 33, weightage: 100 }]);
  const saveSubjects = async () => {
    if (!examId || !className) return;
    const r = await invoke('exams:subjects:save', { examId: Number(examId), subjects: subjRows });
    if (r.ok) { setSubjRows([]); void reloadSubjects(); }
  };
  const saveEditedSubject = async () => {
    if (!editingSubj) return;
    setSubjErr('');
    try {
      const r = await invoke('exams:subjects:update', {
        id: editingSubj.id, subject: editingSubj.subject,
        max_marks: editingSubj.max_marks, pass_marks: editingSubj.pass_marks, weightage: editingSubj.weightage,
      });
      if (!r.ok) { setSubjErr(r.error === 'name-exists' ? 'A subject with this name already exists.' : r.error); return; }
      setEditingSubj(null);
      void reloadSubjects();
    } catch (e) { setSubjErr(e instanceof Error ? e.message : 'Failed to update'); }
  };
  const deleteSubject = async () => {
    if (!removingSubj) return;
    const r = await invoke('exams:subjects:delete', { id: removingSubj.id });
    if (r.ok) { setRemovingSubj(null); void reloadSubjects(); }
  };

  const lock = async () => {
    if (!examId) return;
    const r = await invoke('exams:lock', { examId: Number(examId) });
    setLockMsg(r.ok ? 'Exam locked.' : r.error);
    void reload();
  };
  const unlock = async () => {
    if (!examId) return;
    const pw = prompt('Enter admin password to unlock:');
    if (!pw) return;
    const r = await invoke('exams:unlock', { examId: Number(examId), adminPassword: pw });
    setLockMsg(r.ok ? 'Exam unlocked.' : r.error);
    void reload();
  };

  return (
    <div>
      {lockMsg && <Alert tone="brand" title="" className="mb-4">{lockMsg}</Alert>}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={openCreate} />
        {exam?.is_locked
          ? <Badge tone="warning">{t('modules.exams.locked')}</Badge>
          : <div className="flex gap-2"><Button variant="secondary" onClick={() => void lock()}>{t('modules.exams.lock')}</Button></div>}
        {!!exam?.is_locked && <Button variant="secondary" onClick={() => void unlock()}>{t('modules.exams.unlock')}</Button>}
      </div>
      {!examId ? (
        <EmptyState title="No exam for this class yet" hint={`Create one with "+ New exam" — it will be set up for class ${className || '—'}.`} />
      ) : (
      <>
      <h3 className="mb-2 font-semibold">{t('modules.exams.subjectsTitle')} <span className="font-normal text-muted">· Class {className}</span></h3>
      <DataTable
        columns={[
          { key: 'subject', header: t('modules.exams.subject') },
          { key: 'max_marks', header: t('modules.exams.maxMarks') },
          { key: 'pass_marks', header: t('modules.exams.passMarks') },
          { key: 'weightage', header: t('modules.exams.weightage') },
          {
            key: 'actions', header: t('common.actions'), className: 'text-right',
            render: (r: ExamSubject) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setSubjErr(''); setEditingSubj({ ...r }); }}>{t('common.edit')}</Button>
                <Button variant="ghost" size="sm" onClick={() => setRemovingSubj(r)}>{t('common.delete')}</Button>
              </span>
            ),
          },
        ]}
        rows={classExamSubjects}
        empty={<EmptyState title={t('modules.exams.noSubjects')} hint={`Add this exam's subjects for class ${className} below.`} />}
      />
      <Dialog open={!!editingSubj} onOpenChange={(v) => !v && setEditingSubj(null)} title={`${t('common.edit')} — ${editingSubj?.subject ?? ''}`}>
        {editingSubj && (
          <div className="grid gap-3">
            {subjErr && <Alert tone="danger" title="">{subjErr}</Alert>}
            <Field label={t('modules.exams.subject')}>
              <Input value={editingSubj.subject} onChange={(e) => setEditingSubj({ ...editingSubj, subject: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label={t('modules.exams.maxMarks')}>
                <Input type="number" value={editingSubj.max_marks} onChange={(e) => setEditingSubj({ ...editingSubj, max_marks: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label={t('modules.exams.passMarks')}>
                <Input type="number" value={editingSubj.pass_marks} onChange={(e) => setEditingSubj({ ...editingSubj, pass_marks: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label={t('modules.exams.weightage')}>
                <Input type="number" value={editingSubj.weightage} onChange={(e) => setEditingSubj({ ...editingSubj, weightage: parseFloat(e.target.value) || 0 })} />
              </Field>
            </div>
            <p className="text-xs text-muted">Renaming a subject also renames it in entered marks and the datesheet — nothing is lost.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingSubj(null)}>{t('common.cancel')}</Button>
              <Button onClick={() => void saveEditedSubject()}>{t('common.save')}</Button>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!removingSubj} onOpenChange={(v) => !v && setRemovingSubj(null)}
        title={t('common.delete')}
        message={removingSubj ? `Delete "${removingSubj.subject}" for class ${className}? Its entered marks and datesheet entries will also be removed.` : ''}
        confirmLabel={t('common.delete')} danger
        onConfirm={() => void deleteSubject()}
      />
      <Card className="mt-3 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-medium">{t('modules.exams.editSubjects')} <span className="font-normal text-muted">· Class {className}</span></h4>
          <Button variant="secondary" onClick={addSubjRow} disabled={!examId || !className}>{t('modules.exams.addRow')}</Button>
        </div>
        {subjRows.map((r, i) => (
          <div key={i} className="mb-2 grid grid-cols-4 gap-2">
            <Input placeholder="Subject" list="exam-subject-datalist" value={r.subject} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} />
            <Input type="number" placeholder="Max" value={r.max_marks} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, max_marks: parseFloat(e.target.value) || 0 } : x))} />
            <Input type="number" placeholder="Pass" value={r.pass_marks} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, pass_marks: parseFloat(e.target.value) || 0 } : x))} />
            <Input type="number" placeholder="Wt%" value={r.weightage} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, weightage: parseFloat(e.target.value) || 0 } : x))} />
          </div>
        ))}
        <datalist id="exam-subject-datalist">
          {usedSubjects.map((s) => <option key={s} value={s} />)}
        </datalist>
        {subjRows.length > 0 && <Button onClick={() => void saveSubjects()}>{t('modules.exams.saveSubjects')}</Button>}
      </Card>
      </>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen} title={t('modules.exams.newExam')}>
        <div className="grid gap-3">
          <div><Label>{t('modules.exams.examName')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Half-Yearly Exam" /></div>
          <div><Label>{t('modules.exams.term')}</Label><Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></div>
          <div>
            <Label>{t('modules.exams.classes')}</Label>
            <div className="flex flex-wrap gap-2 rounded-xl border border-border-strong bg-surface p-3">
              {masterClasses.length === 0 && <span className="text-sm text-muted">—</span>}
              {masterClasses.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={form.classes.includes(c.name)}
                    onChange={(e) => setForm({
                      ...form,
                      classes: e.target.checked ? [...form.classes, c.name] : form.classes.filter((x) => x !== c.name),
                    })}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('modules.exams.cancel')}</Button>
          <Button onClick={() => void create()} disabled={!form.name.trim() || form.classes.length === 0}>{t('modules.exams.create')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function DatesheetTab({ className, exams, examId, setExamId, onNewExam }: ExamTabProps) {
  const [rows, setRows] = React.useState<DatesheetRow[]>([]);
  const [draft, setDraft] = React.useState<Omit<DatesheetRow, 'id'>[]>([]);
  const [clashes, setClashes] = React.useState<string[]>([]);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    setDraft([]); setClashes([]); setMsg('');
    if (examId) invoke('exams:datesheet:list', { examId: Number(examId) }).then(setRows).catch(() => {});
    else setRows([]);
  }, [examId]);

  const exam = exams.find((e) => String(e.id) === examId);
  const [removingDateRow, setRemovingDateRow] = React.useState<DatesheetRow | null>(null);
  const classRows = rows.filter((r) => r.class_name === className);
  const addRow = () => setDraft([...draft, { subject: '', class_name: className, date: '', start_time: '09:00', end_time: '12:00', room: '' }]);
  const removeDraftRow = (i: number) => setDraft(draft.filter((_, j) => j !== i));
  /** Persists the given rows for the selected class (class-scoped replace). Returns success. */
  const persistClassRows = async (next: Omit<DatesheetRow, 'id'>[]): Promise<boolean> => {
    if (!examId || !className) return false;
    setClashes([]); setMsg('');
    const payload = next.map((r) => ({
      subject: r.subject, class_name: className, date: r.date,
      start_time: r.start_time, end_time: r.end_time, room: r.room,
    }));
    const r = await invoke('exams:datesheet:save', { examId: Number(examId), className, rows: payload });
    if (!r.ok) { setMsg(r.error); return false; }
    if (r.clashes.length) { setClashes(r.clashes); return false; }
    setRows(await invoke('exams:datesheet:list', { examId: Number(examId) }));
    return true;
  };
  const save = async () => {
    // Send existing rows for this class PLUS the new draft rows — the save is
    // class-scoped, so sending only the draft would wipe the saved rows.
    if (await persistClassRows([...classRows, ...draft])) { setDraft([]); setMsg('Datesheet saved.'); }
  };
  const editSavedRow = (row: DatesheetRow) => {
    // Move it into the draft editor; saving persists the edited version.
    setRows(rows.filter((r) => r.id !== row.id));
    setDraft([...draft, {
      subject: row.subject, class_name: className, date: row.date,
      start_time: row.start_time, end_time: row.end_time, room: row.room,
    }]);
    setMsg('');
  };
  const deleteSavedRow = async () => {
    if (!removingDateRow) return;
    setRemovingDateRow(null);
    await persistClassRows(classRows.filter((r) => r.id !== removingDateRow.id));
  };

  return (
    <div>
      <div className="mb-4"><ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={onNewExam} /></div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      {clashes.length > 0 && (
        <Alert tone="danger" title="Clashes detected — fix before saving" className="mb-4">
          <ul className="list-disc pl-5 text-sm">{clashes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </Alert>
      )}
      {!examId ? (
        <EmptyState title="No exam for this class yet" hint={`Create one with "+ New exam" — it will be set up for class ${className || '—'}.`} />
      ) : (
      <>
      <h4 className="mb-2 font-medium">{t('modules.exams.datesheet')} <span className="font-normal text-muted">· Class {className}</span></h4>
      <DataTable
        columns={[
          { key: 'date', header: t('modules.fees.date') },
          { key: 'subject', header: t('modules.exams.subject') },
          { key: 'start_time', header: 'Start', render: (r) => `${r.start_time}–${r.end_time}` },
          { key: 'room', header: t('modules.exams.room') },
          {
            key: 'actions', header: t('common.actions'), className: 'text-right',
            render: (r: DatesheetRow) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => editSavedRow(r)}>{t('common.edit')}</Button>
                <Button variant="ghost" size="sm" onClick={() => setRemovingDateRow(r)}>{t('common.delete')}</Button>
              </span>
            ),
          },
        ]}
        rows={classRows}
        empty={<EmptyState title={t('modules.exams.noDatesheet')} hint={`Build the datesheet for class ${className} below.`} />}
      />
      <ConfirmDialog
        open={!!removingDateRow} onOpenChange={(v) => !v && setRemovingDateRow(null)}
        title={t('common.delete')}
        message={removingDateRow ? `Delete the datesheet entry for "${removingDateRow.subject}" on ${removingDateRow.date}?` : ''}
        confirmLabel={t('common.delete')} danger
        onConfirm={() => void deleteSavedRow()}
      />
      <Card className="mt-3 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-medium">{t('modules.exams.buildDatesheet')} <span className="font-normal text-muted">· Class {className}</span></h4>
          <div className="flex gap-2"><Button variant="secondary" onClick={addRow}>{t('modules.exams.addRow')}</Button>{draft.length > 0 && <Button onClick={() => void save()}>{t('modules.exams.saveDatesheet')}</Button>}</div>
        </div>
        {draft.map((r, i) => (
          <div key={i} className="mb-2 grid grid-cols-6 gap-2">
            <Input type="date" value={r.date} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
            <Input placeholder="Subject" value={r.subject} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} />
            <Input type="time" value={r.start_time} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))} />
            <Input type="time" value={r.end_time} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, end_time: e.target.value } : x))} />
            <Input placeholder="Room" value={r.room} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, room: e.target.value } : x))} />
            <Button variant="ghost" size="sm" onClick={() => removeDraftRow(i)}>✕</Button>
          </div>
        ))}
      </Card>
      <div className="no-print mt-3">
        <Button variant="secondary" onClick={() => window.print()} disabled={classRows.length === 0}>
          {t('modules.exams.printDatesheet')}
        </Button>
      </div>
      {classRows.length > 0 && <DatesheetPrint examName={exam?.name ?? ''} className={className} rows={classRows} />}
      </>
      )}
    </div>
  );
}

function MarksTab({ className, exams, examId, setExamId, onNewExam }: ExamTabProps) {
  const [subjects, setSubjects] = React.useState<ExamSubject[]>([]);
  const [subject, setSubject] = React.useState('');
  const [roster, setRoster] = React.useState<{ id: number; name: string; roll_no: string }[]>([]);
  const [marks, setMarks] = React.useState<Record<number, { marks: string; absent: boolean }>>({});
  const [msg, setMsg] = React.useState('');

  // On exam/class switch, drop stale selections (subject used to linger and show
  // the wrong class's students).
  React.useEffect(() => {
    setSubject(''); setRoster([]); setMarks({}); setMsg('');
    if (!examId) { setSubjects([]); return; }
    invoke('exams:subjects:list', { examId: Number(examId) }).then((s) => {
      const forClass = s.filter((x) => x.class_name === className);
      setSubjects(forClass);
      if (forClass.length) setSubject(forClass[0].subject);
    }).catch(() => {});
  }, [examId, className]);

  const classSubjects = subjects; // already filtered to the selected class

  const load = React.useCallback(async () => {
    if (!examId || !subject || !className) return;
    const [all, m] = await Promise.all([
      invoke('students:list', { class_name: className, limit: 500 }),
      invoke('exams:marks:get', { examId: Number(examId), subject, className }),
    ]);
    const list = all.rows.map((s) => ({ id: s.id, name: s.name, roll_no: s.roll_no }));
    setRoster(list);
    setMarks(Object.fromEntries(list.map((s) => [s.id, { marks: m[s.id]?.marks != null ? String(m[s.id].marks) : '', absent: !!m[s.id]?.absent }])));
  }, [examId, subject, className]);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setMsg('');
    if (!examId) return;
    const entries = roster.map((s) => ({
      student_id: s.id,
      marks_obtained: marks[s.id]?.absent ? null : (marks[s.id]?.marks === '' ? null : parseFloat(marks[s.id]?.marks)),
      is_absent: !!marks[s.id]?.absent,
    }));
    const r = await invoke('exams:marks:save', { examId: Number(examId), subject, className, entries });
    if (!r.ok) { setMsg(r.error); return; }
    setMsg(r.rejected.length ? `Saved with ${r.rejected.length} rejected (over max marks).` : `Saved ${entries.length} entries.`);
  };

  const exam = exams.find((e) => String(e.id) === examId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={onNewExam} />
        <div><Label>{t('modules.exams.subject')} <span className="font-normal text-muted">· Class {className}</span></Label>
          <Select value={subject} onValueChange={setSubject} placeholder="Subject"
            options={classSubjects.map((s) => ({ value: s.subject, label: s.subject }))} className="w-52" />
        </div>
        {exam?.is_locked && <Badge tone="warning">{t('modules.exams.lockedNote')}</Badge>}
        <Button className="ml-auto" onClick={() => void save()} disabled={!!exam?.is_locked || !subject}>{t('modules.exams.saveMarks')}</Button>
      </div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      {examId && classSubjects.length === 0 && (
        <EmptyState
          title={t('modules.exams.noSubjects')}
          hint={`Add subjects for class ${className} in the Exams tab first, then enter marks here.`}
        />
      )}
      {classSubjects.length > 0 && (
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2">{t('modules.attendance.roll')}</th><th className="px-3 py-2">{t('modules.exams.student')}</th>
            <th className="px-3 py-2" style={{ width: 140 }}>{t('modules.exams.marksCol')}</th><th className="px-3 py-2">{t('modules.exams.absent')}</th>
          </tr></thead>
          <tbody>
            {roster.map((s) => (
              <tr key={s.id} className="border-b border-border">
                <td className="px-3 py-1.5 text-muted">{s.roll_no}</td>
                <td className="px-3 py-1.5 font-medium">{s.name}</td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number" className="w-28" disabled={!!exam?.is_locked || marks[s.id]?.absent}
                    value={marks[s.id]?.marks ?? ''}
                    onChange={(e) => setMarks({ ...marks, [s.id]: { marks: e.target.value, absent: false } })}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).closest('tr')?.nextElementSibling?.querySelector('input')?.focus(); }}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input type="checkbox" disabled={!!exam?.is_locked} checked={!!marks[s.id]?.absent}
                    onChange={(e) => setMarks({ ...marks, [s.id]: { marks: '', absent: e.target.checked } })} aria-label="Absent" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}
    </div>
  );
}

function ResultsTab({ className, exams, examId, setExamId, onNewExam }: ExamTabProps) {
  const exam = exams.find((e) => String(e.id) === examId);
  const [results, setResults] = React.useState<ResultRow[]>([]);
  const [analysis, setAnalysis] = React.useState<{ subjectStats: { subject: string; avg: number; highest: number; lowest: number; passPercent: number }[]; toppers: { name: string; percent: number }[]; failList: { name: string; subjects: string[] }[] } | null>(null);

  const load = React.useCallback(async () => {
    if (!examId || !className) { setResults([]); setAnalysis(null); return; }
    setResults(await invoke('exams:results', { examId: Number(examId), className }));
    setAnalysis(await invoke('exams:analysis', { examId: Number(examId), className }));
  }, [examId, className]);
  React.useEffect(() => { void load(); }, [load]);

  const subjects = results[0]?.subjects.map((s) => s.subject) ?? [];

  const exportResultsExcel = () => {
    downloadExcel(`results-${exam?.name ?? 'exam'}-class-${className}`, [{
      name: 'Merit List',
      rows: results.map((r) => {
        const row: Record<string, unknown> = {
          'Rank': r.rank, 'Student': r.name, 'Adm No': r.admission_no, 'Roll No': r.roll_no,
        };
        for (const s of r.subjects) row[s.subject] = s.absent ? 'Absent' : s.marks;
        row['Total'] = r.total; row['Max'] = r.maxTotal;
        row['Percentage'] = r.percent; row['Grade'] = r.grade;
        row['Result'] = r.pass ? 'Pass' : 'Fail';
        return row;
      }),
    }]);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={onNewExam} />
        <span className="pb-2 text-sm text-muted">Class {className || '—'}</span>
        <Button onClick={() => void load()}>{t('modules.exams.computeResults')}</Button>
        <Button variant="secondary" className="no-print" onClick={() => window.print()} disabled={results.length === 0}>{t('modules.exams.print')}</Button>
        <Button variant="secondary" className="no-print" onClick={exportResultsExcel} disabled={results.length === 0}>{t('common.excel')}</Button>
      </div>
      {analysis && (
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Card className="p-4"><h4 className="mb-2 font-semibold">{t('modules.exams.subjectAvgs')}</h4>
            {analysis.subjectStats.map((s) => (
              <div key={s.subject} className="flex justify-between py-1 text-sm"><span>{s.subject}</span><span className="font-medium">{s.avg} (pass {s.passPercent}%)</span></div>
            ))}
          </Card>
          <Card className="p-4"><h4 className="mb-2 font-semibold">{t('modules.exams.toppers')}</h4>
            {analysis.toppers.slice(0, 5).map((x, i) => (
              <div key={i} className="flex justify-between py-1 text-sm"><span>{i + 1}. {x.name}</span><span className="font-medium">{x.percent}%</span></div>
            ))}
          </Card>
          <Card className="p-4"><h4 className="mb-2 font-semibold">Fail list ({analysis.failList.length})</h4>
            {analysis.failList.slice(0, 8).map((x, i) => (
              <div key={i} className="py-1 text-sm">{x.name} <span className="text-muted">({x.subjects.join(', ')})</span></div>
            ))}
            {analysis.failList.length === 0 && <p className="text-sm text-muted">No failures 🎉</p>}
          </Card>
        </div>
      )}
      {results.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-2">Rank</th><th className="px-3 py-2">{t('modules.exams.student')}</th>
              {subjects.map((s) => <th key={s} className="px-3 py-2 text-right">{s}</th>)}
              <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2">Grade</th><th className="px-3 py-2">Result</th>
            </tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.student_id} className="border-b border-border">
                  <td className="px-3 py-1.5 font-bold">{r.rank}</td>
                  <td className="px-3 py-1.5 font-medium">{r.name}</td>
                  {r.subjects.map((s) => <td key={s.subject} className="px-3 py-1.5 text-right">{s.absent ? 'Ab' : s.marks}</td>)}
                  <td className="px-3 py-1.5 text-right font-semibold">{r.total}/{r.maxTotal}</td>
                  <td className="px-3 py-1.5 text-right">{r.percent}%</td>
                  <td className="px-3 py-1.5"><Badge tone={r.pass ? 'success' : 'danger'}>{r.grade}</Badge></td>
                  <td className="px-3 py-1.5">{r.pass ? 'Pass' : 'Fail'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {results.length > 0 && (
        <ReportPrint
          title={`Results — ${exam?.name ?? ''} · Class ${className}`}
          columns={[
            { header: 'Rank', key: 'rank' },
            { header: t('modules.exams.student'), key: 'name' },
            ...subjects.map((s) => ({ header: s, key: `sub_${s}` })),
            { header: 'Total', key: 'total' },
            { header: '%', key: 'percent' },
            { header: t('modules.exams.grade'), key: 'grade' },
            { header: t('modules.exams.result'), key: 'result' },
          ]}
          rows={results.map((r) => {
            const row: Record<string, unknown> = {
              rank: r.rank, name: r.name,
              total: `${r.total}/${r.maxTotal}`,
              percent: `${r.percent}%`, grade: r.grade,
              result: r.pass ? 'Pass' : 'Fail',
            };
            r.subjects.forEach((s) => { row[`sub_${s.subject}`] = s.absent ? 'Ab' : (s.marks ?? '—'); });
            return row;
          })}
        />
      )}
    </div>
  );
}

function ReportCardsTab({ className, exams, examId, setExamId, onNewExam }: ExamTabProps) {
  const [results, setResults] = React.useState<ResultRow[]>([]);
  const [templates, setTemplates] = React.useState<CardTemplate[]>([]);
  const [templateId, setTemplateId] = React.useState('');
  const [preview, setPreview] = React.useState<ResultRow | null>(null);
  const [showPhoto, setShowPhoto] = React.useState(true);
  const [showRemarks, setShowRemarks] = React.useState(true);
  const [printAll, setPrintAll] = React.useState(false);

  // Print-all: render a print-doc per student, print once painted, then clean up.
  React.useEffect(() => {
    if (!printAll) return;
    const done = () => setPrintAll(false);
    window.addEventListener('afterprint', done);
    const id = window.setTimeout(() => window.print(), 200);
    return () => { window.removeEventListener('afterprint', done); window.clearTimeout(id); };
  }, [printAll]);

  const exam = exams.find((e) => String(e.id) === examId);
  const cardData = (r: ResultRow) => ({
    examName: exam?.name ?? '', className, section: r.section, name: r.name,
    admission_no: r.admission_no, roll_no: r.roll_no ?? '', father_name: r.father_name,
    subjects: r.subjects,
    total: r.total, maxTotal: r.maxTotal,
    percent: r.percent, grade: r.grade, pass: r.pass,
    photo: r.photo_path, showPhoto,
  });

  React.useEffect(() => {
    invoke('cards:templates:list', { kind: 'report-card' }).then((tpls) => {
      setTemplates(tpls);
      const def = tpls.find((x) => x.is_default);
      if (def) setTemplateId(String(def.id));
    }).catch(() => {});
  }, []);

  const load = React.useCallback(async () => {
    if (!examId || !className) { setResults([]); setPreview(null); return; }
    setResults(await invoke('exams:results', { examId: Number(examId), className }));
  }, [examId, className]);
  React.useEffect(() => { void load(); }, [load]);

  const tpl = templates.find((x) => String(x.id) === templateId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={onNewExam} />
        <span className="pb-2 text-sm text-muted">Class {className || '—'}</span>
        <div><Label>{t('modules.exams.template')}</Label>
          <Select value={templateId} onValueChange={setTemplateId} placeholder="Template"
            options={templates.map((x) => ({ value: String(x.id), label: `${x.name} (v${x.version})` }))} className="w-52" />
        </div>
        <Button onClick={() => void load()}>{t('modules.exams.generate')}</Button>
        <Button variant="secondary" className="no-print" onClick={() => setPrintAll(true)} disabled={results.length === 0}>{t('modules.exams.printAll')}</Button>
      </div>
      {printAll && results.map((r) => <ReportCardPrint key={r.student_id} card={cardData(r)} />)}
      <Card className="mb-4 p-4">
        <h4 className="mb-2 font-medium">{t('modules.exams.templateOptions')}</h4>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} /> Photo</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showRemarks} onChange={(e) => setShowRemarks(e.target.checked)} /> Remarks</label>
        </div>
        {tpl && <p className="mt-2 text-xs text-muted">Using template “{tpl.name}” v{tpl.version}{tpl.is_default ? ' (default)' : ''}</p>}
      </Card>
      {results.length > 0 && !preview && (
        <DataTable
          columns={[
            { key: 'rank', header: t('modules.exams.rank') },
            { key: 'name', header: t('modules.exams.student') },
            { key: 'percent', header: '%', render: (r) => `${r.percent}%` },
            { key: 'grade', header: t('modules.exams.grade'), render: (r) => <Badge tone={r.pass ? 'success' : 'danger'}>{r.grade}</Badge> },
            { key: 'preview', header: '', render: (r) => <Button variant="secondary" onClick={() => setPreview(r)}>Preview</Button> },
          ]}
          rows={results}
          empty={<EmptyState title="No results" />}
        />
      )}
      {preview && (
        <>
        <Card className="p-8">
          <div className="print-area mx-auto max-w-[700px]">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold">Report Card</h2>
              <p className="text-muted">{exam?.name} · Class {className}</p>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted">Name:</span> <strong>{preview.name}</strong></div>
              <div><span className="text-muted">Father's name:</span> {preview.father_name || '—'}</div>
              <div><span className="text-muted">Adm. no.:</span> {preview.admission_no}</div>
              <div><span className="text-muted">Roll no.:</span> {preview.roll_no}</div>
              <div><span className="text-muted">Class:</span> {className}{preview.section ? ` – ${preview.section}` : ''}</div>
            </div>
            {showPhoto && (
              preview.photo_path
                ? <img src={preview.photo_path} alt="" className="mb-4 h-24 w-20 rounded border border-border object-cover" />
                : <div className="mb-4 flex h-24 w-20 items-center justify-center rounded border border-border text-xs text-muted">Photo</div>
            )}
            <table className="w-full text-sm">
              <thead><tr className="border-y border-border text-left"><th className="py-2">Subject</th><th className="py-2 text-right">Marks</th><th className="py-2 text-right">Max</th></tr></thead>
              <tbody>
                {preview.subjects.map((s) => (
                  <tr key={s.subject} className="border-b border-border"><td className="py-2">{s.subject}</td>
                    <td className="py-2 text-right">{s.absent ? 'Absent' : s.marks}</td><td className="py-2 text-right">{s.max}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td className="py-2 font-bold">Total</td><td className="py-2 text-right font-bold">{preview.total}</td><td className="py-2 text-right">{preview.maxTotal}</td></tr></tfoot>
            </table>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
              <div><p className="text-muted">Percentage</p><p className="text-lg font-bold">{preview.percent}%</p></div>
              <div><p className="text-muted">Grade</p><p className="text-lg font-bold">{preview.grade}</p></div>
              <div><p className="text-muted">Result</p><p className="text-lg font-bold">{preview.pass ? 'Pass' : 'Fail'}</p></div>
            </div>
            {showRemarks && <p className="mt-4 text-sm"><span className="text-muted">Remarks:</span> ___________________________</p>}
            <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm text-muted">
              <div><div className="border-t border-border pt-1">Class Teacher</div></div>
              <div><div className="border-t border-border pt-1">Principal</div></div>
            </div>
          </div>
          <div className="no-print mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setPreview(null)}>{t('modules.exams.backToList')}</Button>
            <Button onClick={() => window.print()}>{t('modules.exams.printCard')}</Button>
          </div>
        </Card>
        <ReportCardPrint card={cardData(preview)} />
      </>
      )}
    </div>
  );
}

export function ExamsScreen() {
  const [tab, setTab] = React.useState('exams');
  // Class-first workflow: pick the class once at the top; every tab
  // (datesheet, marks, results, report cards) works on this class.
  const [className, setClassName] = React.useState('');
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const { exams, examId, setExamId, sessions, reload } = useExams();

  React.useEffect(() => {
    invoke('masters:list', { kind: 'class' }).then((c) => {
      setClasses(c);
      setClassName((prev) => prev || c[0]?.name || '');
    }).catch(() => {});
  }, []);

  const classExams = React.useMemo(
    () => (className ? exams.filter((e) => e.classes.includes(className)) : exams),
    [exams, className],
  );

  // Keep the selected exam valid for the chosen class.
  React.useEffect(() => {
    if (!exams.length) return;
    if (!classExams.some((e) => String(e.id) === examId)) {
      setExamId(classExams.length ? String(classExams[0].id) : '');
    }
  }, [className, exams, examId, classExams, setExamId]);

  const goNewExam = () => { setTab('exams'); setCreateOpen(true); };
  const tabProps: ExamTabProps = {
    className, exams: classExams, examId, setExamId, sessions, reload,
    createOpen, setCreateOpen, onNewExam: goNewExam,
  };

  return (
    <div>
      <PageHeader title={t('nav.exams')} />
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>{t('modules.exams.class')}</Label>
            <Select
              value={className} onValueChange={setClassName} placeholder="Select class"
              options={classes.map((c) => ({ value: c.name, label: c.name }))} className="w-44"
            />
          </div>
          <p className="pb-2 text-sm text-muted">
            Select a class first — datesheet, marks, results and report cards all work on this class.
          </p>
        </div>
      </Card>
      <Tabs
        tabs={[
          { value: 'exams', label: t('modules.exams.exams'), content: <ExamsTab {...tabProps} /> },
          { value: 'datesheet', label: t('modules.exams.datesheet'), content: <DatesheetTab {...tabProps} /> },
          { value: 'marks', label: t('modules.exams.marks'), content: <MarksTab {...tabProps} /> },
          { value: 'results', label: t('modules.exams.results'), content: <ResultsTab {...tabProps} /> },
          { value: 'reportcards', label: t('modules.exams.reportCards'), content: <ReportCardsTab {...tabProps} /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
      <TabFooter>
        <strong>Exams:</strong> Select a class above, create an exam for it, add its subjects with max marks,
        then enter marks per student. The datesheet sets the exam timetable; report cards are generated
        from entered marks and can be printed.
      </TabFooter>
    </div>
  );
}
