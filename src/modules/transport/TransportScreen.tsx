import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { PageHeader, EmptyState, StatCard } from '../../components/ui/feedback';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input, Field, Label } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Tabs } from '../../components/ui/primitives';
import { DataTable, type Column } from '../../components/ui/data-table';
import { Dialog } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';

const T = (k: string, v?: Record<string, string | number>) => t(`modules.transport.${k}` as never, v);

function VehiclesTab() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({});
  const load = async () => setRows(await invoke('transport:vehicles', undefined));
  React.useEffect(() => { void load(); }, []);
  const cols: Column<any>[] = React.useMemo(() => [
    { key: 'vehicle_no', header: T('vehicleNo'), render: (r) => <strong>{r.vehicle_no}</strong> },
    { key: 'type', header: T('type') },
    { key: 'capacity', header: T('capacity'), render: (r) => String(r.capacity) },
    { key: 'driver_name', header: T('driver'), render: (r) => r.driver_name ?? '—' },
    { key: 'driver_phone', header: T('phone'), render: (r) => r.driver_phone ?? '—' },
    { key: 'insurance_expiry', header: T('insurance'), render: (r) => r.insurance_expiry ?? '—' },
    { key: 'fitness_expiry', header: T('fitness'), render: (r) => r.fitness_expiry ?? '—' },
    { key: 'edit', header: '', render: (r) => <Button variant="secondary" onClick={() => { setForm(r); setOpen(true); }}>{T('edit')}</Button> },
  ], []);
  const save = async () => {
    if (!form.vehicle_no?.trim()) return;
    const r = await invoke('transport:saveVehicle', form);
    if (r.ok) { setOpen(false); setForm({}); void load(); }
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setForm({}); setOpen(true); }}>{T('addVehicle')}</Button>
      </div>
      {rows.length === 0 ? <EmptyState title={T('noVehicles')} /> : <DataTable columns={cols} rows={rows} empty={T('noVehicles')} />}
      <Dialog open={open} onOpenChange={setOpen} title={form.id ? T('edit') : T('addVehicle')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={T('vehicleNo')}><Input value={form.vehicle_no ?? ''} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} /></Field>
          <Field label={T('type')}>
            <Select value={form.type ?? 'bus'} onValueChange={(v: string) => setForm({ ...form, type: v })} options={[{ value: 'bus', label: 'Bus' }, { value: 'van', label: 'Van' }, { value: 'other', label: 'Other' }]} />
          </Field>
          <Field label={T('capacity')}><Input type="number" value={form.capacity ?? 0} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} /></Field>
          <Field label={T('driver')}><Input value={form.driver_name ?? ''} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></Field>
          <Field label={T('phone')}><Input value={form.driver_phone ?? ''} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} /></Field>
          <Field label={T('insurance')}><Input type="date" value={form.insurance_expiry ?? ''} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} /></Field>
          <Field label={T('fitness')}><Input type="date" value={form.fitness_expiry ?? ''} onChange={(e) => setForm({ ...form, fitness_expiry: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{T('cancel')}</Button>
          <Button onClick={() => void save()}>{T('save')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function RoutesTab() {
  const [routes, setRoutes] = React.useState<any[]>([]);
  const [vehicles, setVehicles] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({});
  const [stopRoute, setStopRoute] = React.useState<any>(null);
  const [stops, setStops] = React.useState<any[]>([]);
  const load = async () => {
    setRoutes(await invoke('transport:routes', undefined));
    setVehicles(await invoke('transport:vehicles', undefined));
  };
  React.useEffect(() => { void load(); }, []);
  const openStops = async (r: any) => {
    setStopRoute(r);
    setStops(await invoke('transport:stops', { routeId: r.id }));
  };
  const saveRoute = async () => {
    if (!form.name?.trim()) return;
    const r = await invoke('transport:saveRoute', form);
    if (r.ok) { setOpen(false); setForm({}); void load(); }
  };
  const saveStops = async () => {
    await invoke('transport:saveStops', { routeId: stopRoute.id, stops: stops.map((s, i) => ({ stop_name: s.stop_name, stop_order: i + 1, pickup_time: s.pickup_time || undefined })) });
    setStopRoute(null);
  };
  const cols: Column<any>[] = React.useMemo(() => [
    { key: 'name', header: T('routeName'), render: (r) => <strong>{r.name}</strong> },
    { key: 'vehicle_no', header: T('vehicle'), render: (r) => r.vehicle_no ?? '—' },
    { key: 'monthly_fee', header: T('monthlyFee'), render: (r) => `₹${Number(r.monthly_fee).toFixed(0)}` },
    {
      key: 'stops', header: '', render: (r) => (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void openStops(r)}>{T('routes')}</Button>
          <Button variant="secondary" onClick={() => { setForm(r); setOpen(true); }}>{T('edit')}</Button>
        </div>
      ),
    },
  ], []);
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setForm({}); setOpen(true); }}>{T('addRoute')}</Button>
      </div>
      {routes.length === 0 ? <EmptyState title={T('noRoutes')} /> : <DataTable columns={cols} rows={routes} empty={T('noRoutes')} />}
      <Dialog open={open} onOpenChange={setOpen} title={form.id ? T('edit') : T('addRoute')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={T('routeName')}><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={T('vehicle')}>
            <Select value={String(form.vehicle_id ?? '')} onValueChange={(v: string) => setForm({ ...form, vehicle_id: v ? parseInt(v) : null })}
              options={[{ value: '', label: '—' }, ...vehicles.map((v: any) => ({ value: String(v.id), label: v.vehicle_no }))]} />
          </Field>
          <Field label={T('monthlyFee')}><Input type="number" value={form.monthly_fee ?? 0} onChange={(e) => setForm({ ...form, monthly_fee: parseFloat(e.target.value) || 0 })} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{T('cancel')}</Button>
          <Button onClick={() => void saveRoute()}>{T('save')}</Button>
        </div>
      </Dialog>
      <Dialog open={!!stopRoute} onOpenChange={(o) => { if (!o) setStopRoute(null); }} title={T('stopsFor', { n: stopRoute?.name ?? '' })}>
        {stops.map((s, i) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_80px_130px_auto] items-end gap-2">
            <Field label={i === 0 ? T('stopName') : ''}><Input value={s.stop_name} onChange={(e) => setStops(stops.map((x, j) => j === i ? { ...x, stop_name: e.target.value } : x))} /></Field>
            <Field label={i === 0 ? T('order') : ''}><Input type="number" value={i + 1} disabled /></Field>
            <Field label={i === 0 ? T('pickup') : ''}><Input type="time" value={s.pickup_time ?? ''} onChange={(e) => setStops(stops.map((x, j) => j === i ? { ...x, pickup_time: e.target.value } : x))} /></Field>
            <Button variant="ghost" onClick={() => setStops(stops.filter((_, j) => j !== i))}>✕</Button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={() => setStops([...stops, { stop_name: '', stop_order: stops.length + 1, pickup_time: '' }])}>{T('addStop')}</Button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStopRoute(null)}>{T('cancel')}</Button>
          <Button onClick={() => void saveStops()}>{T('saveStops')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function AllocationsTab() {
  const [session, setSession] = React.useState(() => {
    const d = new Date(); const y = d.getFullYear();
    return d.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  });
  const [rows, setRows] = React.useState<any[]>([]);
  const [routes, setRoutes] = React.useState<any[]>([]);
  const [strength, setStrength] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({ studentId: '', routeId: '' });
  const [stops, setStops] = React.useState<any[]>([]);
  const load = async () => {
    setRows(await invoke('transport:allocations', { session }));
    setRoutes(await invoke('transport:routes', undefined));
    setStrength(await invoke('transport:strength', { session }));
  };
  React.useEffect(() => { void load(); }, [session]);
  React.useEffect(() => {
    if (form.routeId) invoke('transport:stops', { routeId: parseInt(form.routeId) }).then(setStops).catch(() => setStops([]));
    else setStops([]);
  }, [form.routeId]);
  const allocate = async () => {
    const sid = parseInt(form.studentId);
    const rid = parseInt(form.routeId);
    if (!sid || !rid) return;
    const r = await invoke('transport:allocate', { studentId: sid, routeId: rid, stopId: form.stopId ? parseInt(form.stopId) : null, session });
    if (r.ok) { setOpen(false); setForm({ studentId: '', routeId: '' }); void load(); }
  };
  const cols: Column<any>[] = React.useMemo(() => [
    { key: 'student_name', header: T('student'), render: (r) => <strong>{r.student_name}</strong> },
    { key: 'class_name', header: 'Class', render: (r) => r.class_name ?? '—' },
    { key: 'route_name', header: T('route'), render: (r) => r.route_name },
    { key: 'stop_name', header: T('stop'), render: (r) => r.stop_name ?? '—' },
  ], []);
  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {strength.map((s) => (
          <StatCard key={s.route} label={s.route} value={`${s.count} / ${s.capacity || '—'}`} sub={T('allocated')} />
        ))}
      </div>
      <div className="mb-3 flex items-end justify-between">
        <div className="w-40"><Label>{T('session')}</Label><Input value={session} onChange={(e) => setSession(e.target.value)} /></div>
        <Button onClick={() => setOpen(true)}>{T('allocate')}</Button>
      </div>
      {rows.length === 0 ? <EmptyState title={T('noAllocations')} /> : <DataTable columns={cols} rows={rows} empty={T('noAllocations')} />}
      <Dialog open={open} onOpenChange={setOpen} title={T('allocate')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>{T('student')}</Label><Input type="number" placeholder={T('studentIdPh')} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} /></div>
          <div><Label>{T('route')}</Label>
            <Select value={form.routeId} onValueChange={(v: string) => setForm({ ...form, routeId: v, stopId: '' })} placeholder={T('route')}
              options={routes.map((r: any) => ({ value: String(r.id), label: r.name }))} />
          </div>
          <div><Label>{T('stop')}</Label>
            <Select value={form.stopId ?? ''} onValueChange={(v: string) => setForm({ ...form, stopId: v })} placeholder={T('stop')}
              options={stops.map((s: any) => ({ value: String(s.id), label: s.stop_name }))} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>{T('cancel')}</Button>
          <Button onClick={() => void allocate()}>{T('allocate')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

export default function TransportScreen() {
  const [tab, setTab] = React.useState('vehicles');
  return (
    <div>
      <PageHeader title={t('nav.transport')} />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'vehicles', label: T('vehicles'), content: <VehiclesTab /> },
          { value: 'routes', label: T('routes'), content: <RoutesTab /> },
          { value: 'allocations', label: T('allocations'), content: <AllocationsTab /> },
        ]}
      />
    </div>
  );
}
