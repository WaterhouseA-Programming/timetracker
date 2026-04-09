; build/installer.nsh
; Custom NSIS script — runs inside electron-builder's generated installer

; ── Welcome page ──────────────────────────────────────────────────────────────
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ── Finish page — offer to launch the app ─────────────────────────────────────
!macro customFinishPage
  !define MUI_FINISHPAGE_RUN "$INSTDIR\TimeTracker.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch TimeTracker"
  !insertmacro MUI_PAGE_FINISH
!macroend
