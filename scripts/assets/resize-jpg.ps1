param([string]$Dir, [int]$Max = 1024)
# Reduz os JPEG de uma pasta para no máximo $Max px (no lugar), qualidade 86. Usado pelo shrink-glb.cjs.
Add-Type -AssemblyName System.Drawing
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$q = New-Object System.Drawing.Imaging.EncoderParameters 1
$q.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 86L
Get-ChildItem $Dir -Filter *.jpg | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $k = [Math]::Min(1.0, $Max / [Math]::Max($img.Width, $img.Height))
  if ($k -ge 1.0) { $img.Dispose(); return }
  $w = [int][Math]::Round($img.Width * $k); $h = [int][Math]::Round($img.Height * $k)
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose(); $img.Dispose()
  $out = $_.FullName + '.tmp'
  $bmp.Save($out, $jpeg, $q); $bmp.Dispose()
  Move-Item -Force $out $_.FullName
}
