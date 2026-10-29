# Pulse Wallpaper — agente do Windows (roda a cada poucos minutos pelo Agendador de Tarefas)
# Pergunta ao servidor qual papel de parede vale e aplica quando muda ou quando alguém trocou à mão.
# Cada monitor recebe a versão da imagem no formato dele (o servidor escolhe pelas telas enviadas).
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AgentVersion = '{{AGENT_VERSION}}'
$Dir = Join-Path $env:LOCALAPPDATA 'PulseWallpaper'
$Cfg = Get-Content (Join-Path $Dir 'config.json') -Raw | ConvertFrom-Json
$Headers = @{ 'X-Device-Id' = $Cfg.device_id; 'X-Device-Secret' = $Cfg.device_secret; 'X-Agent-Version' = $AgentVersion }

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

# IDesktopWallpaper (Windows 8 ou mais novo): lista os monitores e troca o fundo de cada um
$Native = $false
try {
  if (-not ('PulseWallpaper.Desk' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace PulseWallpaper {
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }

  [ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IDesktopWallpaper {
    void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
    void GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] out string wallpaper);
    void GetMonitorDevicePathAt(uint monitorIndex, [MarshalAs(UnmanagedType.LPWStr)] out string monitorID);
    void GetMonitorDevicePathCount(out uint count);
    void GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID, out Rect displayRect);
    void SetBackgroundColor(uint color);
    void GetBackgroundColor(out uint color);
    void SetPosition(int position);
    void GetPosition(out int position);
  }

  [ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")]
  class DesktopWallpaperClass { }

  public static class Desk {
    static IDesktopWallpaper W() { return (IDesktopWallpaper)new DesktopWallpaperClass(); }

    // "1920x1080|<id do monitor>" de cada monitor ligado (desligado vem com tamanho zero)
    public static string[] Monitors() {
      IDesktopWallpaper w = W();
      uint n;
      w.GetMonitorDevicePathCount(out n);
      List<string> list = new List<string>();
      for (uint i = 0; i < n; i++) {
        string id;
        Rect r;
        try { w.GetMonitorDevicePathAt(i, out id); w.GetMonitorRECT(id, out r); } catch { continue; }
        int width = r.Right - r.Left;
        int height = r.Bottom - r.Top;
        if (width <= 0 || height <= 0) continue;
        list.Add(width + "x" + height + "|" + id);
      }
      return list.ToArray();
    }
    public static string Get(string id) { string p; W().GetWallpaper(id, out p); return p ?? ""; }
    public static void Set(string id, string path) { W().SetWallpaper(id, path); }
    public static void SetAll(string path) { W().SetWallpaper(null, path); }
    public static int GetPos() { int p; W().GetPosition(out p); return p; }
    public static void SetPos(int p) { W().SetPosition(p); }
  }
}
'@
  }
  $Monitors = @([PulseWallpaper.Desk]::Monitors() | ForEach-Object {
    $parts = $_ -split '\|', 2
    [pscustomobject]@{ Size = $parts[0]; Id = $parts[1] }
  })
  if ($Monitors.Count -gt 0) {
    $Native = $true
    $Headers['X-Screens'] = ($Monitors | ForEach-Object { $_.Size }) -join ','
  }
} catch { $Native = $false }

try {
  $State = Invoke-RestMethod -Uri "$($Cfg.api_base)/wallpaper/agent/state" -Headers $Headers -TimeoutSec 30
} catch {
  $code = 0
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 410) { Remove-PulseWallpaper }
  return
}

# Versão nova no servidor: troca este arquivo (vale a partir da próxima execução)
if ($State.agent_version -and [string]$State.agent_version -ne $AgentVersion) {
  try {
    $new = Invoke-WebRequest -Uri "$($Cfg.api_base)/wallpaper/agent/script" -Headers $Headers -UseBasicParsing -TimeoutSec 60
    $text = [string]$new.Content
    if ($text.Contains('Pulse Wallpaper') -and $text.Contains('wallpaper/agent/state')) {
      $self = Join-Path $Dir 'agent.ps1'
      [IO.File]::WriteAllText("$self.new", $text, (New-Object Text.UTF8Encoding $true))
      Move-Item -Path "$self.new" -Destination $self -Force
    }
  } catch { }
}

