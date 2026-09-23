param([switch]$Worker, [string]$Evidence, [string]$Node)
$ErrorActionPreference = 'Stop'
if ($Worker) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if ($identity.Name -notmatch '[^\x00-\x7f]') { throw 'Expected a real Japanese-named account.' }
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Test account must not be an administrator.' }
    $accountProfile = (Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$($identity.User.Value)").ProfileImagePath
    if ($accountProfile -notmatch '[^\x00-\x7f]') { throw 'Expected a non-ASCII real Windows profile.' }
    # Start-Process otherwise inherits the administrator caller's environment.
    $env:USERPROFILE = $accountProfile
    $env:APPDATA = Join-Path $accountProfile 'AppData\Roaming'
    $env:LOCALAPPDATA = Join-Path $accountProfile 'AppData\Local'
    $env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    $storage = New-Item -ItemType Directory -Path (Join-Path $Evidence 'private storage')
    $acl = Get-Acl -LiteralPath $storage.FullName
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($identity.User.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $storage.FullName -AclObject $acl
    # Only this disposable CI account provisions permissions. The extension's
    # production check is read-only and must reject shared storage unchanged.
    $checker = Join-Path $PSScriptRoot '..\resources\check-private-tex-storage.ps1'
    & $checker -Directory $storage.FullName
    $shared = New-Item -ItemType Directory -Path (Join-Path $Evidence 'shared storage')
    $before = (Get-Acl -LiteralPath $shared.FullName).Sddl
    $rejected = $false
    try { & $checker -Directory $shared.FullName } catch { $rejected = $true }
    if (-not $rejected -or $before -ne (Get-Acl -LiteralPath $shared.FullName).Sddl) { throw 'Shared storage check failed.' }
    $env:LW_TEST_PRIVATE_STORAGE = $storage.FullName
    $env:LW_TEST_JAPANESE_USER = '1'
    $env:GITHUB_OUTPUT = Join-Path $Evidence 'smoke-output.txt'
    & $Node (Join-Path $PSScriptRoot 'testManagedTex.mjs') japanese
    if ($LASTEXITCODE -ne 0) { throw "Managed TeX smoke failed: $LASTEXITCODE" }
    $root = (Get-Content -LiteralPath $env:GITHUB_OUTPUT | Where-Object { $_ -like 'evidence=*' } | Select-Object -Last 1).Substring(9)
    Copy-Item -LiteralPath (Join-Path $root 'qa-report.json') -Destination $Evidence
    $report = Get-Content -Raw -LiteralPath (Join-Path $root 'qa-report.json') | ConvertFrom-Json
    Copy-Item -LiteralPath (Join-Path $report.project '.lw-security\t.pdf') -Destination $Evidence
    exit 0
}

# This controller runs only on the disposable GitHub-hosted Windows runner.
$username = 'TeX検証'
$password = ConvertTo-SecureString ([Guid]::NewGuid().ToString('N') + '!aA9') -AsPlainText -Force
$user = New-LocalUser -Name $username -Password $password -Description 'Disposable managed TeX CI account'
try {
    Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user
    $evidenceRoot = New-Item -ItemType Directory -Path (Join-Path "$env:SystemDrive\" ('lw-tex-ci-' + [Guid]::NewGuid().ToString('N')))
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "evidence=$($evidenceRoot.FullName)"
    & icacls.exe $evidenceRoot.FullName /grant "*$($user.SID.Value):(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not grant CI output access.' }
    & icacls.exe (Split-Path $PSScriptRoot -Parent) /grant "*$($user.SID.Value):(OI)(CI)RX" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not grant CI source read access.' }
    $credential = [PSCredential]::new("$env:COMPUTERNAME\$username", $password)
    $nodePath = (Get-Command node.exe).Source
    $arguments = @('-NoProfile', '-NonInteractive', '-File', ('"' + $PSCommandPath + '"'), '-Worker', '-Evidence', ('"' + $evidenceRoot.FullName + '"'), '-Node', ('"' + $nodePath + '"'))
    $child = Start-Process -FilePath (Get-Command pwsh.exe).Source -ArgumentList $arguments -Credential $credential -LoadUserProfile -Wait -PassThru -WorkingDirectory (Split-Path $PSScriptRoot -Parent) -RedirectStandardOutput (Join-Path $evidenceRoot 'stdout.log') -RedirectStandardError (Join-Path $evidenceRoot 'stderr.log')
    Get-Content -LiteralPath (Join-Path $evidenceRoot 'stdout.log')
    Get-Content -LiteralPath (Join-Path $evidenceRoot 'stderr.log')
    if ($child.ExitCode -ne 0) { throw "Japanese account test failed: $($child.ExitCode)" }
} finally {
    Remove-LocalUser -SID $user.SID
}
