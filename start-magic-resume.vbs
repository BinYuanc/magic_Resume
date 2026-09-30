' Magic Resume - hidden launcher (no black console window)
' Double-click this .vbs instead of the .bat
' Portable: it resolves its own folder, so it works from any location.
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c """ & scriptDir & "\start-magic-resume.bat""", 0, False

Set WshShell = Nothing
Set fso = Nothing
