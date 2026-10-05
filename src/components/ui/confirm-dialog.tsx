import { Dialog } from './dialog';
import { Button } from './button';
import { Input } from './input';
import { t } from '../../i18n/index';
import * as React from 'react';

/** Double-confirmation for destructive actions (SRS UX-05). */
export function ConfirmDialog({
  open, onOpenChange, title, message, confirmLabel, danger, onConfirm, loading,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <p className="text-sm leading-relaxed text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
          {confirmLabel ?? t('common.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}

/** Admin-password re-entry gate for sensitive actions (PERM-02). */
export function AdminPasswordDialog({
  open, onOpenChange, title, message, onConfirm, loading,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  title: string; message: string; onConfirm: (adminPassword: string) => void; loading?: boolean;
}) {
  const [pw, setPw] = React.useState('');
  React.useEffect(() => { if (open) setPw(''); }, [open ]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={message}>
      <Input
        type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder={t('users.adminPassword')} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && pw) onConfirm(pw); }}
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        <Button variant="danger" loading={loading} disabled={!pw} onClick={() => onConfirm(pw)}>{t('common.confirm')}</Button>
      </div>
    </Dialog>
  );
}
