' Magic Resume - launcher / controller
'
' Behaviour:
'   * first launch   -> opens ONE console window running the dev server
'                       (close that window and the server stops)
'   * later launches -> the server is already up, so this only opens the browser,
'                       no second console window is created
'   * dependencies missing -> hands over to the visible .bat, so the install is not silent
'
' The server is started through cmd.exe / node.exe (both Microsoft- or OpenJS-signed),
' so Windows does not show the "unknown publisher" warning that running a .bat triggers.
' Everything is resolved relative to this file, so the folder can be moved.

Option Explicit

Const PORT = 3000
Const URL_LOCALHOST = "http://localhost:3000/"
Const URL_IPV4 = "http://127.0.0.1:3000/"
Const WINDOW_TITLE = "Magic Resume - Dev Server"
Const WAIT_SECONDS = 90

Dim fso, sh, scriptDir, nodeExe, viteJs, i, ready
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir

' 1) server already running -> reuse it, just open the page (no new window)
If ServerUp(URL_LOCALHOST) Then
  sh.Run URL_LOCALHOST, 1, False
  WScript.Quit 0
End If
If ServerUp(URL_IPV4) Then
  sh.Run URL_IPV4, 1, False
  WScript.Quit 0
End If

viteJs = fso.BuildPath(scriptDir, "node_modules\vite\bin\vite.js")

' 2) dependencies are not installed yet -> visible script, the user should see the install
If Not fso.FileExists(viteJs) Then
  sh.Run "cmd /c """ & fso.BuildPath(scriptDir, "start-magic-resume.bat") & """", 1, False
  WScript.Quit 0
End If

nodeExe = ResolveNode()
If nodeExe = "" Then
  MsgBox "Node.js was not found." & vbCrLf & vbCrLf & _
         "Install Node.js 20.19 or newer first: https://nodejs.org/", 16, "Magic Resume"
  WScript.Quit 1
End If

' 3) first launch: one visible console window owns the server.
'    Closing that window ends the dev server (window style 1 = normal window).
sh.Run "cmd /c title " & WINDOW_TITLE & " & """ & nodeExe & """ """ & viteJs & _
       """ dev --host 127.0.0.1 --port " & PORT & " --strictPort", 1, False

' 4) wait until it answers, then open the browser
ready = False
For i = 1 To WAIT_SECONDS
  WScript.Sleep 1000
  If ServerUp(URL_IPV4) Then
    ready = True
    Exit For
  End If
Next

If ready Then
  sh.Run URL_IPV4, 1, False
Else
  MsgBox "The server is taking longer than usual." & vbCrLf & vbCrLf & _
         "Open this address in a moment:" & vbCrLf & URL_IPV4, 48, "Magic Resume"
End If

WScript.Quit 0

' True when something answers on that address.
Function ServerUp(u)
  Dim http
  ServerUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  If Err.Number <> 0 Then
    Err.Clear
    Exit Function
  End If
  http.setTimeouts 400, 400, 400, 800
  http.open "GET", u, False
  http.send
  If Err.Number = 0 Then
    If http.status >= 200 And http.status < 500 Then ServerUp = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

' Prefer the node.exe that is on PATH; fall back to the usual install folders.
Function ResolveNode()
  Dim tmpFile, stream, firstLine, candidates, k
  ResolveNode = ""
  tmpFile = fso.BuildPath(sh.ExpandEnvironmentStrings("%TEMP%"), "magic-resume-node.txt")
  sh.Run "cmd /c where node > """ & tmpFile & """ 2>nul", 0, True
  If fso.FileExists(tmpFile) Then
    Set stream = fso.OpenTextFile(tmpFile, 1)
    If Not stream.AtEndOfStream Then firstLine = Trim(stream.ReadLine())
    stream.Close
    fso.DeleteFile tmpFile, True
    If firstLine <> "" Then
      If fso.FileExists(firstLine) Then
        ResolveNode = firstLine
        Exit Function
      End If
    End If
  End If
  candidates = Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"))
  For k = 0 To UBound(candidates)
    If fso.FileExists(candidates(k)) Then
      ResolveNode = candidates(k)
      Exit Function
    End If
  Next
End Function
