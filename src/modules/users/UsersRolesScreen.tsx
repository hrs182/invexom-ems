import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { PageHeader, EmptyState } from '../../components/ui/feedback';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input, Field } from '../../components/ui/input';
import { Tabs } from '../../components/ui/primitives';
import { Select } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { DataTable } from '../../components/ui/data-table';
import { Dialog } from '../../components/ui/dialog';
import type { UserRow, RoleRow, ModuleKey, PermissionLevel } from '@shared/types';
import type { DictPath } from '../../i18n/index';

const MODULES: ModuleKey[] = [
  'dashboard', 'students', 'fees', 'attendance', 'exams', 'cards',
  'staff', 'accounting', 'inventory', 'transport', 'library',
  'frontoffice', 'reports', 'settings', 'backup', 'users',
];
const LEVELS: PermissionLevel[] = ['none', 'view', 'edit', 'print', 'admin'];
const LEVEL_LABEL: Record<PermissionLevel, DictPath> = {
  none: 'users.permNone', view: 'users.permView', edit: 'users.permEdit', print: 'users.permPrint', admin: 'users.permAdmin',
};

function UsersTab() {
  const [rows, setRows] = React.useState<UserRow[]>([]);
  const [roles, setRoles] = React.useState<RoleRow[]>([]);
  const [showNew, setShowNew] = React.useState(false);
  const [form, setForm] = React.useState({ username: '', displayName: '', password: '', roleId: 0 });
  const [busy, setBusy] = React.useState(false);
  const [resetFor, setResetFor] = React.useState<UserRow | null>(null);
  const [newPw, setNewPw] = React.useState('');
  const [adminPw, setAdminPw] = React.useState('');
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetError, setResetError] = React.useState('');
  const load = React.useCallback(() => {
    invoke('users:list', undefined).then(setRows);
    invoke('roles:list', undefined).then(setRoles);
  }, []);
  React.useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    const r = await invoke('users:create', { username: form.username.trim(), displayName: form.displayName.trim(), password: form.password, roleId: form.roleId });
    setBusy(false);
    if (r.ok) { setShowNew(false); setForm({ username: '', displayName: '', password: '', roleId: 0 }); load(); }
  };

  const toggleActive = async (u: UserRow) => {
    const r = await invoke('users:update', { id: u.id, isActive: !u.isActive });
    if (r.ok) load();
  };

  const openReset = (u: UserRow) => { setResetFor(u); setNewPw(''); setAdminPw(''); setResetError(''); };
  const doReset = async () => {
    if (!resetFor || newPw.length < 8 || !adminPw) return;
    setResetBusy(true); setResetError('');
    const r = await invoke('users:resetPassword', { id: resetFor.id, newPassword: newPw, adminPassword: adminPw });
    setResetBusy(false);
    if (r.ok) setResetFor(null);
    else setResetError(r.error);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowNew(true)}>{t('users.newUser')}</Button>
      </div>
      <DataTable
        columns={[
          { key: 'username', header: t('users.username'), sticky: true },
          { key: 'displayName', header: t('users.displayName') },
          { key: 'roleName', header: t('users.role'), render: (r) => <Badge tone="muted">{r.roleName}</Badge> },
          {
            key: 'isActive', header: t('common.status'),
            render: (r) => r.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge tone="muted">{t('common.inactive')}</Badge>,
          },
          { key: 'lastLogin', header: t('users.lastLogin'), render: (r) => r.lastLogin ? new Date(r.lastLogin).toLocaleString() : '—' },
          {
            key: 'actions', header: t('common.actions'), className: 'text-right',
            render: (r) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => openReset(r)}>{t('users.resetPassword')}</Button>
                <Button variant="ghost" size="sm" onClick={() => void toggleActive(r)}>
                  {r.isActive ? t('users.deactivate') : t('users.reactivate')}
                </Button>
              </span>
            ),
          },
        ]}
        rows={rows}
        empty={<EmptyState title={t('empty.users')} />}
      />

      <Dialog open={showNew} onOpenChange={setShowNew} title={t('users.newUser')}>
        <div className="flex flex-col gap-4">
          <Field label={t('users.username')} required><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus /></Field>
          <Field label={t('users.displayName')} required><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
          <Field label={t('auth.password')} required error={form.password && form.password.length < 8 ? t('auth.passwordTooShort') : undefined}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label={t('users.role')} required>
            <Select value={String(form.roleId)} onValueChange={(v) => setForm({ ...form, roleId: Number(v) })}
              options={[{ value: '0', label: '—' }, ...roles.map((r) => ({ value: String(r.id), label: r.name }))]} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>{t('common.cancel')}</Button>
            <Button loading={busy} disabled={!form.username.trim() || form.password.length < 8 || !form.roleId} onClick={create}>{t('common.add')}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(v) => !v && setResetFor(null)} title={t('users.resetPassword')}>
        {resetFor && (
          <div className="flex flex-col gap-4">
            {resetError && <p className="text-sm text-danger" role="alert">{resetError}</p>}
            <Field label={t('users.newPassword', { name: resetFor.displayName })} required
              error={newPw && newPw.length < 8 ? t('auth.passwordTooShort') : undefined}>
              <Input type="password" value={newPw} autoFocus onChange={(e) => setNewPw(e.target.value)} />
            </Field>
            <Field label={t('users.adminPassword')} required hint="Admin password re-entry is required for this sensitive action.">
              <Input type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResetFor(null)}>{t('common.cancel')}</Button>
              <Button loading={resetBusy} disabled={newPw.length < 8 || !adminPw} onClick={doReset}>{t('common.confirm')}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = React.useState<RoleRow[]>([]);
  const [editing, setEditing] = React.useState<RoleRow | null>(null);
  const [draft, setDraft] = React.useState<{ name: string; permissions: Record<ModuleKey, PermissionLevel> } | null>(null);
  const load = React.useCallback(() => { invoke('roles:list', undefined).then(setRoles); }, []);
  React.useEffect(load, [load]);

  const startEdit = (r: RoleRow | null) => {
    setEditing(r);
    setDraft(r ? { name: r.name, permissions: { ...r.permissions } }
      : { name: '', permissions: Object.fromEntries(MODULES.map((m) => [m, 'none'])) as Record<ModuleKey, PermissionLevel> });
  };

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    const r = await invoke('roles:save', { id: editing?.id, name: draft.name.trim(), permissions: draft.permissions });
    if (r.ok) { setEditing(null); setDraft(null); load(); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => startEdit(null)}>{t('users.newRole')}</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardContent>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">{r.name}</p>
                {r.isSystem && <Badge tone="muted">{t('users.systemRole')}</Badge>}
              </div>
              <p className="mb-3 text-xs text-muted">
                {Object.entries(r.permissions).filter(([, v]) => v !== 'none').length} / {MODULES.length} modules granted
              </p>
              {!r.isSystem && <Button variant="secondary" size="sm" onClick={() => startEdit(r)}>{t('common.edit')}</Button>}
              {r.isSystem && <p className="text-xs text-faint">{t('users.systemRoleLocked')}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(v) => { if (!v) { setDraft(null); setEditing(null); } }} title={editing ? editing.name : t('users.newRole')} wide>
        {draft && (
          <div className="flex flex-col gap-4">
            <Field label={t('users.roleName')} required>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            </Field>
            <div className="overflow-x-auto">
              <table className="data-grid w-full border-collapse text-sm">
                <thead><tr>
                  <th className="border-b border-border px-3 py-2 text-left text-[13px] font-semibold text-muted">Module</th>
                  {LEVELS.map((l) => <th key={l} className="border-b border-border px-2 py-2 text-center text-[13px] font-semibold text-muted">{t(LEVEL_LABEL[l])}</th>)}
                </tr></thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{m}</td>
                      {LEVELS.map((l) => (
                        <td key={l} className="px-2 py-2 text-center">
                          <input type="radio" name={`perm-${m}`} checked={draft.permissions[m] === l}
                            onChange={() => setDraft({ ...draft, permissions: { ...draft.permissions, [m]: l } })}
                            className="h-4 w-4 accent-[#1a56db]" aria-label={`${m} ${l}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setDraft(null); setEditing(null); }}>{t('common.cancel')}</Button>
              <Button onClick={save} disabled={!draft.name.trim()}>{t('common.save')}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export function UsersRolesScreen() {
  return (
    <div>
      <PageHeader title={t('users.title')} />
      <Card><CardContent>
        <Tabs tabs={[
          { value: 'users', label: t('users.tabs.users'), content: <UsersTab /> },
          { value: 'roles', label: t('users.tabs.roles'), content: <RolesTab /> },
        ]} />
      </CardContent></Card>
    </div>
  );
}
