# Starts Gather locally while bypassing a stale loopback proxy, if one is set.
# These changes apply only to this PowerShell process and its child processes.
$proxyVariables = 'ALL_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'GIT_HTTP_PROXY', 'GIT_HTTPS_PROXY'
foreach ($name in $proxyVariables) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}

& "$PSScriptRoot\backend\venv\Scripts\python.exe" -m flask --app backend.app run --debug
