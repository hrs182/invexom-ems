import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Dialog } from '../../components/ui/dialog';
import { DataTable } from '../../components/ui/data-table';
import { PageHeader, EmptyState, Alert } from '../../components/ui/feedback';
import type { CardTemplate } from '@shared/types';

/**
 * Template studio (FR-SET-04): field-picker designer for all print documents.
 * Templates are versioned; reprints use the version active at issue time (FR-CRD-03).
 */
const KINDS = [
  { value: 'receipt', label: 'Fee receipt', fields: ['logo', 'header', 'studentInfo', 'linesTable', 'amountInWords', 'mode', 'qr', 'signatures', 'footer'] },
  { value: 'report-card', label: 'Report card', fields: ['logo', 'photo', 'studentInfo', 'marksTable', 'grades', 'attendance', 'remarks', 'signatures'] },
  { value: 'id-student', label: 'ID card (student)', fields: ['photo', 'name', 'class', 'dob', 'bloodGroup', 'address', 'qr'] },
  { value: 'id-staff', label: 'ID card (staff)', fields: ['photo', 'name', 'designation', 'dob', 'bloodGroup', 'qr'] },
  { value: 'admit-card', label: 'Admit card', fields: ['photo', 'studentInfo', 'schedule', 'sealBox', 'signatures'] },
  { value: 'gatepass', label: 'Gatepass', fields: ['studentInfo', 'reason', 'validity', 'authorizedBy', 'receiverSign'] },
  { value: 'salary-slip', label: 'Salary slip', fields: ['logo', 'header', 'staffInfo', 'earningsTable', 'deductionsTable', 'netPay', 'signatures'] },
  { value: 'tc', label: 'Transfer certificate', fields: ['logo', 'header', 'studentInfo', 'reason', 'lastClass', 'duesClearance', 'signatures'] },
];

const FIELD_LABELS: Record<string, string> = {
  logo: 'Institution logo', header: 'Letterhead header', footer: 'Footer', photo: 'Photo',
  studentInfo: 'Student info block', staffInfo: 'Staff info block', linesTable: 'Fee lines table',
  amountInWords: 'Amount in words', mode: 'Payment mode', qr: 'QR code', signatures: 'Signature lines',
  marksTable: 'Marks table', grades: 'Grades', attendance: 'Attendance %', remarks: 'Remarks',
  name: 'Name', class: 'Class', dob: 'Date of birth', bloodGroup: 'Blood group', address: 'Address',
  designation: 'Designation', schedule: 'Exam schedule', sealBox: 'Seal box',
  reason: 'Reason', validity: 'Validity period', authorizedBy: 'Authorized by', receiverSign: 'Receiver signature',
  earningsTable: 'Earnings table', deductionsTable: 'Deductions table', netPay: 'Net pay',
  lastClass: 'Last class attended', duesClearance: 'Dues clearance line',
};

