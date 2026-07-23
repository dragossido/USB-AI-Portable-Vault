param([int]$Port = 8090)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = Join-Path $Root "web"
$ConfigRoot = Join-Path $Root "config"
$ConversationRoot = Join-Path $Root "data\conversations"
$LogRoot = Join-Path $Root "logs"
$VaultPath = Join-Path $ConfigRoot "vault.enc.json"
$LogPath = Join-Path $LogRoot "server.log"

New-Item -ItemType Directory -Force -Path $ConfigRoot, $ConversationRoot, $LogRoot | Out-Null
"USB LLM server started: $(Get-Date)" | Set-Content $LogPath

function Write-JsonResponse {
  param($Context, [int]$StatusCode, $Object)
  $json = $Object | ConvertTo-Json -Depth 50 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = "application/json; charset=utf-8"
  $Context.Response.ContentLength64 = $bytes.Length
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.OutputStream.Close()
}

function Read-RequestJson {
  param($Request)
  $reader = [IO.StreamReader]::new($Request.InputStream, $Request.ContentEncoding)
  try { return ($reader.ReadToEnd() | ConvertFrom-Json) }
  finally { $reader.Close() }
}

function Get-SafeId {
  param([string]$Id)
  if ($Id -notmatch '^[a-zA-Z0-9-]{1,120}$') {
    throw "Invalid identifier."
  }
  return $Id
}

function Get-ContentType {
  param([string]$Path)
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js"   { "application/javascript; charset=utf-8" }
    ".css"  { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    default { "application/octet-stream" }
  }
}

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Start-Process "http://127.0.0.1:$Port/"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()

    try {
      $request = $context.Request
      $path = $request.Url.AbsolutePath

      if ($path -eq "/api/vault/exists") {
        Write-JsonResponse $context 200 @{ exists = (Test-Path $VaultPath -PathType Leaf) }
        continue
      }

      if ($path -eq "/api/vault/read") {
        if (-not (Test-Path $VaultPath -PathType Leaf)) {
          Write-JsonResponse $context 404 @{ error = "Vault not found." }
          continue
        }
        $raw = Get-Content $VaultPath -Raw | ConvertFrom-Json
        Write-JsonResponse $context 200 $raw
        continue
      }

      if ($path -eq "/api/vault/write" -and $request.HttpMethod -eq "POST") {
        $body = Read-RequestJson $request
        $body | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $VaultPath
        Write-JsonResponse $context 200 @{ ok = $true }
        continue
      }

      if ($path -eq "/api/conversations/list") {
        $items = @()
        Get-ChildItem $ConversationRoot -Filter "*.enc.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
          $items += @{ id = $_.BaseName.Replace(".enc", ""); modified = $_.LastWriteTimeUtc.ToString("o") }
        }
        Write-JsonResponse $context 200 @{ items = $items }
        continue
      }

      if ($path -eq "/api/conversations/read") {
        $id = Get-SafeId $request.QueryString["id"]
        $file = Join-Path $ConversationRoot "$id.enc.json"
        if (-not (Test-Path $file -PathType Leaf)) {
          Write-JsonResponse $context 404 @{ error = "Conversation not found." }
          continue
        }
        $raw = Get-Content $file -Raw | ConvertFrom-Json
        Write-JsonResponse $context 200 $raw
        continue
      }

      if ($path -eq "/api/conversations/write" -and $request.HttpMethod -eq "POST") {
        $id = Get-SafeId $request.QueryString["id"]
        $file = Join-Path $ConversationRoot "$id.enc.json"
        $body = Read-RequestJson $request
        $body | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $file
        Write-JsonResponse $context 200 @{ ok = $true }
        continue
      }

      if ($path -eq "/api/conversations/delete" -and $request.HttpMethod -eq "POST") {
        $id = Get-SafeId $request.QueryString["id"]
        $file = Join-Path $ConversationRoot "$id.enc.json"
        Remove-Item $file -Force -ErrorAction SilentlyContinue
        Write-JsonResponse $context 200 @{ ok = $true }
        continue
      }

      if ($path -eq "/api/chat" -and $request.HttpMethod -eq "POST") {
        $body = Read-RequestJson $request
        if (-not $body.baseUrl) {
          Write-JsonResponse $context 400 @{ error = "API base URL is missing." }
          continue
        }

        $endpoint = $body.baseUrl.TrimEnd("/") + "/chat/completions"
        $headers = @{ "Content-Type" = "application/json" }
        if ($body.apiKey) { $headers["Authorization"] = "Bearer " + $body.apiKey }

        $payload = @{
          model = $body.model
          messages = $body.messages
          temperature = 0.7
          stream = $false
        } | ConvertTo-Json -Depth 60 -Compress

        try {
          $result = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $payload -TimeoutSec 1200
          Write-JsonResponse $context 200 $result
        }
        catch {
          $message = $_.Exception.Message
          Add-Content $LogPath "Provider error: $message"
          Write-JsonResponse $context 502 @{ error = "Provider request failed: $message" }
        }
        continue
      }

      $relative = $path.TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }

      $candidate = [IO.Path]::GetFullPath((Join-Path $WebRoot $relative))
      $webFull = [IO.Path]::GetFullPath($WebRoot)
      if (-not $candidate.StartsWith($webFull, [StringComparison]::OrdinalIgnoreCase)) {
        $context.Response.StatusCode = 403
        $context.Response.Close()
        continue
      }

      if (-not (Test-Path $candidate -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $context.Response.Close()
        continue
      }

      $bytes = [IO.File]::ReadAllBytes($candidate)
      $context.Response.StatusCode = 200
      $context.Response.ContentType = Get-ContentType $candidate
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $context.Response.OutputStream.Close()
    }
    catch {
      Add-Content $LogPath "Request error: $($_.Exception.Message)"
      try { Write-JsonResponse $context 500 @{ error = $_.Exception.Message } } catch {}
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
