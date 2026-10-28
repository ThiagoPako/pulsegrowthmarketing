# Pulse Wallpaper — instalador do Windows (para o usuário atual, sem precisar de administrador)
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '{{API_BASE}}/wallpaper/install/{{TOKEN}}/windows' | iex"
& {
  $ErrorActionPreference = 'Stop'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ApiBase = '{{API_BASE}}'
  $Token = '{{TOKEN}}'
  $Dir = Join-Path $env:LOCALAPPDATA 'PulseWallpaper'
  $ConfigPath = Join-Path $Dir 'config.json'

  Write-Host ''
  Write-Host 'Pulse Wallpaper - instalando neste computador...' -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $Dir -Force | Out-Null

  $body = @{
    token = $Token
    hostname = $env:COMPUTERNAME
    os = 'windows'
    os_version = [string][Environment]::OSVersion.Version
    user = $env:USERNAME
    agent_version = '{{AGENT_VERSION}}'
  }
  # Reinstalação: manda o registro antigo para não duplicar o computador na lista
  if (Test-Path $ConfigPath) {
    try {
      $old = Get-Content $ConfigPath -Raw | ConvertFrom-Json
      $body.device_id = $old.device_id
      $body.device_secret = $old.device_secret
    } catch { }
  }

  try {
    $reg = Invoke-RestMethod -Method Post -Uri "$ApiBase/wallpaper/agent/register" -ContentType 'application/json' `
      -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 30
  } catch {
    Write-Host 'Nao foi possivel conectar. Confira a internet e se o link ainda vale (peca um novo a agencia).' -ForegroundColor Red
    return
  }

  @{ api_base = $ApiBase; device_id = $reg.device_id; device_secret = $reg.device_secret; agent_version = '{{AGENT_VERSION}}' } |
    ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8

  $AgentPath = Join-Path $Dir 'agent.ps1'
  # o agente vem em base64 (ele tem here-strings próprios, que fechariam um here-string aqui)
  $AgentText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{{AGENT_PS1_B64}}'))
  [IO.File]::WriteAllText($AgentPath, $AgentText, (New-Object Text.UTF8Encoding $true))

  # wscript abre o PowerShell escondido (sem piscar janela a cada execução)
  $LauncherPath = Join-Path $Dir 'run.vbs'
  Set-Content -Path $LauncherPath -Encoding ASCII -Value (
    'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $AgentPath + '""", 0, False'
  )
  $Run = 'wscript.exe "' + $LauncherPath + '"'

  schtasks.exe /Create /F /SC MINUTE /MO {{INTERVAL_MIN}} /TN 'PulseWallpaper' /TR $Run | Out-Null
  Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'PulseWallpaper' -Value $Run

  Remove-Item -Path (Join-Path $Dir 'applied') -Force -ErrorAction SilentlyContinue
  powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $AgentPath

  Write-Host ''
  Write-Host 'Pronto! Este computador esta conectado.' -ForegroundColor Green
  Write-Host 'O papel de parede passa a ser atualizado automaticamente. Pode fechar esta janela.'
}
