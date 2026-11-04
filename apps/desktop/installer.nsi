!include "MUI2.nsh"

Name "Entry Agents"
OutFile "dist\Entry-Desktop-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\EntryAgents"
RequestExecutionLevel user

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Entry Agents" SecMain
  SetOutPath "$INSTDIR"
  File "native-gui\target\x86_64-pc-windows-gnu\release\entry-desktop.exe"
  File "dist\entry-agent-sidecar.exe"
  File "README.md"

  CreateDirectory "$SMPROGRAMS\Entry Agents"
  CreateShortcut "$SMPROGRAMS\Entry Agents\Entry Agents.lnk" "$INSTDIR\entry-desktop.exe"
  CreateShortcut "$DESKTOP\Entry Agents.lnk" "$INSTDIR\entry-desktop.exe"

  WriteRegStr HKCU "Software\Classes\entry" "" "URL:Entry Agents Protocol"
  WriteRegStr HKCU "Software\Classes\entry" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\entry\shell\open\command" "" '"$INSTDIR\entry-desktop.exe" "%1"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\entry-desktop.exe"
  Delete "$INSTDIR\entry-agent-sidecar.exe"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$SMPROGRAMS\Entry Agents\Entry Agents.lnk"
  Delete "$DESKTOP\Entry Agents.lnk"
  RMDir "$SMPROGRAMS\Entry Agents"
  RMDir "$INSTDIR"
SectionEnd
