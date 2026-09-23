param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
# Read-only check. Never grant permissions, take ownership or request elevation.
$item = Get-Item -LiteralPath $Directory -Force
if (-not $item.PSIsContainer) { throw 'Storage must be an existing directory.' }
for ($current = $item; $null -ne $current; $current = $current.Parent) {
    if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Storage must not traverse junctions or symbolic links.'
    }
}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl = Get-Acl -LiteralPath $item.FullName
if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid -or -not $acl.AreAccessRulesProtected) {
    throw 'Storage must belong to your Windows account with inherited permissions disabled.'
}
$allowed = @($sid, 'S-1-5-18', 'S-1-5-32-544')
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed) {
        throw 'Storage grants access to another account or group. Choose a private folder.'
    }
}
