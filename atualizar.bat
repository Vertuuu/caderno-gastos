<# :
@echo off
rem Atualiza o Caderno de Gastos: acha a pasta do clone e roda "git pull" na main.
rem Pode ficar em qualquer lugar (dentro da pasta do app, na Area de Trabalho...). Duplo clique para rodar.
title Atualizar Caderno de Gastos
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:CG_SCRIPT_DIR='%~dp0'; iex (Get-Content -Raw -Encoding UTF8 -LiteralPath '%~f0')"
echo.
pause
exit /b
#>

# ---- daqui para baixo e PowerShell (o trecho acima so chama este arquivo) ----
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$GITHUB_REPO = "Vertuuu/caderno-gastos"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Say "O Git não foi encontrado neste computador. Instale em https://git-scm.com/download/win e rode de novo." Red
  return
}

# é o clone do Caderno? (pasta com .git cujo origin aponta para o repositório)
function Test-Clone($dir) {
  if (-not (Test-Path -LiteralPath (Join-Path $dir ".git"))) { return $false }
  $url = git -C $dir remote get-url origin 2>$null
  $pattern = "[/:]" + [regex]::Escape($GITHUB_REPO) + "(\.git)?/?$"
  return [bool]($url -and ("$url" -match $pattern))
}

# 1) a pasta deste script ou alguma acima dela
function Find-Up($start) {
  $d = $start
  while ($d) {
    if (Test-Clone $d) { return $d }
    $p = Split-Path -Parent $d
    if ($p -eq $d) { break }
    $d = $p
  }
  return $null
}

# 2) busca nas pastas de costume, alguns níveis abaixo, pulando o que só atrasa
$SKIP = @("AppData", "node_modules", "Windows", "Program Files", "Program Files (x86)", "ProgramData", "`$Recycle.Bin", "System Volume Information")
function Find-Down($roots, $maxDepth) {
  $found = New-Object System.Collections.Generic.List[string]
  $queue = New-Object System.Collections.Generic.Queue[object]
  foreach ($r in $roots) { if ($r -and (Test-Path -LiteralPath $r)) { $queue.Enqueue([pscustomobject]@{ Dir = $r; Depth = 0 }) } }
  $seen = @{}
  while ($queue.Count) {
    $item = $queue.Dequeue(); $dir = $item.Dir; $depth = $item.Depth
    if ($seen[$dir]) { continue }; $seen[$dir] = $true
    if (Test-Clone $dir) { $found.Add($dir); continue }
    if ($depth -ge $maxDepth) { continue }
    try { $subs = [IO.Directory]::GetDirectories($dir) } catch { continue }
    foreach ($s in $subs) {
      $name = Split-Path -Leaf $s
      if ($name.StartsWith(".") -or $SKIP -contains $name) { continue }
      $queue.Enqueue([pscustomobject]@{ Dir = $s; Depth = $depth + 1 })
    }
  }
  return $found
}

$scriptDir = $env:CG_SCRIPT_DIR.TrimEnd("\")
$repo = Find-Up $scriptDir
if (-not $repo) {
  Say "Procurando a pasta do Caderno de Gastos..."
  $shell = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
  $known = foreach ($k in "Personal", "Desktop", "{374DE290-123F-4565-9164-39C4925E467B}") {
    try { [Environment]::ExpandEnvironmentVariables((Get-ItemProperty -Path $shell -Name $k).$k) } catch {}
  }
  $roots = @($known) + @($env:OneDrive, $env:USERPROFILE) + (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Z]:\\$' } | ForEach-Object { $_.Root })
  $all = Find-Down ($roots | Where-Object { $_ } | Select-Object -Unique) 4
  $all = @($all | Select-Object -Unique)
  if ($all.Count -eq 0) {
    Say "Não achei nenhuma pasta com o clone do Caderno de Gastos ($GITHUB_REPO)." Red
    Say "Coloque este arquivo dentro da pasta do app e rode de novo."
    return
  }
  if ($all.Count -gt 1) {
    Say "Achei mais de uma pasta do Caderno de Gastos:" Yellow
    for ($i = 0; $i -lt $all.Count; $i++) { Say ("  {0}) {1}" -f ($i + 1), $all[$i]) }
    $n = Read-Host "Qual atualizar? (número)"
    if (-not ($n -as [int]) -or [int]$n -lt 1 -or [int]$n -gt $all.Count) { Say "Opção inválida. Nada foi alterado." Red; return }
    $repo = $all[[int]$n - 1]
  } else { $repo = $all[0] }
}
Say "Pasta do app: $repo" Cyan

# atualiza a main sem mexer na pasta dados (ela é ignorada pelo Git)
$branch = git -C $repo rev-parse --abbrev-ref HEAD
$before = git -C $repo rev-parse --short main 2>$null
$ErrorActionPreference = "Continue"
if ($branch -eq "main") {
  git -C $repo pull --ff-only origin main
} else {
  Say "A pasta está na branch '$branch'; atualizando a main sem trocar de branch." Yellow
  git -C $repo fetch origin main:main
}
$ok = $LASTEXITCODE -eq 0
$after = git -C $repo rev-parse --short main 2>$null

Say ""
if (-not $ok) {
  Say "A atualização não terminou. Veja a mensagem do Git acima." Red
  Say "O mais comum é algum arquivo do app ter sido editado nesta pasta. Seus dados continuam salvos."
} elseif ($before -eq $after) {
  Say "Já estava na versão mais nova ($after)." Green
} else {
  Say "Atualizado: $before -> $after" Green
  Say "Se o app estiver ligado, desligue e ligue de novo, e recarregue a página em cada aparelho."
}
