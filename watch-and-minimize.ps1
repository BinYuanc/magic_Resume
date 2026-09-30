# Magic Resume - startup watcher (v2)
# Waits until the dev server really accepts connections, then minimizes the
# console window and opens the browser.
#
# v2 fixes:
#   - port probe now tries BOTH IPv6 (::1) and IPv4 (127.0.0.1), because
#     vite listens on [::1]:3000 only
#   - window lookup now enumerates ALL top-level windows (works inside
#     Windows Terminal / ConPTY, where GetConsoleWindow is useless)
#   - everything is logged to _startup.log for troubleshooting

param(
    [string]$TitleMatch = "Magic Resume",
    [int]$Port = 3000,
    [int]$TimeoutSeconds = 90,
    [switch]$NoBrowser,
    [switch]$DryRun
)

$logFile = Join-Path $PSScriptRoot "_startup.log"

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class WinUtil
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();

    public static string Title(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    public static string ClassName(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(256);
        GetClassName(h, sb, sb.Capacity);
        return sb.ToString();
    }

    // "handle|class|title" for every visible top-level window
    public static List<string> ListVisible()
    {
        List<string> list = new List<string>();
        EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            if (!IsWindowVisible(h)) return true;
            string t = Title(h);
            if (t.Length > 0) list.Add(h.ToInt64() + "|" + ClassName(h) + "|" + t);
            return true;
        }, IntPtr.Zero);
        return list;
    }

    // first visible top-level window whose title contains the given text
    public static IntPtr FindByTitle(string contains)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            if (found != IntPtr.Zero) return true;
            if (!IsWindowVisible(h)) return true;
            string t = Title(h);
            if (t.Length > 0 && t.IndexOf(contains, StringComparison.OrdinalIgnoreCase) >= 0) found = h;
            return true;
        }, IntPtr.Zero);
        return found;
    }

    // every visible window of a given window class
    public static List<IntPtr> FindByClass(string cls)
    {
        List<IntPtr> list = new List<IntPtr>();
        EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            if (!IsWindowVisible(h)) return true;
            if (string.Equals(ClassName(h), cls, StringComparison.OrdinalIgnoreCase)) list.Add(h);
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
'@

function Test-Endpoint {
    param([string]$Address, [int]$p)
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($Address, $p, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(500)) {
            $client.EndConnect($iar)   # throws when the handshake failed
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        if ($client) { $client.Close() }
    }
}

# Is anything listening on the port?  Asks the OS TCP table instead of opening
# a connection, so it does not care whether vite bound IPv4, IPv6 or both.
function Test-Listening {
    param([int]$p)
    $probed = $false
    try {
        $conn = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction Stop
        $probed = $true
        if ($conn) { return $true }
    } catch {
        $probed = $false
    }
    if ($probed) { return $false }

    # fallbacks: raw TCP probes, then netstat
    if ((Test-Endpoint -Address "::1" -p $p) -or (Test-Endpoint -Address "127.0.0.1" -p $p)) { return $true }
    try {
        $hits = @(netstat -ano | Select-String -Pattern (":$p\s") | Select-String -Pattern "LISTENING")
        return ($hits.Count -gt 0)
    } catch {
        return $false
    }
}

# ---------------------------------------------------------------------------
# 1. wait until the dev server listens on the port
# ---------------------------------------------------------------------------
Write-Log "watcher started (port=$Port, timeout=${TimeoutSeconds}s, dryrun=$DryRun)"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
    if (Test-Listening -p $Port) {
        $ready = $true
        break
    }
    Start-Sleep -Milliseconds 400
}

if ($ready) {
    Write-Log "port $Port is listening"
} else {
    Write-Log "TIMEOUT after ${TimeoutSeconds}s - port $Port is not listening"
}

# ---------------------------------------------------------------------------
# 2. minimize the console window
#    A: top-level window whose title matches (works in Windows Terminal)
#    C: classic conhost console handle (legacy console host)
#    Only ever touches a window whose title contains our marker, so an
#    unrelated terminal window of the user is never minimized.
# ---------------------------------------------------------------------------
$target = [IntPtr]::Zero
$how = "none"

if ($DryRun) {
    Write-Log "DRY RUN - visible windows matching '$TitleMatch':"
    foreach ($w in [WinUtil]::ListVisible()) {
        if ($w -match $TitleMatch) { Write-Log "  $w" }
    }
} else {
    $h = [WinUtil]::FindByTitle($TitleMatch)
    if ($h -ne [IntPtr]::Zero) {
        $target = $h
        $how = "A/title"
    } else {
        $c = [WinUtil]::GetConsoleWindow()
        # ConPTY (Windows Terminal) hands out a HIDDEN pseudo console window.
        # Its title matches ours, but minimizing it does nothing visible, so
        # require the handle to be a real visible window.
        if ($c -ne [IntPtr]::Zero -and [WinUtil]::Title($c) -match "Magic Resume" -and [WinUtil]::IsWindowVisible($c)) {
            $target = $c
            $how = "C/conhost"
        } else {
            Write-Log "no visible window matching '$TitleMatch' found - nothing minimized"
            Write-Log "hint: if you switched to another terminal tab, the tab title changed; switch back and re-run"
        }
    }

    if ($target -ne [IntPtr]::Zero) {
        Write-Log ("minimizing via {0}: {1}|{2}" -f $how, $target.ToInt64(), [WinUtil]::Title($target))
        [void][WinUtil]::ShowWindowAsync($target, 6)     # 6 = SW_MINIMIZE
        Start-Sleep -Milliseconds 400
        if (-not [WinUtil]::IsIconic($target)) {
            Write-Log "ShowWindowAsync had no effect, retrying with ShowWindow"
            [void][WinUtil]::ShowWindow($target, 6)
        }
        Write-Log ("minimized = {0}" -f [WinUtil]::IsIconic($target))
    }
}

# ---------------------------------------------------------------------------
# 3. open the browser (even on timeout, so the user is not left blind)
# ---------------------------------------------------------------------------
if (-not $NoBrowser) {
    try {
        Start-Process "http://localhost:$Port"
        Write-Log "browser opened at http://localhost:$Port"
    } catch {
        Write-Log "failed to open browser: $_"
    }
}

Write-Log "watcher finished"
