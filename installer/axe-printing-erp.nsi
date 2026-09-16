; Axe Printing ERP - Windows Setup
;
; Produces a normal double-click installer (AxePrintingERP-Setup.exe):
; download it, run it, click through a standard setup wizard, and it
; installs the whole ERP as a real local "app" - Start Menu entry, Desktop
; icon, listed in Apps & Features, proper uninstaller. No admin needed for
; that part (it installs per-user, under %LOCALAPPDATA%). The one place
; admin IS needed - pausing a real printer so jobs hold for the ERP - is
; offered as an optional last step on the Finish page, which launches the
; existing windows-print-bridge\Install.bat (that script already asks for
; admin itself via Windows' own UAC prompt, and walks through picking a
; printer).
;
; Build with: makensis axe-printing-erp.nsi   (run from this "installer"
; folder - all paths below are relative to it).

!include "MUI2.nsh"

!define PRODUCT_NAME "Axe Printing ERP"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Axe Printing Solutions"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AxePrintingERP"

Name "${PRODUCT_NAME}"
OutFile "AxePrintingERP-Setup.exe"
InstallDir "$LOCALAPPDATA\AxePrintingERP"
InstallDirRegKey HKCU "Software\AxePrintingERP" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "axe.ico"
!define MUI_UNICON "axe.ico"
!define MUI_ABORTWARNING

; --- Installer pages ---------------------------------------------------------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\windows-print-bridge\Install.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Set up the Print Bridge now (pick the printer you'll test with)"
!define MUI_FINISHPAGE_LINK "How to test with a real printer"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR\HOW-TO-TEST-WITH-YOUR-PRINTER.md"
!insertmacro MUI_PAGE_FINISH

; --- Uninstaller pages --------------------------------------------------------
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; --- Install -------------------------------------------------------------------
Section "-Install" SEC01
  SetOutPath "$INSTDIR"
  ; Everything the ERP and the Print Bridge need, minus this installer
  ; project's own build files (the .nsi script and whatever .exe it makes).
  File /r /x ".git" /x "installer" /x ".gitignore" "..\*.*"
  File "axe.ico"

  ; "Open the app" shortcut - a plain Internet Shortcut pointed at the
  ; locally-running ERP, same technique the Print Bridge installer already
  ; uses for its own Desktop icon. Works like any other app shortcut:
  ; double-click, browser opens to the ERP.
  FileOpen $0 "$DESKTOP\Axe Printing ERP.url" w
  FileWrite $0 "[InternetShortcut]$\r$\nURL=http://localhost:8000$\r$\nIconFile=$INSTDIR\axe.ico$\r$\nIconIndex=0$\r$\n"
  FileClose $0

  CreateDirectory "$SMPROGRAMS\Axe Printing ERP"
  FileOpen $0 "$SMPROGRAMS\Axe Printing ERP\Axe Printing ERP.url" w
  FileWrite $0 "[InternetShortcut]$\r$\nURL=http://localhost:8000$\r$\nIconFile=$INSTDIR\axe.ico$\r$\nIconIndex=0$\r$\n"
  FileClose $0
  CreateShortCut "$SMPROGRAMS\Axe Printing ERP\Set Up Printer (Admin).lnk" "$INSTDIR\windows-print-bridge\Install.bat" "" "$INSTDIR\axe.ico"
  CreateShortCut "$SMPROGRAMS\Axe Printing ERP\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\AxePrintingERP" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\axe.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

; --- Uninstall -----------------------------------------------------------------
Section "Uninstall"
  ; Best-effort: resumes any paused printer(s) and removes the two
  ; scheduled tasks the Print Bridge set up. This needs admin (to resume a
  ; printer), so it self-elevates and shows its own UAC prompt - same as
  ; running Uninstall.bat by hand. If the Print Bridge was never set up,
  ; this just quietly does nothing.
  IfFileExists "$INSTDIR\windows-print-bridge\uninstall-axe-print-bridge.ps1" 0 +2
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\windows-print-bridge\uninstall-axe-print-bridge.ps1"'

  Delete "$DESKTOP\Axe Printing ERP.url"
  Delete "$SMPROGRAMS\Axe Printing ERP\Axe Printing ERP.url"
  Delete "$SMPROGRAMS\Axe Printing ERP\Set Up Printer (Admin).lnk"
  Delete "$SMPROGRAMS\Axe Printing ERP\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Axe Printing ERP"

  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\AxePrintingERP"
SectionEnd
