import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { ReportCardPrint } from '../../components/print/documents';
import { Dialog } from '../../components/ui/dialog';
import { DataTable, type Column } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert, StatCard } from '../../components/ui/feedback';
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
    if (list.length && !examId) setExamId(String(list[0].id));
  }, [examId]);
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

function ExamsTab() {
  const { exams, examId, setExamId, sessions, reload } = useExams();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', term: 'Term 1', classes: '' });
  const [lockMsg, setLockMsg] = React.useState('');
  const [subjects, setSubjects] = React.useState<ExamSubject[]>([]);
  const [subjRows, setSubjRows] = React.useState<{ subject: string; class_name: string; max_marks: number; pass_marks: number; weightage: number }[]>([]);
  const [masterSubjects, setMasterSubjects] = React.useState<MasterItem[]>([]);

  React.useEffect(() => {
    invoke('masters:list', { kind: 'subject' }).then(setMasterSubjects).catch(() => {});
  }, []);
  React.useEffect(() => {
    if (examId) invoke('exams:subjects:list', { examId: Number(examId) }).then(setSubjects).catch(() => {});
  }, [examId]);

  const create = async () => {
    const active = sessions.find((s) => s.isActive);
    const r = await invoke('exams:create', {
      name: form.name, term: form.term, sessionId: active?.id ?? null,
      classes: form.classes.split(',').map((c) => c.trim()).filter(Boolean),
    });
    if (r.ok) { setOpen(false); setForm({ name: '', term: 'Term 1', classes: '' }); void reload(); }
  };

  const exam = exams.find((e) => String(e.id) === examId);
  const addSubjRow = () => setSubjRows([...subjRows, { subject: masterSubjects[0]?.name ?? '', class_name: exam?.classes[0] ?? '', max_marks: 100, pass_marks: 33, weightage: 100 }]);
  const saveSubjects = async () => {
    if (!examId) return;
    const r = await invoke('exams:subjects:save', { examId: Number(examId), subjects: subjRows });
    if (r.ok) { setSubjRows([]); setSubjects(await invoke('exams:subjects:list', { examId: Number(examId) })); }
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
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={() => setOpen(true)} />
        {exam?.is_locked
          ? <Badge tone="warning">{t('modules.exams.locked')}</Badge>
          : <div className="flex gap-2"><Button variant="secondary" onClick={() => void lock()}>{t('modules.exams.lock')}</Button></div>}
        {!!exam?.is_locked && <Button variant="secondary" onClick={() => void unlock()}>{t('modules.exams.unlock')}</Button>}
      </div>
      <h3 className="mb-2 font-semibold">{t('modules.exams.subjectsTitle')}</h3>
      <DataTable
        columns={[
          { key: 'subject', header: t('modules.exams.subject') },
          { key: 'class_name', header: t('modules.exams.class') },
          { key: 'max_marks', header: t('modules.exams.maxMarks') },
          { key: 'pass_marks', header: t('modules.exams.passMarks') },
          { key: 'weightage', header: t('modules.exams.weightage') },
        ]}
        rows={subjects}
        empty={<EmptyState title={t('modules.exams.noSubjects')} />}
      />
      <Card className="mt-3 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-medium">{t('modules.exams.editSubjects')}</h4>
          <Button variant="secondary" onClick={addSubjRow}>{t('modules.exams.addRow')}</Button>
        </div>
        {subjRows.map((r, i) => (
          <div key={i} className="mb-2 grid grid-cols-5 gap-2">
            <Input placeholder="Subject" value={r.subject} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} />
            <Input placeholder="Class" value={r.class_name} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, class_name: e.target.value } : x))} />
            <Input type="number" placeholder="Max" value={r.max_marks} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, max_marks: parseFloat(e.target.value) || 0 } : x))} />
            <Input type="number" placeholder="Pass" value={r.pass_marks} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, pass_marks: parseFloat(e.target.value) || 0 } : x))} />
            <Input type="number" placeholder="Wt%" value={r.weightage} onChange={(e) => setSubjRows(subjRows.map((x, j) => j === i ? { ...x, weightage: parseFloat(e.target.value) || 0 } : x))} />
          </div>
        ))}
        {subjRows.length > 0 && <Button onClick={() => void saveSubjects()}>{t('modules.exams.saveSubjects')}</Button>}
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title={t('modules.exams.newExam')}>
        <div className="grid gap-3">
          <div><Label>{t('modules.exams.examName')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Half-Yearly Exam" /></div>
          <div><Label>{t('modules.exams.term')}</Label><Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></div>
          <div><Label>{t('modules.exams.classes')}</Label><Input value={form.classes} onChange={(e) => setForm({ ...form, classes: e.target.value })} placeholder="e.g. V, VI" /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.exams.cancel')}</Button>
          <Button onClick={() => void create()}>{t('modules.exams.create')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function DatesheetTab() {
  const { exams, examId, setExamId, reload } = useExams();
  void reload;
  const [rows, setRows] = React.useState<DatesheetRow[]>([]);
  const [draft, setDraft] = React.useState<Omit<DatesheetRow, 'id'>[]>([]);
  const [clashes, setClashes] = React.useState<string[]>([]);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    if (examId) invoke('exams:datesheet:list', { examId: Number(examId) }).then(setRows).catch(() => {});
  }, [examId]);

  const exam = exams.find((e) => String(e.id) === examId);
  const addRow = () => setDraft([...draft, { subject: '', class_name: exam?.classes[0] ?? '', date: '', start_time: '09:00', end_time: '12:00', room: '' }]);
  const save = async () => {
    if (!examId) return;
    setClashes([]); setMsg('');
    const r = await invoke('exams:datesheet:save', { examId: Number(examId), rows: draft });
    if (!r.ok) { setMsg(r.error); return; }
    if (r.clashes.length) { setClashes(r.clashes); return; }
    setDraft([]); setMsg('Datesheet saved.');
    setRows(await invoke('exams:datesheet:list', { examId: Number(examId) }));
  };

  return (
    <div>
      <div className="mb-4"><ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={() => {}} /></div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      {clashes.length > 0 && (
        <Alert tone="danger" title="Clashes detected — fix before saving" className="mb-4">
          <ul className="list-disc pl-5 text-sm">{clashes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </Alert>
      )}
      <DataTable
        columns={[
          { key: 'date', header: t('modules.fees.date') },
          { key: 'subject', header: t('modules.exams.subject') },
          { key: 'class_name', header: t('modules.exams.class') },
          { key: 'start_time', header: 'Start', render: (r) => `${r.start_time}–${r.end_time}` },
          { key: 'room', header: t('modules.exams.room') },
        ]}
        rows={rows}
        empty={<EmptyState title={t('modules.exams.noDatesheet')} />}
      />
      <Card className="mt-3 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-medium">{t('modules.exams.buildDatesheet')}</h4>
          <div className="flex gap-2"><Button variant="secondary" onClick={addRow}>{t('modules.exams.addRow')}</Button>{draft.length > 0 && <Button onClick={() => void save()}>{t('modules.exams.saveDatesheet')}</Button>}</div>
        </div>
        {draft.map((r, i) => (
          <div key={i} className="mb-2 grid grid-cols-6 gap-2">
            <Input type="date" value={r.date} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
            <Input placeholder="Subject" value={r.subject} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} />
            <Input placeholder="Class" value={r.class_name} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, class_name: e.target.value } : x))} />
            <Input type="time" value={r.start_time} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))} />
            <Input type="time" value={r.end_time} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, end_time: e.target.value } : x))} />
            <Input placeholder="Room" value={r.room} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, room: e.target.value } : x))} />
          </div>
        ))}
      </Card>
      <div className="no-print mt-3"><Button variant="secondary" onClick={() => window.print()}>{t('modules.exams.printDatesheet')}</Button></div>
    </div>
  );
}

