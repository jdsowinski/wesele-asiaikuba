param(
  [Parameter(Mandatory = $true)]
  [string]$AwsProfile,

  [string]$Region = "eu-central-1",
  [string]$ProjectName = "wesele-asiaikuba",
  [string]$FrontendPath = "..\frontend"
)

$ErrorActionPreference = "Stop"

$stackName = "$ProjectName-stack"

Write-Host "Reading stack outputs..." -ForegroundColor Cyan
$bucket = aws cloudformation describe-stacks `
  --stack-name $stackName `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" `
  --output text

$distId = aws cloudformation describe-stacks `
  --stack-name $stackName `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" `
  --output text

if (-not $bucket) {
  throw "FrontendBucketName output not found"
}
if (-not $distId) {
  throw "CloudFrontDistributionId output not found"
}

Write-Host "Uploading frontend to s3://$bucket ..." -ForegroundColor Cyan
aws s3 sync $FrontendPath "s3://$bucket" --delete --profile $AwsProfile --region $Region

Write-Host "Creating CloudFront invalidation..." -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $distId --paths "/*" --profile $AwsProfile

Write-Host "Frontend published." -ForegroundColor Green
