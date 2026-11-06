# Renders the Bloom logo (a cyan -> violet -> pink gradient ring) into a multi-size
# Windows .ico at assets\bloom.ico. Run once; the result is committed.

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\assets\bloom.ico'
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

function Render([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  # Dark rounded tile so the ring reads on any wallpaper.
  $r = [single]($size * 0.22)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $s = [single]($size - 1)
  $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
  $path.AddArc($s - $r * 2, 0, $r * 2, $r * 2, 270, 90)
  $path.AddArc($s - $r * 2, $s - $r * 2, $r * 2, $r * 2, 0, 90)
  $path.AddArc(0, $s - $r * 2, $r * 2, $r * 2, 90, 90)
  $path.CloseFigure()
  $tile = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $size), ([System.Drawing.Color]::FromArgb(255, 22, 24, 34)), ([System.Drawing.Color]::FromArgb(255, 8, 9, 13))
  $g.FillPath($tile, $path)

  # Glow + gradient ring.
  $pad = [single]($size * 0.2)
  $rect = New-Object System.Drawing.RectangleF $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 0, 216, 255)), ([System.Drawing.Color]::FromArgb(255, 255, 79, 163)), 45
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = @([System.Drawing.Color]::FromArgb(255, 0, 216, 255), [System.Drawing.Color]::FromArgb(255, 139, 123, 255), [System.Drawing.Color]::FromArgb(255, 255, 79, 163))
  $blend.Positions = @([single]0, [single]0.5, [single]1)
  $grad.InterpolationColors = $blend
  foreach ($k in 3, 2) {
    $glow = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 139, 123, 255)), ([single]($size * 0.075 * $k))
    $g.DrawEllipse($glow, $rect)
  }
  $pen = New-Object System.Drawing.Pen $grad, ([single]([Math]::Max(1.5, $size * 0.13)))
  $g.DrawEllipse($pen, $rect)
  $g.Dispose()

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return , $ms.ToArray()
}

$sizes = 256, 64, 48, 32, 24, 16
$images = $sizes | ForEach-Object { , (Render $_) }

# ICO container with PNG-compressed entries (supported since Windows Vista).
$fs = [System.IO.File]::Create($out)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $sz = $sizes[$i]; $data = $images[$i]
  $w.Write([byte]($(if ($sz -ge 256) { 0 } else { $sz })))
  $w.Write([byte]($(if ($sz -ge 256) { 0 } else { $sz })))
  $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$data.Length); $w.Write([uint32]$offset)
  $offset += $data.Length
}
foreach ($data in $images) { $w.Write($data) }
$w.Close()
Write-Host "Wrote $out"
