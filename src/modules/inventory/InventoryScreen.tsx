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
import { downloadExcel } from '../../lib/exportExcel';
import { PageHeader, EmptyState, Alert, StatCard } from '../../components/ui/feedback';
import { Tabs } from '../../components/ui/primitives';
import type { ItemRow, AssetRow } from '@shared/types';

const today = () => new Date().toISOString().slice(0, 10);

function ItemsTab() {
  const [rows, setRows] = React.useState<ItemRow[]>([]);
  const [low, setLow] = React.useState<ItemRow[]>([]);
  const [valuation, setValuation] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Partial<ItemRow>>({});

  const load = React.useCallback(async () => {
    setRows(await invoke('items:list', undefined));
    setLow(await invoke('inventory:lowStock', undefined));
    setValuation((await invoke('inventory:valuation', undefined)).total);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await invoke('items:save', form);
    if (r.ok) { setOpen(false); setForm({}); void load(); }
  };

  const exportExcel = () => {
    downloadExcel(`inventory-stock-${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Stock',
      rows: rows.map((r) => ({
        'Item': r.name, 'Category': r.category, 'Unit': r.unit,
        'Current Stock': r.current_stock, 'Reorder Level': r.reorder_level,
        'Purchase Rate': r.purchase_rate, 'Stock Value': Math.round(r.current_stock * r.purchase_rate * 100) / 100,
        'Barcode': r.barcode,
      })),
    }]);
  };

  const columns: Column<ItemRow>[] = [
    {
      key: 'name', header: t('modules.inventory.item'),
      render: (r) => <span className="font-medium">{r.name}{r.current_stock <= r.reorder_level && <Badge tone="warning" className="ml-2">low</Badge>}</span>,
    },
    { key: 'category', header: t('modules.inventory.category') },
    { key: 'unit', header: t('modules.inventory.unit') },
    { key: 'current_stock', header: t('modules.inventory.stock'), render: (r) => String(r.current_stock) },
    { key: 'reorder_level', header: t('modules.inventory.reorderAt') },
    { key: 'purchase_rate', header: t('modules.inventory.rate'), render: (r) => `₹${r.purchase_rate.toFixed(2)}` },
    { key: 'edit', header: '', render: (r) => <Button variant="secondary" onClick={() => { setForm(r); setOpen(true); }}>Edit</Button> },
  ];

  return (
    <div>
      {low.length > 0 && (
        <Alert tone="warning" title={`${low.length} item(s) at or below reorder level`} className="mb-4">
          {low.map((i) => i.name).join(', ')}
        </Alert>
      )}
      <div className="mb-3 flex items-end gap-2">
        <StatCard label={t('modules.inventory.stockValuation')} value={`₹${valuation.toFixed(2)}`} />
        <div className="ml-auto flex items-end gap-2">
          <Button variant="secondary" className="no-print" onClick={exportExcel} disabled={rows.length === 0}>{t('common.excel')}</Button>
          <Button onClick={() => { setForm({}); setOpen(true); }}>+ Add item</Button>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} empty={<EmptyState title="No items yet" />} />
      <Dialog open={open} onOpenChange={setOpen} title={form.id ? 'Edit item' : 'Add item'}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>{t('modules.inventory.category')}</Label><Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div><Label>{t('modules.inventory.unit')}</Label><Input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs" /></div>
          <div><Label>Purchase rate (₹)</Label><Input type="number" value={form.purchase_rate ?? 0} onChange={(e) => setForm({ ...form, purchase_rate: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label>{t('modules.inventory.reorderAt')}</Label><Input type="number" value={form.reorder_level ?? 0} onChange={(e) => setForm({ ...form, reorder_level: parseFloat(e.target.value) || 0 })} /></div>
          <div className="col-span-2"><Label>Barcode (optional)</Label><Input value={form.barcode ?? ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.inventory.cancel')}</Button>
          <Button onClick={() => void save()}>{t('modules.inventory.save')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function PurchaseTab() {
  const [items, setItems] = React.useState<ItemRow[]>([]);
  const [form, setForm] = React.useState({ bill_no: '', bill_date: today(), vendor: '' });
  const [lines, setLines] = React.useState<{ item_id: string; qty: string; rate: string; tax: string }[]>([]);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => { invoke('items:list', undefined).then(setItems).catch(() => {}); }, []);

  const addLine = () => setLines([...lines, { item_id: items[0] ? String(items[0].id) : '', qty: '1', rate: '', tax: '0' }]);
  const total = lines.reduce((a, l) => a + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0) + (parseFloat(l.tax) || 0), 0);

  const save = async () => {
    setMsg('');
    const r = await invoke('inventory:purchase', {
      bill_no: form.bill_no, bill_date: form.bill_date, vendor: form.vendor,
      lines: lines.map((l) => ({ item_id: Number(l.item_id), qty: parseFloat(l.qty) || 0, rate: parseFloat(l.rate) || 0, tax: parseFloat(l.tax) || 0 })),
    });
    if (!r.ok) { setMsg(r.error); return; }
    setMsg(`Purchase recorded. Stock updated.`);
    setLines([]); setForm({ bill_no: '', bill_date: today(), vendor: '' });
  };

  return (
    <Card className="p-6">
      {msg && <Alert tone="brand" title="" className="mb-4">{msg}</Alert>}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div><Label>{t('modules.inventory.billNo')}</Label><Input value={form.bill_no} onChange={(e) => setForm({ ...form, bill_no: e.target.value })} /></div>
        <div><Label>{t('modules.inventory.billDate')}</Label><Input type="date" value={form.bill_date} onChange={(e) => setForm({ ...form, bill_date: e.target.value })} /></div>
        <div><Label>{t('modules.inventory.vendor')}</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-medium">Items</h4>
        <Button variant="secondary" onClick={addLine}>{t('modules.inventory.addLine')}</Button>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="mb-2 grid grid-cols-[1fr_90px_110px_90px_40px] gap-2">
          <Select value={l.item_id} onValueChange={(v) => setLines(lines.map((x, j) => j === i ? { ...x, item_id: v } : x))}
            options={items.map((it) => ({ value: String(it.id), label: it.name }))} placeholder="Item" />
          <Input type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
          <Input type="number" placeholder="Rate ₹" value={l.rate} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
          <Input type="number" placeholder="Tax ₹" value={l.tax} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, tax: e.target.value } : x))} />
          <button className="cursor-pointer text-danger" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
        </div>
      ))}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-lg font-bold">Total: ₹{total.toFixed(2)}</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>{t('modules.inventory.printGrn')}</Button>
          <Button onClick={() => void save()} disabled={!lines.length}>{t('modules.inventory.recordPurchase')}</Button>
        </div>
      </div>
    </Card>
  );
}

function IssueTab() {
  const [items, setItems] = React.useState<ItemRow[]>([]);
  const [form, setForm] = React.useState({ date: today(), item_id: '', qty: '', issued_to: '', purpose: '' });
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => { invoke('items:list', undefined).then(setItems).catch(() => {}); }, []);

  const save = async () => {
    setMsg('');
    const r = await invoke('inventory:issue', {
      date: form.date, item_id: Number(form.item_id), qty: parseFloat(form.qty) || 0,
      issued_to: form.issued_to, purpose: form.purpose,
    });
    if (!r.ok) { setMsg(r.error); return; }
    setMsg('Issue recorded. Stock updated.');
    setForm({ date: today(), item_id: '', qty: '', issued_to: '', purpose: '' });
  };

  return (
    <Card className="max-w-xl p-6">
      {msg && <Alert tone={msg.includes('updated') ? 'success' : 'danger'} title="" className="mb-4">{msg}</Alert>}
      <div className="grid gap-3">
        <div><Label>{t('modules.inventory.item')}</Label>
          <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })} placeholder="Select item"
            options={items.map((it) => ({ value: String(it.id), label: `${it.name} (stock ${it.current_stock})` }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Quantity</Label><Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
          <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <div><Label>{t('modules.inventory.issuedTo')}</Label><Input value={form.issued_to} onChange={(e) => setForm({ ...form, issued_to: e.target.value })} placeholder="Student/staff/department" /></div>
        <div><Label>{t('modules.inventory.purpose')}</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>{t('modules.inventory.printSlip')}</Button>
        <Button onClick={() => void save()}>{t('modules.inventory.recordIssue')}</Button>
      </div>
    </Card>
  );
}

function AssetsTab() {
  const [rows, setRows] = React.useState<AssetRow[]>([]);
  const [expiring, setExpiring] = React.useState<AssetRow[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Partial<AssetRow>>({});

  const load = React.useCallback(async () => {
    setRows(await invoke('assets:list', undefined));
    setExpiring(await invoke('assets:warrantyExpiring', { days: 60 }));
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await invoke('assets:save', form);
    if (r.ok) { setOpen(false); setForm({}); void load(); }
  };

  return (
    <div>
      {expiring.length > 0 && (
        <Alert tone="warning" title="Warranty expiring within 60 days" className="mb-4">
          {expiring.map((a) => `${a.name} (${a.warranty_expiry})`).join(', ')}
        </Alert>
      )}
      <div className="mb-3 flex justify-end"><Button onClick={() => { setForm({}); setOpen(true); }}>{t('modules.inventory.addAsset')}</Button></div>
      <DataTable
        columns={[
          { key: 'name', header: t('modules.inventory.asset') },
          { key: 'category', header: t('modules.inventory.category') },
          { key: 'purchase_date', header: t('modules.inventory.purchased') },
          { key: 'cost', header: t('modules.inventory.cost'), render: (r) => `₹${r.cost.toFixed(2)}` },
          { key: 'location', header: t('modules.inventory.location') },
          { key: 'custodian', header: t('modules.inventory.custodian') },
          { key: 'condition', header: t('modules.inventory.condition') },
          { key: 'warranty_expiry', header: t('modules.inventory.warranty') },
        ]}
        rows={rows}
        empty={<EmptyState title="No assets yet" />}
      />
      <Dialog open={open} onOpenChange={setOpen} title={t('modules.inventory.newAsset')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>{t('modules.inventory.category')}</Label><Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div><Label>Purchase date</Label><Input type="date" value={form.purchase_date ?? ''} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
          <div><Label>Cost (₹)</Label><Input type="number" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label>{t('modules.inventory.warranty')}</Label><Input type="date" value={form.warranty_expiry ?? ''} onChange={(e) => setForm({ ...form, warranty_expiry: e.target.value })} /></div>
          <div><Label>{t('modules.inventory.location')}</Label><Input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div><Label>{t('modules.inventory.custodian')}</Label><Input value={form.custodian ?? ''} onChange={(e) => setForm({ ...form, custodian: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('modules.inventory.cancel')}</Button>
          <Button onClick={() => void save()}>{t('modules.inventory.save')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function InventoryScreen() {
  const [tab, setTab] = React.useState('items');
  return (
    <div>
      <PageHeader title={t('nav.inventory')} />
      <Tabs
        tabs={[
          { value: 'items', label: t('modules.inventory.items'), content: <ItemsTab /> },
          { value: 'purchase', label: t('modules.inventory.purchase'), content: <PurchaseTab /> },
          { value: 'issue', label: t('modules.inventory.issue'), content: <IssueTab /> },
          { value: 'assets', label: t('modules.inventory.assets'), content: <AssetsTab /> },
        ]}
        value={tab}
        onValueChange={setTab}
      />
    </div>
  );
}
