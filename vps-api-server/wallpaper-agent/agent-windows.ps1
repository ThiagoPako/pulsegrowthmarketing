# Pulse Wallpaper — agente do Windows (roda a cada poucos minutos pelo Agendador de Tarefas)
# Pergunta ao servidor qual papel de parede vale e aplica quando muda ou quando alguém trocou à mão.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Dir = Join-Path $env:LOCALAPPDATA 'PulseWallpaper'
$Cfg = Get-Content (Join-Path $Dir 'config.json') -Raw | ConvertFrom-Json
$Headers = @{ 'X-Device-Id' = $Cfg.device_id; 'X-Device-Secret' = $Cfg.device_secret; 'X-Agent-Version' = $Cfg.agent_version }

function Remove-PulseWallpaper {
  schtasks.exe /Delete /TN 'PulseWallpaper' /F 2>$null | Out-Null
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'PulseWallpaper' -ErrorAction SilentlyContinue
  Remove-Item -Path $Dir -Recurse -Force -ErrorAction SilentlyContinue
}

function Send-Report($body) {
  try {
    Invoke-RestMethod -Method Post -Uri "$($Cfg.api_base)/wallpaper/agent/report" -Headers $Headers `
      -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 30 | Out-Null
  } catch { }
}

try {
  $State = Invoke-RestMethod -Uri "$($Cfg.api_base)/wallpaper/agent/state" -Headers $Headers -TimeoutSec 30
} catch {
  $code = 0
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 410) { Remove-PulseWallpaper }
  return
}
if (-not $State.image_id) { return }

try {
  $ext = [IO.Path]::GetExtension(([Uri]$State.url).AbsolutePath)
  if (-not $ext) { $ext = '.jpg' }
  $File = Join-Path $Dir ("wallpaper-$($State.image_id)$ext")
  if (-not (Test-Path $File)) {
    $tmp = "$File.download"
    Invoke-WebRequest -Uri $State.url -OutFile $tmp -UseBasicParsing -TimeoutSec 300
    Move-Item -Path $tmp -Destination $File -Force
    Get-ChildItem -Path $Dir -Filter 'wallpaper-*' | Where-Object { $_.FullName -ne $File } | Remove-Item -Force -ErrorAction SilentlyContinue
  }

  # Preencher, Ajustar, Ampliar, Centralizar, Lado a lado, Estender
  $styles = @{ fill = @('10', '0'); fit = @('6', '0'); stretch = @('2', '0'); center = @('0', '0'); tile = @('0', '1'); span = @('22', '0') }
  $style = $styles[[string]$State.fit]
  if (-not $style) { $style = $styles['fill'] }

  $desk = Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop'
  $same = ($desk.Wallpaper -eq $File) -and ([string]$desk.WallpaperStyle -eq $style[0]) -and ([string]$desk.TileWallpaper -eq $style[1])
  if ($same -and (Test-Path (Join-Path $Dir 'applied')) -and ((Get-Content (Join-Path $Dir 'applied') -Raw).Trim() -eq $State.image_id)) { return }

  Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value $style[0]
  Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper -Value $style[1]
  if (-not ('PulseWallpaper.Native' -as [type])) {
    Add-Type -Namespace PulseWallpaper -Name Native -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
'@
  }
  # SPI_SETDESKWALLPAPER, grava no perfil e avisa as janelas
  if (-not [PulseWallpaper.Native]::SystemParametersInfo(20, 0, $File, 3)) { throw 'O Windows recusou a troca do papel de parede' }
  Set-Content -Path (Join-Path $Dir 'applied') -Value $State.image_id
  Send-Report @{ image_id = $State.image_id }
} catch {
  Send-Report @{ error = [string]$_.Exception.Message }
}