if (-not $State.image_id) { return }

try {
  $fit = [string]$State.fit
  # Um arquivo por monitor (mesma ordem das telas enviadas); sem isso, a imagem principal em todos
  $perScreen = @($State.screens | Where-Object { $_ -and $_.url })
  $byMonitor = $Native -and $fit -ne 'span' -and $perScreen.Count -eq $Monitors.Count
  if ($perScreen.Count -eq 0) { $perScreen = @([pscustomobject]@{ file_key = $State.image_id; url = $State.url }) }

  $files = @{}
  foreach ($s in $perScreen) {
    if ($files.ContainsKey([string]$s.file_key)) { continue }
    $ext = [IO.Path]::GetExtension(([Uri]$s.url).AbsolutePath)
    if (-not $ext) { $ext = '.jpg' }
    $file = Join-Path $Dir ("wallpaper-$($s.file_key)$ext")
    if (-not (Test-Path $file)) {
      $tmp = "$file.download"
      Invoke-WebRequest -Uri $s.url -OutFile $tmp -UseBasicParsing -TimeoutSec 300
      Move-Item -Path $tmp -Destination $file -Force
    }
    $files[[string]$s.file_key] = $file
  }
  $keep = @($files.Values)
  Get-ChildItem -Path $Dir -Filter 'wallpaper-*' | Where-Object { $keep -notcontains $_.FullName } | Remove-Item -Force -ErrorAction SilentlyContinue

  $wanted = @()
  if ($byMonitor) {
    for ($i = 0; $i -lt $Monitors.Count; $i++) { $wanted += $files[[string]$perScreen[$i].file_key] }
  } else {
    $wanted = @($files[[string]$perScreen[0].file_key])
  }
  $marker = "$($State.image_id)|$fit|$($wanted -join ';')"
  $appliedPath = Join-Path $Dir 'applied'
  $applied = if (Test-Path $appliedPath) { (Get-Content $appliedPath -Raw).Trim() } else { '' }

  if ($Native) {
    # Centralizar, Lado a lado, Ampliar, Ajustar, Preencher, Estender (DESKTOP_WALLPAPER_POSITION)
    $positions = @{ center = 0; tile = 1; stretch = 2; fit = 3; fill = 4; span = 5 }
    $pos = $positions[$fit]
    if ($null -eq $pos) { $pos = 4 }
    $same = ([PulseWallpaper.Desk]::GetPos() -eq $pos)
    for ($i = 0; $same -and $i -lt $Monitors.Count; $i++) {
      $expected = if ($byMonitor) { $wanted[$i] } else { $wanted[0] }
      if ([PulseWallpaper.Desk]::Get($Monitors[$i].Id) -ne $expected) { $same = $false }
    }
    if ($same -and $applied -eq $marker) { return }

    [PulseWallpaper.Desk]::SetPos($pos)
    if ($byMonitor) {
      for ($i = 0; $i -lt $Monitors.Count; $i++) { [PulseWallpaper.Desk]::Set($Monitors[$i].Id, $wanted[$i]) }
    } else {
      [PulseWallpaper.Desk]::SetAll($wanted[0])
    }
  } else {
    # Reserva (sem IDesktopWallpaper): uma imagem para todas as telas, pelo registro + SystemParametersInfo
    $File = $wanted[0]
    $styles = @{ fill = @('10', '0'); fit = @('6', '0'); stretch = @('2', '0'); center = @('0', '0'); tile = @('0', '1'); span = @('22', '0') }
    $style = $styles[$fit]
    if (-not $style) { $style = $styles['fill'] }

    $desk = Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop'
    $same = ($desk.Wallpaper -eq $File) -and ([string]$desk.WallpaperStyle -eq $style[0]) -and ([string]$desk.TileWallpaper -eq $style[1])
    if ($same -and $applied -eq $marker) { return }

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
  }
  Set-Content -Path $appliedPath -Value $marker
  Send-Report @{ image_id = $State.image_id }
} catch {
  Send-Report @{ error = [string]$_.Exception.Message }
}
