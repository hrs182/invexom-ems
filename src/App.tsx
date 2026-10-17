import * as React from 'react';
import { useApp, isWebDemo } from './stores/app';
import { t } from './i18n/index';
import { Sidebar } from './components/ui/sidebar';
import { Topbar } from './components/ui/topbar';
import { CommandPalette } from './components/ui/command-palette';
import { SetupWizard } from './modules/setup/SetupWizard';
import { LoginScreen } from './modules/setup/LoginScreen';
import { Dashboard } from './modules/dashboard/Dashboard';
import { SettingsScreen } from './modules/settings/SettingsScreen';
import { UsersRolesScreen } from './modules/users/UsersRolesScreen';
import { BackupScreen } from './modules/backup/BackupScreen';
import { LicenseScreen } from './modules/licensing/LicenseScreen';
import { DiagnosticsScreen } from './modules/diagnostics/DiagnosticsScreen';
import { HelpScreen } from './modules/help/HelpScreen';
import { StudentsScreen } from './modules/students/StudentsScreen';
import { FeesScreen } from './modules/fees/FeesScreen';
import { AttendanceScreen } from './modules/attendance/AttendanceScreen';
import { ReportsScreen } from './modules/reports/ReportsScreen';
import { ExamsScreen } from './modules/exams/ExamsScreen';
import { CardsScreen } from './modules/cards/CardsScreen';
import { StaffScreen } from './modules/staff/StaffScreen';
import { AccountingScreen } from './modules/accounting/AccountingScreen';
import { InventoryScreen } from './modules/inventory/InventoryScreen';
import { FrontOfficeScreen } from './modules/frontoffice/FrontOfficeScreen';
import TransportScreen from './modules/transport/TransportScreen';
import LibraryScreen from './modules/library/LibraryScreen';
import { TemplateStudioScreen } from './modules/templates/TemplateStudioScreen';
import { EmptyState } from './components/ui/feedback';
import { Alert } from './components/ui/feedback';
import { invoke } from './lib/ipc';
import type { ModuleKey } from '@shared/types';

/**
 * App shell: boot -> setup wizard | login | workspace.
 * Milestone 2+ modules mount here behind the same permission gate.
 */
export default function App() {
  const { booted, bootError, status, user, boot, logout } = useApp();
  const [route, setRoute] = React.useState('dashboard');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [lockMinutes, setLockMinutes] = React.useState(15);

  React.useEffect(() => { void boot(); }, [boot]);

  // Collapse sidebar below 1280px (SRS 4.4).
  React.useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1280);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-lock on inactivity (FR-SET-07).
  React.useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void logout(), lockMinutes * 60_000);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    invoke('rules:get', undefined).then((r) => {
      const v = parseInt(r['lock.timeoutMinutes'] ?? '15', 10);
      if (!Number.isNaN(v) && v >= 1) setLockMinutes(v);
    }).catch(() => {});
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [user, logout, lockMinutes]);

  const canView = (key: string): boolean => {
    if (!user) return false;
    if (key === 'help' || key === 'diagnostics') return true;
    if (key === 'licensing') return user.roleName === 'Administrator' || user.permissions.settings === 'admin';
    const perm = user.permissions[key as ModuleKey];
    return perm !== undefined && perm !== 'none';
  };

  const renderRoute = () => {
    if (!canView(route)) {
      return (
        <EmptyState
          title={t('errors.forbidden')}
          actionLabel={t('nav.dashboard')}
          onAction={() => setRoute('dashboard')}
        />
      );
    }
    switch (route) {
      case 'dashboard': return <Dashboard onNavigate={setRoute} />;
      case 'students': return <StudentsScreen />;
      case 'fees': return <FeesScreen />;
      case 'attendance': return <AttendanceScreen />;
      case 'reports': return <ReportsScreen />;
      case 'exams': return <ExamsScreen />;
      case 'cards': return <CardsScreen />;
      case 'staff': return <StaffScreen />;
      case 'accounting': return <AccountingScreen />;
      case 'inventory': return <InventoryScreen />;
      case 'frontoffice': return <FrontOfficeScreen />;
      case 'templates': return <TemplateStudioScreen />;
      case 'transport': return <TransportScreen />;
      case 'library': return <LibraryScreen />;
      case 'settings': return <SettingsScreen onNavigate={setRoute} />;
      case 'users': return <UsersRolesScreen />;
      case 'backup': return <BackupScreen />;
      case 'licensing': return <LicenseScreen />;
      case 'diagnostics': return <DiagnosticsScreen />;
      case 'help': return <HelpScreen />;
      default:
        // Milestone 2+ modules plug in here.
        return <EmptyState title={`${route} — coming in the next milestone`} actionLabel={t('nav.dashboard')} onAction={() => setRoute('dashboard')} />;
    }
  };

  if (!booted) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-brand" aria-hidden />
          <p className="text-sm text-muted">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="flex h-full items-center justify-center bg-bg px-4">
        <Alert tone="danger" title="Startup failed">{bootError}</Alert>
      </div>
    );
  }

  if (status?.needsSetup) return <SetupWizard />;
  if (!user) return <LoginScreen />;

  const readOnly = status?.license.readOnly;

  return (
    <div className="flex h-full bg-bg text-text">
      <div className="no-print shrink-0">
        <Sidebar
          active={route}
          onNavigate={setRoute}
          collapsed={collapsed}
          addons={status?.license.addons ?? { transport: false, library: false }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSearch={() => setSearchOpen(true)} onNavigate={setRoute} />
        {isWebDemo && (
          <div className="no-print border-b border-brand bg-brand-soft px-4 py-1.5 text-center text-[12.5px] font-medium text-brand">
            Live demo by Invexom — sample data resets every midnight IST. <span className="opacity-75">This is the actual EMS software running in your browser.</span>
          </div>
        )}
        {readOnly && (
          <div className="no-print border-b border-danger bg-danger-soft px-4 py-2 text-center text-[13px] font-medium text-danger">
            {t('license.readOnlyNote')}
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-[1400px]">{renderRoute()}</div>
        </main>
      </div>
      <CommandPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(kind) => {
          if (kind === 'student') setRoute('students');
          else if (kind === 'receipt') setRoute('fees');
          else if (kind === 'staff') setRoute('staff');
          else if (kind === 'voucher') setRoute('accounting');
        }}
      />
    </div>
  );
}
