; Invexom EMS — custom NSIS uninstaller fragment.
; Asks the user whether to keep school data (database + backups) on uninstall.
; Data lives in %APPDATA%\Invexom EMS for a per-user install.
; NOTE: best-effort — if this ever breaks the uninstaller build on Windows,
; remove the `include: build/uninstaller.nsh` line from electron-builder.yml
; (data is still preserved by default via deleteAppDataOnUninstall: false).
!macro customUnInstall
  MessageBox MB_YESNO "Do you want to KEEP your school data (database and backups)?$\n$\nChoose YES to keep your data, NO to delete everything." IDYES keep_ems_data
  RMDir /r "$APPDATA\Invexom EMS"
  Goto ems_uninstall_done
  keep_ems_data:
    DetailPrint "Keeping school data in $APPDATA\Invexom EMS"
  ems_uninstall_done:
!macroend