export function TemplateStudioScreen() {
  const [kind, setKind] = React.useState('receipt');
  const [templates, setTemplates] = React.useState<CardTemplate[]>([]);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({});
  const [makeDefault, setMakeDefault] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const kindDef = KINDS.find((k) => k.value === kind)!;

  const load = React.useCallback(async () => {
    setTemplates(await invoke('cards:templates:list', { kind }));
  }, [kind]);
  React.useEffect(() => { void load(); }, [load]);

  const openNew = () => {
    setName('');
    setEnabled(Object.fromEntries(kindDef.fields.map((f) => [f, true])));
    setMakeDefault(templates.length === 0);
    setOpen(true);
  };

  const openEdit = (tpl: CardTemplate) => {
    setName(tpl.name);
    const cfg = tpl.config as Record<string, boolean>;
    setEnabled(Object.fromEntries(kindDef.fields.map((f) => [f, cfg[f] !== false])));
    setMakeDefault(!!tpl.is_default);
    setOpen(true);
  };

  const save = async () => {
    setMsg('');
    if (!name.trim()) { setMsg('Template name is required.'); return; }
    const r = await invoke('cards:templates:save', { kind, name: name.trim(), className: '', config: enabled, makeDefault });
    if (!r.ok) { setMsg(r.error); return; }
    setOpen(false);
    setMsg(`Saved “${name}” (new version).`);
    void load();
  };

  return (
    <div>
      <PageHeader
        title={t('modules.templates.title')}
        subtitle={t('modules.templates.subtitle')}
        actions={<Button onClick={openNew}>{t('modules.templates.newTemplate')}</Button>}
      />
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-4 flex items-end gap-2">
        <div><Label>{t('modules.templates.document')}</Label>
          <Select value={kind} onValueChange={setKind} placeholder="Document"
            options={KINDS.map((k) => ({ value: k.value, label: k.label }))} className="w-56" />
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'name', header: 'Template' },
          { key: 'version', header: 'Version', render: (r) => `v${r.version}` },
          { key: 'is_default', header: 'Default', render: (r) => r.is_default ? <Badge tone="brand">default</Badge> : null },
          { key: 'edit', header: '', render: (r) => <Button variant="secondary" onClick={() => openEdit(r)}>Edit</Button> },
        ]}
        rows={templates}
        empty={<EmptyState title={t('modules.templates.noTemplates')} actionLabel={t('modules.templates.newTemplate')} onAction={openNew} />}
      />

      <Dialog open={open} onOpenChange={setOpen} title={`${name ? 'Edit' : 'New'} template — ${kindDef.label}`} wide>
        {msg && <Alert tone="danger" title="Error" className="mb-4">{msg}</Alert>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-3"><Label>{t('modules.templates.templateName')}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classic" /></div>
            <Label>{t('modules.templates.fields')}</Label>
            <div className="grid gap-1.5">
              {kindDef.fields.map((f) => (
                <label key={f} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                  <input type="checkbox" checked={enabled[f] !== false}
                    onChange={(e) => setEnabled({ ...enabled, [f]: e.target.checked })} />
                  {FIELD_LABELS[f] ?? f}
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
              {t('modules.templates.setDefault', { n: kindDef.label })}
            </label>
          </div>
          <div>
            <Label>{t('modules.templates.preview')}</Label>
            <Card className="min-h-[300px] p-4">
              <div className="mb-2 text-center">
                {enabled.logo && <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded bg-surface-2 text-xs text-muted">Logo</div>}
                {enabled.header && <p className="text-sm font-bold">School Name · Address · Phone</p>}
              </div>
              {enabled.photo && <div className="mb-2 flex h-16 w-14 items-center justify-center rounded bg-surface-2 text-xs text-muted">Photo</div>}
              {(enabled.studentInfo || enabled.staffInfo) && (
                <div className="mb-2 text-xs text-muted">Name: ______ · Class: ______ · Adm no: ______</div>
              )}
              {(enabled.linesTable || enabled.marksTable || enabled.earningsTable) && (
                <table className="mb-2 w-full text-xs">
                  <thead><tr className="border-b border-border text-left text-muted"><th className="py-1">Item</th><th className="py-1 text-right">Amount</th></tr></thead>
                  <tbody><tr className="border-b border-border"><td className="py-1">Sample row</td><td className="py-1 text-right">₹1,000</td></tr></tbody>
                </table>
              )}
              {enabled.amountInWords && <p className="mb-2 text-xs italic text-muted">One Thousand Rupees Only</p>}
              {enabled.qr && <div className="mb-2 flex h-14 w-14 items-center justify-center border border-border text-[10px] text-muted">QR</div>}
              {enabled.remarks && <p className="mb-2 text-xs text-muted">Remarks: ___________</p>}
              {enabled.signatures && (
                <div className="mt-4 grid grid-cols-2 gap-4 text-center text-[11px] text-muted">
                  <div className="border-t border-border pt-1">Authorized</div>
                  <div className="border-t border-border pt-1">Receiver</div>
                </div>
              )}
              {enabled.footer && <p className="mt-2 text-center text-[11px] text-muted">Footer text</p>}
            </Card>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.templates.cancel')}</Button>
          <Button onClick={() => void save()}>{t('modules.templates.save')}</Button>
        </div>
      </Dialog>
    </div>
  );
}