function MarksTab() {
  const { exams, examId, setExamId } = useExams();
  const [subjects, setSubjects] = React.useState<ExamSubject[]>([]);
  const [subject, setSubject] = React.useState('');
  const [className, setClassName] = React.useState('');
  const [roster, setRoster] = React.useState<{ id: number; name: string; roll_no: string }[]>([]);
  const [marks, setMarks] = React.useState<Record<number, { marks: string; absent: boolean }>>({});
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    if (examId) invoke('exams:subjects:list', { examId: Number(examId) }).then((s) => {
      setSubjects(s);
      if (s.length && !subject) { setSubject(s[0].subject); setClassName(s[0].class_name); }
    }).catch(() => {});
  }, [examId, subject]);

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
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={() => {}} />
        <div><Label>{t('modules.exams.subject')}</Label>
          <Select value={subject} onValueChange={(v) => {
            setSubject(v);
            const s = subjects.find((x) => x.subject === v);
            if (s) setClassName(s.class_name);
          }} placeholder="Subject" options={subjects.map((s) => ({ value: s.subject, label: `${s.subject} (${s.class_name})` }))} className="w-52" />
        </div>
        {exam?.is_locked && <Badge tone="warning">{t('modules.exams.lockedNote')}</Badge>}
        <Button className="ml-auto" onClick={() => void save()} disabled={!!exam?.is_locked}>{t('modules.exams.saveMarks')}</Button>
      </div>
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
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
    </div>
  );
}

