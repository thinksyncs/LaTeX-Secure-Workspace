param([Parameter(Mandatory = $true)][string]$Directory, [switch]$Diagnostics)
$ErrorActionPreference = 'Stop'
$timer = [Diagnostics.Stopwatch]::StartNew()
function Report-Phase([string]$Phase) {
    if ($Diagnostics) {
        [Console]::Error.WriteLine(('LW_STORAGE_CHECK phase={0} elapsedMs={1}' -f $Phase, $timer.ElapsedMilliseconds))
    }
}
Report-Phase 'script-start'
# PowerShell 7 callers can pass a PSModulePath containing incompatible modules
# to Windows PowerShell 5.1. Load this host's built-in security module explicitly.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
Report-Phase 'module-loaded'
# Read-only check. Never grant permissions, take ownership or request elevation.
$item = Get-Item -LiteralPath $Directory -Force
if (-not $item.PSIsContainer) { throw 'Storage must be an existing directory.' }
for ($current = $item; $null -ne $current; $current = $current.Parent) {
    if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Storage must not traverse junctions or symbolic links.'
    }
}
Report-Phase 'path-checked'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
Report-Phase 'acl-start'
$acl = Get-Acl -LiteralPath $item.FullName
Report-Phase 'acl-read'
if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid -or -not $acl.AreAccessRulesProtected) {
    throw 'Storage must belong to your Windows account with inherited permissions disabled.'
}
$allowed = @($sid, 'S-1-5-18', 'S-1-5-32-544')
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed) {
        throw 'Storage grants access to another account or group. Choose a private folder.'
    }
}
Report-Phase 'validated'
