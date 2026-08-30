param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

Add-Type -AssemblyName System.Drawing

$wordmark = 'coffeemap'
$ink = [System.Drawing.ColorTranslator]::FromHtml('#27201A')
$paper = [System.Drawing.Color]::White

function New-CoffeeMapAsset {
  param(
    [Parameter(Mandatory)] [int]$Size,
    [Parameter(Mandatory)] [string]$OutputPath,
    [double]$WidthRatio = 0.86
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear($paper)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $fontSize = [Math]::Round($Size * 0.19)
  $font = New-Object System.Drawing.Font('Cooper Black', $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $maxWidth = $Size * $WidthRatio
  $measured = $graphics.MeasureString($wordmark, $font)

  if ($measured.Width -gt $maxWidth) {
    $font.Dispose()
    $fontSize = [Math]::Floor($fontSize * ($maxWidth / $measured.Width))
    $font = New-Object System.Drawing.Font('Cooper Black', $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  }

  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush($ink)
  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $graphics.DrawString($wordmark, $font, $brush, $rect, $format)

  $directory = Split-Path -Parent $OutputPath
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose()
  $format.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$assets = @(
  @{ Size = 1024; Path = 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'; Ratio = 0.86 },
  @{ Size = 512; Path = 'public\pwa-512x512.png'; Ratio = 0.86 },
  @{ Size = 192; Path = 'public\pwa-192x192.png'; Ratio = 0.86 },
  @{ Size = 256; Path = 'public\favicon.png'; Ratio = 0.86 },
  @{ Size = 2732; Path = 'ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732.png'; Ratio = 0.58 },
  @{ Size = 2732; Path = 'ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732-1.png'; Ratio = 0.58 },
  @{ Size = 2732; Path = 'ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732-2.png'; Ratio = 0.58 }
)

foreach ($asset in $assets) {
  New-CoffeeMapAsset -Size $asset.Size -OutputPath (Join-Path $ProjectRoot $asset.Path) -WidthRatio $asset.Ratio
}

Write-Output "Generated $($assets.Count) Coffee Map brand assets."
