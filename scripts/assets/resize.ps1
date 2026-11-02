param([string]$Src, [string]$Dst, [int]$Max = 1024)
# Reduz as texturas do pacote para no mÃ¡ximo $Max px. Casca e pedra (opacas) viram JPEG; o resto fica PNG (transparÃªncia).
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Dst | Out-Null
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$q = New-Object System.Drawing.Imaging.EncoderParameters 1
$q.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 86L
Get-ChildItem $Src -Filter *.png | Where-Object { $_.Name -notmatch '_Normal\.png$' } | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $k = [Math]::Min(1.0, $Max / [Math]::Max($img.Width, $img.Height))
  $w = [int][Math]::Round($img.Width * $k); $h = [int][Math]::Round($img.Height * $k)
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose(); $img.Dispose()
  $opaque = $_.Name -match '^(Bark_|Rocks_|PathRocks_|Mushrooms)'
  if ($opaque) { $bmp.Save((Join-Path $Dst ($_.BaseName + '.jpg')), $jpeg, $q) } else { $bmp.Save((Join-Path $Dst $_.Name), [System.Drawing.Imaging.ImageFormat]::Png) }
  $bmp.Dispose()
}
Get-ChildItem $Dst | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB)}}

