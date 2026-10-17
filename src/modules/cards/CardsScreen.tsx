import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Dialog } from '../../components/ui/dialog';
import { DataTable } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert } from '../../components/ui/feedback';
import { GatepassPrint } from '../../components/print/documents';
import { IdCardsSheetPrint, AdmitCardsSheetPrint } from '../../components/print/documents';
import { useInstitution } from '../../components/print/Letterhead';
import { Tabs } from '../../components/ui/primitives';
import type { MasterItem, CardTemplate, ExamRow, StudentRow } from '@shared/types';

/** ID cards tab — bulk per class, CR80 layout, QR of admission no. (FR-CRD-01). */
function IdCardsTab() {
  const inst = useInstitution();
  const [classes, setClasses] = React.useState<MasterItem[]>([]);
  const [className, setClassName] = React.useState('');
  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [templates, setTemplates] = React.useState<CardTemplate[]>([]);

  React.useEffect(() => {
    invoke('masters:list', { kind: 'class' }).then((c) => {
      setClasses(c);
      if (c.length) setClassName((p) => p || c[0].name);
    }).catch(() => {});
    invoke('cards:templates:list', { kind: 'id-student' }).then(setTemplates).catch(() => {});
  }, []);

  const load = async () => {
    if (!className) return;
    const r = await invoke('students:list', { class_name: className, limit: 500 });
    setStudents(r.rows);
  };

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-end gap-2">
        <div><Label>{t('modules.exams.class')}</Label>
          <Select value={className} onValueChange={setClassName} placeholder="Class"
            options={classes.map((c) => ({ value: c.name, label: c.name }))} className="w-36" />
        </div>
        <Button onClick={() => void load()}>{t('modules.cards.loadStudents')}</Button>
        <Button variant="secondary" className="no-print" onClick={() => window.print()} disabled={students.length === 0}>{t('modules.cards.printAll')}</Button>
        {templates[0] && <span className="text-xs text-muted">Template: {templates[0].name} v{templates[0].version}</span>}
      </div>
      {students.length === 0 ? <EmptyState title={t('modules.cards.loadHint')} /> : (
        <div className="print-area grid grid-cols-2 gap-4 md:grid-cols-3">
          {students.map((s) => (
            <div key={s.id} className="break-inside-avoid rounded-xl border-2 border-brand p-4">
              <div className="flex h-full gap-3">
                {s.photo_path
                  ? <img src={s.photo_path} alt="" className="h-16 w-14 shrink-0 rounded object-cover" />
                  : <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded bg-surface-2 text-xs text-muted">Photo</div>}
                <div className="min-w-0 text-xs">
                  <p className="truncate text-sm font-bold">{s.name}</p>
                  <p className="text-muted">Class {s.class_name}-{s.section} · Roll {s.roll_no}</p>
                  <p>Adm: {s.admission_no}</p>
                  <p>Father: {s.father_name || '—'}</p>
                  <p>Phone: {s.father_phone || s.mother_phone || '—'}</p>
                  <p className="truncate">Addr: {s.address || '—'}</p>
                  <p className="mt-1 font-mono text-[10px]">QR:{s.admission_no}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {students.length > 0 && (
        <IdCardsSheetPrint
          schoolName={inst?.name}
          cards={students.map((st) => ({
            name: st.name,
            admission_no: st.admission_no,
            class_name: `${st.class_name}${st.section ? `-${st.section}` : ''}`,
            roll_no: st.roll_no || '',
            father_name: st.father_name || '',
            parent_phone: st.father_phone || st.mother_phone || '',
            address: st.address || '',
            photo: st.photo_path,
          }))}
        />
      )}
    </div>
  );
}

/** Admit cards tab — bulk with exam schedule extract (FR-EXM-08). */
function AdmitCardsTab() {
  const inst = useInstitution();
  const [exams, setExams] = React.useState<ExamRow[]>([]);
  const [examId, setExamId] = React.useState('');
  const [className, setClassName] = React.useState('');
  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [schedule, setSchedule] = React.useState<{ subject: string; date: string; start_time: string }[]>([]);

  React.useEffect(() => {
    invoke('exams:list', {}).then((e) => {
      setExams(e);
      if (e.length) setExamId((p) => p || String(e[0].id));
    }).catch(() => {});
  }, []);

  const exam = exams.find((e) => String(e.id) === examId);
  React.useEffect(() => {
    if (exam?.classes.length && !className) setClassName(exam.classes[0]);
  }, [exam, className]);

  const load = async () => {
    if (!examId || !className) return;
    const [st, ds] = await Promise.all([
      invoke('students:list', { class_name: className, limit: 500 }),
      invoke('exams:datesheet:list', { examId: Number(examId) }),
    ]);
    setStudents(st.rows);
    setSchedule(ds.filter((d) => d.class_name === className).map((d) => ({ subject: d.subject, date: d.date, start_time: d.start_time })));
  };

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-end gap-2">
        <div><Label>{t('modules.exams.exams')}</Label>
          <Select value={examId} onValueChange={setExamId} placeholder="Exam"
            options={exams.map((e) => ({ value: String(e.id), label: e.name }))} className="w-56" />
        </div>
        <div><Label>{t('modules.exams.class')}</Label>
          <Select value={className} onValueChange={setClassName} placeholder="Class"
            options={(exam?.classes ?? []).map((c) => ({ value: c, label: c }))} className="w-36" />
        </div>
        <Button onClick={() => void load()}>{t('modules.cards.generate')}</Button>
        <Button variant="secondary" className="no-print" onClick={() => window.print()} disabled={students.length === 0}>{t('modules.cards.printAll')}</Button>
      </div>
      {students.length === 0 ? <EmptyState title={t('modules.cards.generateHint')} /> : (
        <div className="print-area grid gap-4 md:grid-cols-2">
          {students.map((s) => (
            <div key={s.id} className="break-inside-avoid rounded-xl border border-border p-5">
              <h3 className="text-center text-lg font-bold">ADMIT CARD</h3>
              <p className="mb-3 text-center text-sm text-muted">{exam?.name}</p>
              <div className="flex gap-4">
                {s.photo_path
                  ? <img src={s.photo_path} alt="" className="h-20 w-16 shrink-0 rounded object-cover" />
                  : <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded bg-surface-2 text-xs text-muted">Photo</div>}
                <div className="text-sm">
                  <p><strong>{s.name}</strong></p>
                  <p className="text-muted">Adm: {s.admission_no} · Roll: {s.roll_no}</p>
                  <p className="text-muted">Class: {s.class_name}-{s.section}</p>
                </div>
              </div>
              <table className="mt-3 w-full text-xs">
                <thead><tr className="border-b border-border text-left text-muted"><th className="py-1">Date</th><th className="py-1">Subject</th><th className="py-1">Time</th></tr></thead>
                <tbody>{schedule.map((d, i) => (
                  <tr key={i} className="border-b border-border"><td className="py-1">{d.date}</td><td className="py-1">{d.subject}</td><td className="py-1">{d.start_time}</td></tr>
                ))}</tbody>
              </table>
              <div className="mt-4 grid grid-cols-2 gap-4 text-center text-xs text-muted">
                <div className="border-t border-border pt-1">Seal</div>
                <div className="border-t border-border pt-1">Invigilator signature</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {students.length > 0 && (
        <AdmitCardsSheetPrint
          schoolName={inst?.name}
          examName={exam?.name ?? ''}
          cards={students.map((s) => ({
            name: s.name,
            admission_no: s.admission_no,
            roll_no: s.roll_no || '',
            class_name: `${s.class_name}${s.section ? `-${s.section}` : ''}`,
            photo: s.photo_path,
            schedule,
          }))}
        />
      )}
    </div>
  );
}

/** Gatepass tab — quick single form + register (FR-CRD-02). */
function GatepassTab() {
  const [rows, setRows] = React.useState<{ id: number; gatepass_no: string; student_name: string; class_name: string; reason: string; out_time: string }[]>([]);
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [matches, setMatches] = React.useState<StudentRow[]>([]);
  const [student, setStudent] = React.useState<StudentRow | null>(null);
  const [form, setForm] = React.useState({ reason: '', valid_until: '', authorized_by: '', receiver_name: '' });
  const [created, setCreated] = React.useState<{ gatepass_no: string; student: StudentRow } | null>(null);
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    setRows(await invoke('gatepass:list', undefined));
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const search = async () => {
    const r = await invoke('students:list', { q, limit: 8 });
    setMatches(r.rows);
  };

  const create = async () => {
    setMsg('');
    if (!student) { setMsg('Select a student.'); return; }
    const r = await invoke('gatepass:create', { student_id: student.id, ...form });
    if (!r.ok) { setMsg(r.error); return; }
    setCreated({ gatepass_no: r.gatepass_no, student });
    void load();
  };

  return (
    <div>
      {msg && <Alert tone="danger" title="Error" className="mb-4">{msg}</Alert>}
      <div className="mb-4"><Button onClick={() => { setOpen(true); setCreated(null); setStudent(null); }}>{t('modules.cards.newGatepass')}</Button></div>
      <DataTable
        columns={[
          { key: 'gatepass_no', header: 'Gatepass no.' },
          { key: 'student_name', header: 'Student' },
          { key: 'class_name', header: 'Class' },
          { key: 'reason', header: 'Reason' },
          { key: 'out_time', header: 'Out time' },
        ]}
        rows={rows}
        empty={<EmptyState title={t('modules.cards.noGatepasses')} />}
      />
      <Dialog open={open} onOpenChange={setOpen} title={t('modules.cards.gatepassTitle')}>
        {!created ? (
          <>
            <Label>{t('modules.cards.findStudent')}</Label>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('modules.cards.searchPh')} onKeyDown={(e) => e.key === 'Enter' && void search()} />
              <Button variant="secondary" onClick={() => void search()}>{t('modules.fees.search')}</Button>
            </div>
            {matches.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {matches.map((m) => (
                  <li key={m.id}><button className="w-full cursor-pointer px-3 py-2 text-left hover:bg-surface-2"
                    onClick={() => { setStudent(m); setMatches([]); }}>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-muted">{m.admission_no} · {m.class_name}</div>
                  </button></li>
                ))}
              </ul>
            )}
            {student && <p className="mt-2 text-sm"><strong>{student.name}</strong> selected</p>}
            <div className="mt-3 grid gap-3">
              <div><Label>{t('modules.cards.reason')}</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('modules.cards.validUntil')}</Label><Input type="datetime-local" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
                <div><Label>{t('modules.cards.authorizedBy')}</Label><Input value={form.authorized_by} onChange={(e) => setForm({ ...form, authorized_by: e.target.value })} /></div>
              </div>
              <div><Label>{t('modules.cards.receiver')}</Label><Input value={form.receiver_name} onChange={(e) => setForm({ ...form, receiver_name: e.target.value })} placeholder={t('modules.cards.receiverPh')} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.cards.cancel')}</Button>
              <Button onClick={() => void create()}>{t('modules.cards.issue')}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="print-area rounded-xl border-2 border-brand p-6 text-center">
              <h3 className="text-xl font-bold">GATE PASS</h3>
              <p className="text-muted">{created.gatepass_no}</p>
              <div className="mt-4 text-left text-sm">
                <p><span className="text-muted">Student:</span> <strong>{created.student.name}</strong> ({created.student.admission_no})</p>
                <p><span className="text-muted">Class:</span> {created.student.class_name}-{created.student.section}</p>
                <p><span className="text-muted">Reason:</span> {form.reason}</p>
                <p><span className="text-muted">Authorized by:</span> {form.authorized_by}</p>
                <p><span className="text-muted">Receiver:</span> {form.receiver_name} ___________________ (sign)</p>
              </div>
            </div>
            <div className="no-print mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.cards.close')}</Button>
              <Button onClick={() => window.print()}>{t('modules.cards.printPass')}</Button>
            </div>
          </>
        )}
      </Dialog>
      {created && (
        <GatepassPrint pass={{
          gatepass_no: created.gatepass_no, date: new Date().toISOString().slice(0, 10),
          student_name: created.student.name,
          class_name: `${created.student.class_name}${created.student.section ? `-${created.student.section}` : ''}`,
          reason: form.reason, valid_until: form.valid_until || '',
          authorized_by: form.authorized_by || '', receiver_name: form.receiver_name || '',
        }} />
      )}
    </div>
  );
}

export function CardsScreen() {
  const [tab, setTab] = React.useState('id');
  return (
    <div>
      <PageHeader title={t('nav.cards')} />
      <Tabs
        tabs={[
          { value: 'id', label: t('modules.cards.idCards'), content: <IdCardsTab /> },
          { value: 'admit', label: t('modules.cards.admitCards'), content: <AdmitCardsTab /> },
          { value: 'gatepass', label: t('modules.cards.gatepass'), content: <GatepassTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
    </div>
  );
}
