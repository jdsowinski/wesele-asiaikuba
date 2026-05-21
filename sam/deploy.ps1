param(
  [Parameter(Mandatory = $true)]
  [string]$AwsProfile,

  [string]$Region = "eu-central-1",
  [string]$ProjectName = "wesele-asiaikuba",
  [string]$FrontendDomain = "wesele.asiaikuba.pl",
  [string]$AssetsDomain = "assets-wesele.asiaikuba.pl",
  [string]$ApiDomain = "api-wesele.asiaikuba.pl",
  [string]$AdminDomain = "admin-wesele.asiaikuba.pl",
  [string]$WildcardDomain = "*.asiaikuba.pl"
)

$ErrorActionPreference = "Stop"

function Get-OrCreateCert {
  param([string]$Domain, [string]$CertRegion)

  $existing = aws acm list-certificates `
    --region $CertRegion `
    --profile $AwsProfile `
    --query "CertificateSummaryList[?DomainName=='$Domain'].CertificateArn" `
    --output text

  if ($existing -and $existing -ne "None" -and $existing -ne "") {
    Write-Host "  Cert for $Domain already exists in $CertRegion." -ForegroundColor Green
    return $existing
  }

  Write-Host "  Requesting new cert for $Domain in $CertRegion..." -ForegroundColor Yellow
  $arn = aws acm request-certificate `
    --domain-name $Domain `
    --validation-method DNS `
    --region $CertRegion `
    --profile $AwsProfile `
    --query CertificateArn `
    --output text

  return $arn
}

function Get-CertValidationRecord {
  param([string]$CertArn, [string]$CertRegion)

  $tries = 0
  while ($tries -lt 15) {
    $record = aws acm describe-certificate `
      --certificate-arn $CertArn `
      --region $CertRegion `
      --profile $AwsProfile `
      --query "Certificate.DomainValidationOptions[0].ResourceRecord" `
      --output json | ConvertFrom-Json

    if ($record -and $record.Name) { return $record }
    $tries++
    Write-Host "  Waiting for ACM to generate the validation record..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 4
  }
  throw "Timed out waiting for validation record for $CertArn"
}

# ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=== [1/4] ACM Certificate (wildcard) ===" -ForegroundColor Cyan



# Get or create wildcard cert in us-east-1 (for CloudFront)
$wildcardCertArn = Get-OrCreateCert -Domain $WildcardDomain -CertRegion "us-east-1"
# Get or create wildcard cert in eu-central-1 (for API Gateway)
Write-Host "\n=== [1b/4] ACM Certificate (wildcard) in eu-central-1 for API Gateway ===" -ForegroundColor Cyan
$apiCertArn = Get-OrCreateCert -Domain $WildcardDomain -CertRegion $Region

if (-not $apiCertArn -or $apiCertArn -eq "None" -or $apiCertArn -eq "") {
  throw "Failed to create ACM cert in $Region for API Gateway."
}



Write-Host ""
Write-Host "=== [2/4] DNS Validation Records ===" -ForegroundColor Cyan
Write-Host "Getting records from ACM (may take a few seconds)..." -ForegroundColor DarkGray

$wildcardRecord = Get-CertValidationRecord -CertArn $wildcardCertArn -CertRegion "us-east-1"
$wildcardRecordEu = Get-CertValidationRecord -CertArn $apiCertArn -CertRegion $Region

Write-Host ""
Write-Host "Add these CNAME records in OVH DNS panel:" -ForegroundColor Magenta
Write-Host ""
Write-Host "  [Certificate: $WildcardDomain - us-east-1]" -ForegroundColor White
Write-Host "    Name:  $($wildcardRecord.Name)" -ForegroundColor Yellow
Write-Host "    Value: $($wildcardRecord.Value)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [Certificate: $WildcardDomain - $Region]" -ForegroundColor White
Write-Host "    Name:  $($wildcardRecordEu.Name)" -ForegroundColor Yellow
Write-Host "    Value: $($wildcardRecordEu.Value)" -ForegroundColor Yellow
Write-Host ""

# ────────────────────────────────────────────────────────────────


Write-Host ""
Write-Host "=== [3/4] Waiting for certificate validation ===" -ForegroundColor Cyan
Write-Host "  Waiting for wildcard cert ($WildcardDomain) in us-east-1..."
aws acm wait certificate-validated --certificate-arn $wildcardCertArn --region "us-east-1" --profile $AwsProfile
Write-Host "  Wildcard cert validated in us-east-1." -ForegroundColor Green
Write-Host "  Waiting for wildcard cert ($WildcardDomain) in $Region..."
aws acm wait certificate-validated --certificate-arn $apiCertArn --region $Region --profile $AwsProfile
Write-Host "  Wildcard cert validated in $Region." -ForegroundColor Green

# ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=== [4/4] SAM build + deploy ===" -ForegroundColor Cyan

Set-Location $PSScriptRoot
sam build --template-file .\template.yaml


$paramOverrides = "ProjectName=$ProjectName FrontendDomain=$FrontendDomain AssetsDomain=$AssetsDomain ApiDomain=$ApiDomain AdminDomain=$AdminDomain CloudFrontCertificateArn=$wildcardCertArn AssetsCloudFrontCertificateArn=$wildcardCertArn ApiRegionalCertificateArn=$apiCertArn"

sam deploy `
  --stack-name "$ProjectName-stack" `
  --region $Region `
  --profile $AwsProfile `
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM `
  --resolve-s3 `
  --no-confirm-changeset `
  --no-fail-on-empty-changeset `
  --parameter-overrides $paramOverrides

# ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== [5/5] Add these routing CNAMEs in OVH ===" -ForegroundColor Magenta

$cfTarget = aws cloudformation describe-stacks `
  --stack-name "$ProjectName-stack" `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" `
  --output text

$apiTarget = aws cloudformation describe-stacks `
  --stack-name "$ProjectName-stack" `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='ApiCustomDomainTarget'].OutputValue" `
  --output text

$assetsTarget = aws cloudformation describe-stacks `
  --stack-name "$ProjectName-stack" `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='AssetsCloudFrontDomainName'].OutputValue" `
  --output text

$adminTarget = aws cloudformation describe-stacks `
  --stack-name "$ProjectName-stack" `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='AdminCloudFrontDomainName'].OutputValue" `
  --output text

Write-Host ""
Write-Host "  $FrontendDomain  ->  CNAME  ->  $cfTarget" -ForegroundColor Green
Write-Host "  $ApiDomain  ->  CNAME  ->  $apiTarget" -ForegroundColor Green
Write-Host "  $AssetsDomain  ->  CNAME  ->  $assetsTarget" -ForegroundColor Green
Write-Host "  $AdminDomain  ->  CNAME  ->  $adminTarget" -ForegroundColor Green
Write-Host ""
Write-Host "After DNS propagation, run:" -ForegroundColor Yellow
Write-Host "  .\publish-frontend.ps1 -AwsProfile $AwsProfile" -ForegroundColor Yellow
