$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

Write-Host 'Companion Core · Groq'
Write-Host 'Use somente o plano Free. Não cadastre pagamento nem faça upgrade.'
$confirmation = Read-Host 'Confirme que sua conta Groq está no plano Free digitando FREE'
if ($confirmation -cne 'FREE') {
  Write-Host 'Inicialização cancelada. O Core e os dados não foram alterados.'
  exit 2
}

$secureKey = Read-Host 'Cole a chave Groq (a entrada ficará oculta)' -AsSecureString
$pointer = [IntPtr]::Zero
$key = $null
$result = $null
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($key) -or $key -match '\s') {
    throw 'A chave está vazia ou contém espaços.'
  }
  $env:MAYUNA_AI_PROVIDER = 'groq'
  $env:GROQ_API_KEY = $key
  Write-Host 'Iniciando o Core com Groq. Encerre com Ctrl+C; não há fallback automático.'
  npm run web:start
  $result = $LASTEXITCODE
} finally {
  Remove-Item Env:GROQ_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:MAYUNA_AI_PROVIDER -ErrorAction SilentlyContinue
  $key = $null
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  if ($secureKey) { $secureKey.Dispose() }
}
if ($null -ne $result) { exit $result }
