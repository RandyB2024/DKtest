# BESTEMD Release Guard — NO WRITES, NO ROLLBACKS, NO BUILDS.
# Run with PowerShell 7 or Windows PowerShell 5.1 after Wrangler login.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$results = @()
$targets = @(
  @{ Key="portal"; Name="bestemd-portal"; Version="381ebf18-c853-480a-931a-27c4a3698d2b"; Deployment="e922919a-cd05-4a6f-812a-945aa395c89a" },
  @{ Key="office"; Name="bestemd-office"; Version="3d728689-6a3b-4ec6-bc5f-0811e72c1c90"; Deployment="7791c950-3a28-4c3f-8753-87d427915316" }
)
Write-Host "=== BESTEMD PROVENANCE INVENTARISATIE ==="
Write-Host "Alleen lezen. Geen wijziging aan Workers, GitHub, Supabase of secrets."
foreach ($target in $targets) {
  Write-Host "=== $($target.Name) ==="
  # Capture stdout separately. Wrangler warnings on stderr must not corrupt JSON.
  $stderrFile = [System.IO.Path]::GetTempFileName()
  try {
    $stdoutLines = & npx.cmd wrangler deployments list --name $target.Name --json 2>$stderrFile
    $commandStatus = $LASTEXITCODE
    if ($commandStatus -ne 0) {
      throw "Cloudflare uitlezen mislukt voor $($target.Name) (code $commandStatus); STOP."
    }
    $json = ($stdoutLines -join [Environment]::NewLine).Trim()
    if (-not $json.StartsWith('[') -or -not $json.EndsWith(']')) {
      throw "Wrangler leverde geen zuivere JSON-array voor $($target.Name); STOP."
    }
    try { $parsed = ConvertFrom-Json -InputObject $json -ErrorAction Stop }
    catch { throw "Cloudflare JSON niet leesbaar voor $($target.Name); STOP." }

    # PowerShell 5.1 and 7 enumerate JSON arrays slightly differently.
    # Explicitly unwrap a singleton nested array if necessary.
    $deploys = @($parsed)
    while ($deploys.Count -eq 1 -and $deploys[0] -is [array]) {
      $deploys = @($deploys[0])
    }
    if ($deploys.Count -eq 0) { throw "Geen deployments gevonden; STOP." }

    $sorted = @()
    foreach ($item in $deploys) {
      if ($null -eq $item -or [string]::IsNullOrWhiteSpace([string]$item.id) -or
          [string]::IsNullOrWhiteSpace([string]$item.created_on)) {
        throw "Deployment zonder ID of datum ontvangen voor $($target.Name); STOP."
      }
      $timestamp = [DateTimeOffset]::MinValue
      $culture = [System.Globalization.CultureInfo]::InvariantCulture
      $dateStyles = [System.Globalization.DateTimeStyles]::AssumeUniversal
      if (-not [DateTimeOffset]::TryParse([string]$item.created_on,$culture,$dateStyles,[ref]$timestamp)) {
        throw "Deployment bevat ongeldige datum voor $($target.Name); STOP."
      }
      $sorted += [pscustomobject]@{ Deployment=$item; Date=$timestamp }
    }
    $ordered = @($sorted | Sort-Object -Property Date -Descending)
    if ($ordered.Count -gt 1 -and $ordered[0].Date -eq $ordered[1].Date) {
      throw "Twee deployments hebben dezelfde datum; STOP."
    }
    $live = $ordered[0].Deployment
  }
  finally {
    Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
  }
  if($live.id -ne $target.Deployment -or @($live.versions).Count -ne 1 -or
     $live.versions[0].version_id -ne $target.Version -or [double]$live.versions[0].percentage -ne 100){
    throw "LIVE VERSIE AFGEWEKEN voor $($target.Name). NIET PUBLICEREN."
  }
  Write-Host "[OK] Huidige live deployment identiek aan vastgelegde inventaris."
  # This command returns version metadata but never version source code.
  $view = & npx.cmd wrangler versions view $target.Version --name $target.Name --json 2>&1
  $viewCode = $LASTEXITCODE
  $viewText = $view -join [Environment]::NewLine
  $gitCandidate = $null
  if ($viewCode -eq 0) {
    $shaMatches = [regex]::Matches($viewText,'(?i)(?:git(?:_commit|_sha|sha)|commit(?:_sha)?)["''\s:=]+([0-9a-f]{40})')
    if($shaMatches.Count -eq 1){ $gitCandidate=$shaMatches[0].Groups[1].Value.ToLowerInvariant() }
    Write-Host "[OK] Cloudflare versie-metadata opgevraagd; Git-provenance: $(if($gitCandidate){'kandidaat, nog NIET bewezen'}else{'niet in metadata'})"
  } else {
    Write-Host "[LET OP] Wrangler versions view niet beschikbaar; broncommit onbekend."
  }
  $results += [pscustomobject]@{
    worker=$target.Name
    deploymentId=$live.id
    versionId=$live.versions[0].version_id
    deployedAt=$live.created_on
    trafficPercentage=100
    possibleGitSha=$gitCandidate
    provenanceVerified=$false
  }
}
$destination=Join-Path $HOME ("BESTEMD-release-provenance-"+(Get-Date -Format "yyyyMMdd-HHmmss")+".json")
[pscustomobject]@{observedAt=(Get-Date).ToUniversalTime().ToString("o");workers=$results;note="Git SHA kandidaat is NIET bewezen. Geen automatische release vrijgave."} |
 ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $destination -Encoding UTF8
Write-Host "=== KLAAR (READ ONLY) ==="
Write-Host "Rapport: $destination"
Write-Host "Stuur alleen het rapport met versie-ID's; geen credentials, broncode of raw Wrangler output."