function ResultsTab() {
  const { exams, examId, setExamId } = useExams();
  const [className, setClassName] = React.useState('');
  const [results, setResults] = React.useState<ResultRow[]>([]);
  const [analysis, setAnalysis] = React.useState<{ subjectStats: { subject: string; avg: number; highest: number; lowest: number; passPercent: number }[]; toppers: { name: string; percent: number }[]; failList: { name: string; subjects: string[] }[] } | null>(null);

  const exam = exams.find((e) => String(e.id) === examId);
  React.useEffect(() => {
    if (exam && !className && exam.classes.length) setClassName(exam.classes[0]);
  }, [exam, className]);

  const load = async () => {
    if (!examId || !className) return;
    setResults(await invoke('exams:results', { examId: Number(examId), className }));
    setAnalysis(await invoke('exams:analysis', { examId: Number(examId), className }));
  };

  const subjects = results[0]?.subjects.map((s) => s.subject) ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={() => {}} />
        <div><Label>{t('modules.exams.class')}</Label>
          <Select value={className} onValueChange={setClassName} placeholder="Class"
            options={(exam?.classes ?? []).map((c) => ({ value: c, label: c }))} className="w-36" />
        </div>
        <Button onClick={() => void load()}>{t('modules.exams.computeResults')}</Button>
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>{t('modules.exams.print')}</Button>
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
    </div>
  );
}

function ReportCardsTab() {
  const { exams, examId, setExamId } = useExams();
  const [className, setClassName] = React.useState('');
  const [results, setResults] = React.useState<ResultRow[]>([]);
  const [templates, setTemplates] = React.useState<CardTemplate[]>([]);
  const [templateId, setTemplateId] = React.useState('');
  const [preview, setPreview] = React.useState<ResultRow | null>(null);
  const [showPhoto, setShowPhoto] = React.useState(true);
  const [showRemarks, setShowRemarks] = React.useState(true);

  const exam = exams.find((e) => String(e.id) === examId);
  React.useEffect(() => {
    if (exam && !className && exam.classes.length) setClassName(exam.classes[0]);
    invoke('cards:templates:list', { kind: 'report-card' }).then((tpls) => {
      setTemplates(tpls);
      const def = tpls.find((x) => x.is_default);
      if (def) setTemplateId(String(def.id));
    }).catch(() => {});
  }, [exam, className]);

  const load = async () => {
    if (!examId || !className) return;
    setResults(await invoke('exams:results', { examId: Number(examId), className }));
  };

  const tpl = templates.find((x) => String(x.id) === templateId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ExamPicker examId={examId} setExamId={setExamId} exams={exams} onNew={() => {}} />
        <div><Label>{t('modules.exams.class')}</Label>
          <Select value={className} onValueChange={setClassName} placeholder="Class"
            options={(exam?.classes ?? []).map((c) => ({ value: c, label: c }))} className="w-36" />
        </div>
        <div><Label>{t('modules.exams.template')}</Label>
          <Select value={templateId} onValueChange={setTemplateId} placeholder="Template"
            options={templates.map((x) => ({ value: String(x.id), label: `${x.name} (v${x.version})` }))} className="w-52" />
        </div>
        <Button onClick={() => void load()}>{t('modules.exams.generate')}</Button>
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>{t('modules.exams.printAll')}</Button>
      </div>
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
              <div><span className="text-muted">Adm. no.:</span> {preview.admission_no}</div>
              <div><span className="text-muted">Roll no.:</span> {preview.roll_no}</div>
              <div><span className="text-muted">Rank:</span> {preview.rank}</div>
            </div>
            {showPhoto && <div className="mb-4 flex h-24 w-20 items-center justify-center rounded border border-border text-xs text-muted">Photo</div>}
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
        <ReportCardPrint card={{
          examName: exam?.name ?? '', className, name: preview.name,
          admission_no: preview.admission_no, roll_no: preview.roll_no ?? '',
          rank: preview.rank, subjects: preview.subjects,
          total: preview.total, maxTotal: preview.maxTotal,
          percent: preview.percent, grade: preview.grade, pass: preview.pass,
        }} />
      </>
      )}
    </div>
  );
}

export function ExamsScreen() {
  const [tab, setTab] = React.useState('exams');
  return (
    <div>
      <PageHeader title={t('nav.exams')} />
      <Tabs
        tabs={[
          { value: 'exams', label: t('modules.exams.exams'), content: <ExamsTab /> },
          { value: 'datesheet', label: t('modules.exams.datesheet'), content: <DatesheetTab /> },
          { value: 'marks', label: t('modules.exams.marks'), content: <MarksTab /> },
          { value: 'results', label: t('modules.exams.results'), content: <ResultsTab /> },
          { value: 'reportcards', label: t('modules.exams.reportCards'), content: <ReportCardsTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
    </div>
  );
}
