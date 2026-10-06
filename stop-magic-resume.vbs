' Magic Resume - silent stop
'
' The silent launcher keeps the dev server running without any window, so this
' script is the way to stop it: it ends only node.exe processes whose command
' line mentions vite (never other Node tools running on the machine).

Option Explicit

Dim wmi, procs, p, killed
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set procs = wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='node.exe'")

killed = 0
For Each p In procs
  If Not IsNull(p.CommandLine) Then
    If InStr(LCase(p.CommandLine), "vite") > 0 Then
      p.Terminate()
      killed = killed + 1
    End If
  End If
Next

If killed = 0 Then
  MsgBox "Magic Resume is not running.", 64, "Magic Resume"
Else
  MsgBox "Magic Resume stopped (" & killed & " process).", 64, "Magic Resume"
End If
