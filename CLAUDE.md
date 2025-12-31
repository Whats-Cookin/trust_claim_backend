# Claude Code Notes

## Deployment (DEV Server)

**This applies to the DEV server only. Production has a different setup.**

- **Never build locally** - Jenkins handles all builds with proper nvm/Node version
- **Never restart PM2 locally** - it uses wrong Node version, breaks the app
- **Always push to dev branch** - Jenkins auto-builds and deploys on push

## Environment Variables (DEV Server)

- `.env` is **not** persisted - Jenkins recreates it on every deploy
- Env vars are hardcoded in Jenkins job shell script (not in Jenkins UI env settings)
- Location: `/var/lib/jenkins/jobs/Trustclaim_backend/config.xml`
- To add new env vars: edit the shell script's echo command that creates .env

## Video Storage

Uses generic `LT_STORAGE_*` env vars for S3-compatible storage:
- `LT_STORAGE_ENDPOINT`
- `LT_STORAGE_KEY`
- `LT_STORAGE_SECRET`
- `LT_STORAGE_BUCKET`
- `LT_STORAGE_REGION`
- `LT_STORAGE_CDN_URL`

These must be added to Jenkins config to persist across deploys.
