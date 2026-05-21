param(
  [Parameter(Mandatory = $true)]
  [string]$AwsProfile,

  [string]$Region = "eu-central-1",
  [string]$ProjectName = "wesele-asiaikuba",

  [string]$FrontendDomain = "wesele.asiaikuba.pl",
  [string]$ApiDomain = "api-wesele.asiaikuba.pl",

  [string]$CloudFrontCertificateArn = "",
  [string]$ApiRegionalCertificateArn = ""
)

$ErrorActionPreference = "Stop"

Write-Host "[1/3] SAM build..." -ForegroundColor Cyan
sam build --template-file .\template.yaml

Write-Host "[2/3] SAM deploy..." -ForegroundColor Cyan
sam deploy `
  --stack-name "$ProjectName-stack" `
  --region "$Region" `
  --profile "$AwsProfile" `
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM `
  --resolve-s3 `
  --no-confirm-changeset `
  --no-fail-on-empty-changeset `
  --parameter-overrides `
    ProjectName="$ProjectName" `
    FrontendDomain="$FrontendDomain" `
    ApiDomain="$ApiDomain" `
    CloudFrontCertificateArn="$CloudFrontCertificateArn" `
    ApiRegionalCertificateArn="$ApiRegionalCertificateArn"

Write-Host "[3/3] Done. Next: publish frontend." -ForegroundColor Green
Write-Host "Run: .\publish-frontend.ps1 -AwsProfile $AwsProfile -Region $Region -ProjectName $ProjectName" -ForegroundColor Yellow
