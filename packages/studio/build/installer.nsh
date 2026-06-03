; RPAForge Studio — custom NSIS installer components page
; Injected into the generated installer script via electron-builder nsis.include.
; Provides:
;   - optional-component selection page (Python, rpaforge libraries)
;   - post-install hooks that download/run the selected installers
;
; Everything is guarded with !ifndef BUILD_UNINSTALLER because electron-builder
; compiles this file twice: once for the installer and once for the uninstaller.
; Functions only used in the installer would trigger warning 6010 (unreferenced
; function) during the uninstaller pass, which electron-builder treats as error.

!ifndef BUILD_UNINSTALLER

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ── Force the install-details log to be visible ──────────────────────────────
; electron-builder's common.nsh hard-codes `ShowInstDetails nevershow`, which
; hides the log list entirely. customHeader is inserted AFTER common.nsh in
; installer.nsi, so re-declaring the attribute here wins and the log shows.
!macro customHeader
  ShowInstDetails show
!macroend

; ── State variables ──────────────────────────────────────────────────────────
Var cbPython
Var cbRPAForge
Var doInstallPython
Var doInstallRPAForge

; ── Insert custom page after directory selection ─────────────────────────────
!macro customPageAfterChangeDir
  Page custom ComponentsPageShow ComponentsPageLeave
!macroend

; ── Run optional installs after the main app has been extracted ──────────────
!macro customInstall
  ; installSection.nsh sets `SetDetailsPrint none` for non-silent installs and
  ; the page defaults to the progress bar — switch to the log view and re-enable
  ; detail printing so the steps below are actually visible.
  SetDetailsView show
  SetDetailsPrint both

  ; ── Python ────────────────────────────────────────────────────────────────
  ${If} $doInstallPython == ${BST_CHECKED}
    ; Check if Python is already available in PATH
    nsExec::ExecToStack 'where python'
    Pop $0
    Pop $1
    ${If} $0 == 0
      DetailPrint "Python уже установлен, пропускаем."
    ${Else}
      DetailPrint "Загрузка Python 3.11 с python.org (curl)..."
      nsExec::ExecToLog 'curl.exe -L --progress-bar -o "$TEMP\python_setup.exe" "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"'
      Pop $0
      ${If} $0 == 0
        DetailPrint "Установка Python 3.11 (занимает около минуты)..."
        ExecWait '$\"$TEMP\python_setup.exe$\" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0' $0
        Delete "$TEMP\python_setup.exe"
        ${If} $0 != 0
          MessageBox MB_OK|MB_ICONEXCLAMATION "Python не удалось установить (код $0).$\nУстановите Python 3.x вручную: https://www.python.org"
        ${Else}
          DetailPrint "Python 3.11 успешно установлен."
        ${EndIf}
      ${Else}
        MessageBox MB_OK|MB_ICONEXCLAMATION "Не удалось загрузить установщик Python.$\nУстановите Python 3.x вручную: https://www.python.org"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; ── rpaforge-core + rpaforge-libraries ────────────────────────────────────
  ${If} $doInstallRPAForge == ${BST_CHECKED}
    DetailPrint "Установка rpaforge-core и rpaforge-libraries (pip)..."
    nsExec::ExecToLog 'python -m pip install rpaforge-core rpaforge-libraries'
    Pop $0
    ${If} $0 != 0
      DetailPrint "Ошибка установки rpaforge (код $0)."
      MessageBox MB_OK|MB_ICONEXCLAMATION "Не удалось установить rpaforge.$\nЗапустите вручную:$\n  python -m pip install rpaforge-core rpaforge-libraries"
    ${Else}
      DetailPrint "rpaforge-core и rpaforge-libraries успешно установлены."
    ${EndIf}
  ${EndIf}
!macroend

; ── Page: display ────────────────────────────────────────────────────────────
Function ComponentsPageShow
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Python и rpaforge необходимы для запуска RPA-сценариев.$\nСнимите галочки, если они уже установлены в системе."
  Pop $0

  ${NSD_CreateCheckBox} 0 32u 100% 14u "Python 3.11  —  интерпретатор Python (загружается с python.org, ~25 МБ)"
  Pop $cbPython
  ${NSD_SetState} $cbPython ${BST_CHECKED}

  ${NSD_CreateCheckBox} 0 52u 100% 14u "rpaforge-core + rpaforge-libraries  —  RPA-движок (pip install)"
  Pop $cbRPAForge
  ${NSD_SetState} $cbRPAForge ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

; ── Page: save selections when user clicks Next ──────────────────────────────
Function ComponentsPageLeave
  ${NSD_GetState} $cbPython $doInstallPython
  ${NSD_GetState} $cbRPAForge $doInstallRPAForge
FunctionEnd

!endif ; BUILD_UNINSTALLER
