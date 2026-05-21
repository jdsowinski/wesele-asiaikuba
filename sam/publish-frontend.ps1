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

$adminBucket = aws cloudformation describe-stacks `
  --stack-name $stackName `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='AdminBucketName'].OutputValue" `
  --output text

$distId = aws cloudformation describe-stacks `
  --stack-name $stackName `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" `
  --output text

$adminDistId = aws cloudformation describe-stacks `
  --stack-name $stackName `
  --region $Region `
  --profile $AwsProfile `
  --query "Stacks[0].Outputs[?OutputKey=='AdminCloudFrontDistributionId'].OutputValue" `
  --output text

if (-not $bucket) {
  throw "FrontendBucketName output not found"
}
if (-not $adminBucket) {
  throw "AdminBucketName output not found"
}
if (-not $distId) {
  throw "CloudFrontDistributionId output not found"
}

Write-Host "Uploading frontend (guest) to s3://$bucket ..." -ForegroundColor Cyan
aws s3 sync $FrontendPath "s3://$bucket" --delete --exclude "admin/*" --exclude "admin-stoly.html" --profile $AwsProfile --region $Region

Write-Host "Uploading admin panel to s3://$adminBucket ..." -ForegroundColor Cyan
aws s3 sync "$FrontendPath\admin" "s3://$adminBucket" --delete --profile $AwsProfile --region $Region

Write-Host "Setting Cache-Control=public,max-age=10 on index and gallery pages..." -ForegroundColor Cyan
aws s3 cp "$FrontendPath\index.html" "s3://$bucket/index.html" `
  --metadata-directive REPLACE `
  --cache-control "public,max-age=10,must-revalidate" `
  --content-type "text/html; charset=utf-8" `
  --profile $AwsProfile --region $Region

aws s3 cp "$FrontendPath\galeria.html" "s3://$bucket/galeria.html" `
  --metadata-directive REPLACE `
  --cache-control "public,max-age=10,must-revalidate" `
  --content-type "text/html; charset=utf-8" `
  --profile $AwsProfile --region $Region

Write-Host "Creating CloudFront invalidation (guest)..." -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $distId --paths "/*" --profile $AwsProfile

if ($adminDistId) {
  Write-Host "Creating CloudFront invalidation (admin)..." -ForegroundColor Cyan
  aws cloudfront create-invalidation --distribution-id $adminDistId --paths "/*" --profile $AwsProfile
}

Write-Host "Frontend published." -ForegroundColor Green
