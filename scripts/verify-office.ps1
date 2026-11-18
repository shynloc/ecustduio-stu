param([string]$AssetDirectory, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$docx = Get-ChildItem -LiteralPath $AssetDirectory -Filter '*.docx' | Select-Object -First 1
$pptx = Get-ChildItem -LiteralPath $AssetDirectory -Filter '*.pptx' | Select-Object -First 1
$result = @{}
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($docx.FullName, $false, $true, $false)
  $result.wordPages = $doc.ComputeStatistics(2)
  $doc.ExportAsFixedFormat((Join-Path $OutputDirectory 'word-render.pdf'), 17)
  $result.word = 'opened-readonly-and-rendered'
} finally {
  if ($doc) { $doc.Close(0) }
  if ($word) { $word.Quit() }
}
$ppt = $null
$deck = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $deck = $ppt.Presentations.Open($pptx.FullName, -1, 0, 0)
  $result.slideCount = $deck.Slides.Count
  $deck.Export($OutputDirectory, 'PNG', 1600, 900)
  $result.powerpoint = 'opened-readonly-and-rendered-all-slides'
  $result.textShapes = 0
  foreach ($slide in $deck.Slides) { foreach ($shape in $slide.Shapes) { if ($shape.HasTextFrame) { $result.textShapes++ } } }
} finally {
  if ($deck) { $deck.Close() }
  if ($ppt) { $ppt.Quit() }
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'office-result.json') -Encoding UTF8
$result | ConvertTo-Json
