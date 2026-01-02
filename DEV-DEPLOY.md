# Dev Server Deployment Notes

## Server Info
- Host: DigitalOcean (NOT AWS)
- Storage: DigitalOcean Spaces (S3-compatible)

---

## PROD DEPLOYMENT CHECKLIST

When deploying video upload to production, you need:

### 1. Create S3-compatible storage bucket
- Can use AWS S3, DigitalOcean Spaces, or any S3-compatible service
- Create a bucket for video storage
- Enable public read access or configure CDN
- Configure CORS to allow your frontend domain

### 2. Set environment variables in prod deployment config
```
LT_STORAGE_ENDPOINT=https://<region>.digitaloceanspaces.com  # or s3.amazonaws.com for AWS
LT_STORAGE_KEY=<access_key>
LT_STORAGE_SECRET=<secret_key>
LT_STORAGE_BUCKET=<bucket_name>
LT_STORAGE_REGION=<region>
LT_STORAGE_CDN_URL=https://<bucket>.<region>.cdn.digitaloceanspaces.com  # or CloudFront URL for AWS
```

### 3. CORS configuration on bucket
Allow these origins:
- `https://linkedtrust.us`
- `https://live.linkedtrust.us`
- (any other prod frontend domains)

Methods: GET, PUT, POST, DELETE, HEAD
Headers: *

### 4. Verify credentials work
Test with s3cmd or AWS CLI before deploying.

---

## Restarting PM2 Manually

Files are owned by `jenkins` user. Must use nvm to get correct Node version:

```bash
sudo -u jenkins bash -c 'export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20 && pm2 restart trust_claim_backend'
```

**DO NOT** run `pm2 restart` directly - it will use wrong Node version and crash loop.

## Environment Variables

`.env` is recreated on every Jenkins deploy from `/var/lib/jenkins/jobs/Trustclaim_backend/config.xml`.

To make permanent changes, update the Jenkins job config, not just `.env`.

### Storage Config (DigitalOcean Spaces)
```
LT_STORAGE_ENDPOINT=https://sfo3.digitaloceanspaces.com
LT_STORAGE_KEY=<access_key>
LT_STORAGE_SECRET=<secret_key>
LT_STORAGE_BUCKET=linkedtrust-dev
LT_STORAGE_REGION=sfo3
LT_STORAGE_CDN_URL=https://linkedtrust-dev.sfo3.cdn.digitaloceanspaces.com
```

## Checking Logs

```bash
sudo -u jenkins pm2 logs trust_claim_backend --lines 50
```

## Testing DO Spaces Credentials

```bash
source /data/trust_claim_backend/.env
s3cmd --access_key="$LT_STORAGE_KEY" --secret_key="$LT_STORAGE_SECRET" \
  --host="sfo3.digitaloceanspaces.com" \
  --host-bucket="%(bucket)s.sfo3.digitaloceanspaces.com" \
  --region="sfo3" \
  ls s3://linkedtrust-dev/
```
