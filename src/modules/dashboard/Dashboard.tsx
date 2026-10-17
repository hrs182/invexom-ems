import * as React from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import { useApp } from '../../stores/app';
import { PageHeader, StatCard, Alert, EmptyState } from '../../components/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Chart } from '../../components/ui/chart';
import type { Kpis, AlertItem } from '@shared/types';

const CHECKLIST = [
  { key: 'add-students', label: 'Add students', nav: 'students' },
  { key: 'fee-structure', label: 'Fee structures', nav: 'fees' },
  { key: 'collect-fee', label: 'Collect first fee', nav: 'fees' },
  { key: 'mark-attendance', label: 'Mark attendance', nav: 'attendance' },
  { key: 'backup-now', label: 'Run a backup', nav: 'backup' },
];

const waLink = (phone: string, text: string) =>
  `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;

export function Dashboard({ onNavigate }: { onNavigate: (k: string) => void }) {
  const { status, refreshStatus } = useApp();
  const license = status?.license;
  const health = status?.backupHealth;
  const [kpis, setKpis] = React.useState<Kpis | null>(null);
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [feeTrend, setFeeTrend] = React.useState<{ month: string; total: number }[]>([]);
  const [strength, setStrength] = React.useState<{ class: string; count: number }[]>([]);
  const [expenseTrend, setExpenseTrend] = React.useState<{ month: string; total: number }[]>([]);
  const [birthdays, setBirthdays] = React.useState<{ students: { id: number; name: string; class_name: string; phone: string }[]; staff: { id: number; name: string; phone: string }[] }>({ students: [], staff: [] });

  React.useEffect(() => {
    invoke('analytics:kpis', undefined).then(setKpis).catch(() => {});
    invoke('analytics:alerts', undefined).then(setAlerts).catch(() => {});
    invoke('analytics:feeTrend', undefined).then(setFeeTrend).catch(() => {});
    invoke('analytics:classStrength', undefined).then(setStrength).catch(() => {});
    invoke('analytics:expenseTrend', undefined).then(setExpenseTrend).catch(() => {});
    invoke('analytics:birthdays', undefined).then(setBirthdays).catch(() => {});
  }, []);

  const kpiCards = [
    { label: t('dashboard.kpiStudents'), value: String(kpis?.activeStudents ?? '—') },
    { label: t('dashboard.kpiFeesMonth'), value: `₹${(kpis?.feesCollectedMonth ?? 0).toLocaleString('en-IN')}` },
    { label: t('dashboard.kpiFeesPending'), value: `₹${(kpis?.feesPendingTotal ?? 0).toLocaleString('en-IN')}` },
    { label: t('dashboard.kpiAttendance'), value: kpis?.attendanceTodayPct != null ? `${kpis.attendanceTodayPct}%` : '—' },
    { label: t('dashboard.kpiEnquiries'), value: String(kpis?.enquiriesWeek ?? '—') },
    { label: t('dashboard.kpiStaff'), value: kpis ? `${kpis.staffPresentToday}/${kpis.staffTotal}` : '—' },
  ];

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      {license?.mode === 'demo' && (
        <Alert tone="warning" className="mb-4">
          {t('dashboard.demoBanner', { days: license.demoDaysLeft ?? 0, used: license.demoStudentCount ?? 0, cap: license.demoStudentCap ?? 50 })}
          <Button size="sm" className="ml-3" onClick={() => onNavigate('licensing')}>{t('dashboard.activate')}</Button>
        </Alert>
      )}

      {health && (health.daysSinceBackup === null || health.daysSinceBackup >= health.reminderDays) && (
        <Alert tone="warning" className="mb-4">
          {health.daysSinceBackup === null
            ? t('backup.reminderBannerNever')
            : t('backup.reminderBanner', { n: health.daysSinceBackup })}
          <Button size="sm" className="ml-3" onClick={() => onNavigate('backup')}>{t('backup.reminderBackupNow')}</Button>
        </Alert>
      )}
      {license?.mode === 'demo-expired' && (
        <Alert tone="danger" className="mb-4">
          {t('dashboard.demoExpired')}
          <Button size="sm" className="ml-3" onClick={() => onNavigate('licensing')}>{t('dashboard.activate')}</Button>
        </Alert>
      )}
      {license?.mode === 'mismatch' && (
        <Alert tone="danger" className="mb-4">{t('dashboard.mismatchBanner')}</Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpiCards.map((k) => <StatCard key={k.label} label={k.label} value={k.value} />)}
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {alerts.map((a, i) => (
            <Alert key={i} tone={a.severity === 'danger' ? 'danger' : a.severity === 'warning' ? 'warning' : 'brand'} title={a.title}>
              {a.detail}
            </Alert>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('modules.dashboard2.feeTrend')}</CardTitle></CardHeader>
          <CardContent>
            <Chart
              option={{
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: feeTrend.map((d) => d.month) },
                yAxis: { type: 'value' },
                series: [{ type: 'line', smooth: true, data: feeTrend.map((d) => d.total), areaStyle: {}, color: '#2563eb' }],
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('modules.dashboard2.classStrength')}</CardTitle></CardHeader>
          <CardContent>
            <Chart
              option={{
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: strength.map((d) => d.class) },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: strength.map((d) => d.count), color: '#0d9488', barMaxWidth: 42 }],
              }}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t('modules.dashboard2.expenseTrend')}</CardTitle></CardHeader>
          <CardContent>
            <Chart
              height={220}
              option={{
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: expenseTrend.map((d) => d.month) },
                yAxis: { type: 'value' },
                series: [{ type: 'line', smooth: true, data: expenseTrend.map((d) => d.total), color: '#dc2626' }],
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('modules.dashboard2.birthdays')}</CardTitle></CardHeader>
          <CardContent>
            {birthdays.students.length + birthdays.staff.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">{t('modules.dashboard2.noBirthdays')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {birthdays.students.map((b) => (
                  <li key={`s${b.id}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                    <span><strong>{b.name}</strong> <span className="text-muted">· Class {b.class_name}</span></span>
                    <a target="_blank" rel="noreferrer" href={waLink(b.phone, `Happy Birthday ${b.name}! 🎉 Wishing you a wonderful year ahead.`)}>
                      <Button variant="secondary" size="sm">{t('modules.dashboard2.wish')}</Button>
                    </a>
                  </li>
                ))}
                {birthdays.staff.map((b) => (
                  <li key={`t${b.id}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                    <span><strong>{b.name}</strong> <span className="text-muted">· Staff</span></span>
                    <a target="_blank" rel="noreferrer" href={waLink(b.phone, `Happy Birthday ${b.name}! 🎉`)}>
                      <Button variant="secondary" size="sm">{t('modules.dashboard2.wish')}</Button>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.alerts')}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => void refreshStatus()}>{t('common.refresh')}</Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${health?.overdue ? 'bg-danger' : 'bg-success'}`} aria-hidden />
              {health?.overdue ? t('backup.overdue') : t('dashboard.backupOk')}
              {health?.lastBackupAt && <span className="text-faint">· {new Date(health.lastBackupAt).toLocaleString()}</span>}
            </div>
            {health?.overdue && (
              <Alert tone="danger" className="mt-3">
                {t('dashboard.backupOverdue')}
                <Button size="sm" className="ml-3" onClick={() => onNavigate('backup')}>{t('dashboard.backupNow')}</Button>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader><CardTitle>{t('dashboard.quickStart')}</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-[13px] text-muted">{t('dashboard.quickStartSubtitle')}</p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {CHECKLIST.map((item) => (
                <li key={item.key}>
                  <button
                    onClick={() => onNavigate(item.nav)}
                    className="transition-soft flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 text-left hover:bg-surface-2"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-faint" aria-hidden>○</span>
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="ml-auto text-faint" aria-hidden>→</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {(kpis?.activeStudents ?? 0) === 0 && (
        <div className="mt-4">
          <EmptyState title={t('empty.students')} actionLabel={t('empty.studentsAction')} onAction={() => onNavigate('students')} />
        </div>
      )}
    </div>
  );
}
