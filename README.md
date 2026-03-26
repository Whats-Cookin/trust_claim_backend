# Linked Trust Backend

This is an implementation of the OpenTrustClaims schema from https://github.com/blueskyCommunity/OpenTrustClaims/blob/main/open_trust_claim.yaml, and is the backend powering https://live.linkedtrust.us and [dev server](https://dev.linkedtrust.us)

trust_claim_backend is a Node application for adding Claims, and for presenting Nodes and Edges derived from claims in it

To generate Nodes and Edges from Claims it is also necessary to run [trust-claim-data-pipeline](https://github.com/Whats-Cookin/trust-claim-data-pipeline)

## API Documentation

**Interactive API documentation is available at `/api/docs` when the server is running.**

- Development: http://localhost:3000/api/docs
- Production: https://live.linkedtrust.us/api/docs

The documentation includes:
- All endpoints (legacy v3 and modern v4)
- Request/response schemas
- Authentication details
- Try-it-out functionality

See [SWAGGER_SETUP.md](./SWAGGER_SETUP.md) for more details.

## ATProto Integration & SDK

The **[claim-atproto](https://github.com/Cooperation-org/claim-atproto)** repository is the TypeScript SDK for `com.linkedclaims.claim` on ATProto. Its README is the main place for **reading and writing claims**, the **AppView** architecture (how this backend indexes Jetstream and deduplicates by `claimAddress`), the **lexicon schema**, LinkedTrust HTTP helpers (`/api/atproto/*`), OAuth (`com.linkedclaims.authFull`), and Node.js examples.

## Concepts

Claim: a signed set of structured data with the raw claim or attestation, often signed on front end by the user's DID
Node: an entity that a claim is about. This is created in the app as a view of what a claim is about.
Edge: a representation of a claim that relates to a Node or connects two Nodes. Created in the app as a view of a claim.

## Dev Server (VM 200 — dev.linkedtrust.us)

Repo is checked out at `/opt/shared/repos/trust_claim_backend/`. Runs as a systemd service.

**If you're already on the dev server:**

```bash
cd /opt/shared/repos/trust_claim_backend
git pull
npm run build
sudo systemctl restart tmp-trustclaim-dev-backend.service
```

**If you're not on the dev server:**

```bash
ssh <your-user>@dev.linkedtrust.us
# then same commands as above
```

Service: `tmp-trustclaim-dev-backend.service` (runs `build/index.js` on port 9000)

## Production (VM 508 — live.linkedtrust.us)

Runs via PM2 on VM 508 (10.0.0.158). CI/CD is not yet set up — deploys are manual.

```bash
ssh ubuntu@10.0.0.158
cd /data/trust_claim_backend
git pull
npm i
npm run build    # pm2 watches for changes
```

## Run the application locally

Running the application in docker is only important if you don't want to set up postgresql server in your pc. If you choose to not use docker in development, then set the postgresql db url and env variables in `.env` file. Check [Env variables](#env-variables). section.

Then running below command is sufficient.

```bash
npm run dev
```

To run with docker, firstly, have all the env variables in `.env` and `.env.dev` file in our project root. Check [Env variables](#env-variables) for help with env variables.

Then, build the project -

```bash
npx prisma generate # the first time
npm run build
```

You will need docker installed in your computer. For help with installation, ask in slack.

Build the docker containers and run it. Two options are available

### Option 1: Without the data pipeline - for viewing only

```bash
docker compose --profile prod up
```

### Option 2: With the data pipeline

```bash
cd ..
git clone git@github.com:Whats-Cookin/trust-claim-data-pipeline.git
cd trust_claim_backend

# Run in development mode
docker compose --profile dev up --watch
# Run in production mode
# docker compose --profile prod up
```

> [!TIP]
> Ask in Slack for the `claim.backup` file to populate the database.
>
> Add the file to the parent directory of the project, uncomment the `- ../claim.backup:/claim.backup`
> line in `docker-compose.yml` and rebuild the image `docker compose build`.
>
> Jump in the postgres container with `docker exec -it postgres bash` and run `pg_restore -x --no-owner -U postgres -d claim claim.backup` to populate the database.

Once the docker containers are running, install the packages and run the migration

```bash
npm i
npm run migrate:dev
```

Then, while developing, run

```bash
npm run dev:watch
```

To stop and delete the containers

```bash
docker compose down
```

## JWT Token secrets

For one way hashing and comparing, jwt needs 2 environment variables. Check [Env variables](#env-variables) section for the required variables.

## Database

Database is handled with the help of prisma orm.

#### Apply migration

**_ NOTE NOTE NOTE : the migrations in prod server are currently NOT working automatically 8/1/2024 _**
**_ the migration in the prisma/migrations folder was applied manually _**

If migration is not for docker container then run

```bash
npx prisma migrate dev
```

For docker container

```bash
npx dotenv -e .env.dev -- npx prisma migrate dev --name {name of the migration}
```

#### Database Indexes

To match production optimizations, run these commands in your local PostgreSQL database:

Enable `pg_trgm` Extension (Required for GIN Indexes):

Run thos command in your local PostgreSQL database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Create GIN Indexes on Node Table:
For name column:

```sql
CREATE INDEX idx_name ON "Node" USING GIN (name gin_trgm_ops);
```

For nodeUri column:

```sql
CREATE INDEX idx_nodeUri ON "Node" USING GIN ("nodeUri" gin_trgm_ops);
```

For descrip column:

```sql
CREATE INDEX idx_descrip ON "Node" USING GIN ("descrip" gin_trgm_ops);
```

These steps ensure your local DB mirrors production's text search optimizations.

#### To check the database, use the goodness of prisma studio

If not using docker containers

```bash
npx prisma studio
```

If using docker containers

```bash
npm run prisma:studio
```

After running this command prisma studio opens in port 5555.

#### Integrated seeding with Prisma Migrate:

Database seeding happens in two ways with Prisma: manually with prisma db seed and automatically in prisma migrate dev.

Run

```bash
npx prisma db seed
```

or

```bash
npm i
prisma migrate dev
```

When you want to use prisma migrate dev without seeding, you can pass the --skip-seed flag.

## Env variables

Create a `.env` file in project root. If running with docker an additional `.env.dev` file is needed. Refer to below example for env variables:

```bash
PORT=9000
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/claim"

ACCESS_SECRET='...'
REFRESH_SECRET='...'

# Video storage (S3-compatible, e.g. DigitalOcean Spaces)
LT_STORAGE_ENDPOINT='https://sfo3.digitaloceanspaces.com'
LT_STORAGE_KEY='...'
LT_STORAGE_SECRET='...'
LT_STORAGE_BUCKET='linkedtrust-dev'
LT_STORAGE_REGION='sfo3'
LT_STORAGE_CDN_URL='https://linkedtrust-dev.sfo3.cdn.digitaloceanspaces.com'

DATA_PIPELINE_MS='http://trust-claim-data-pipeline:5000'
```

In `.env.dev`, change `DATABASE_URL` like below, everything else can be exactly like `.env`.

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/claim"
```

Value for `ACCESS_SECRET` and `REFRESH_SECRET` can be anything.

<a name="Review"></a>


## To review the server files


## Prod Troubleshooting (VM 508)

```bash
pm2 status index
pm2 logs trust_claim_backend
```

If PM2 process is down:
```bash
pm2 start build/index.js --name trust_claim_backend --cwd /data/trust_claim_backend
pm2 save
```

If database migration is needed, back up first:
```bash
sudo su postgres
pg_dump claim > /postgres/backup_filename.sql
exit
npx prisma generate
npx prisma migrate deploy
```

## add database into your docker

get docker id

```bash
docker ps
```

copy db into your docker

```bash
docker cp <path>/trustclaims.sql <id>:/tmp/dump_file
```

restore the db file

```bash
docker exec -it <id> psql -U postgres -d claim -f /tmp/dump_file
```

Alternate instructions

Run

`docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name postgres-db postgres`

ensure you have a .env file

```
PORT=9000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/claim"
ACCESS_SECRET=**add_your_secret_keys_here**
REFRESH_SECRET=**add_your_secret_keys_here**
```

then run

`npm run dev`

OR

`npm run inspect`. to be able to connect with remote debugger

OR

run from within an IDE such as webstorm with simple configuration such as

<img width="852" alt="image" src="https://user-images.githubusercontent.com/798887/232255771-e3cf52db-ece2-48b0-b67f-cd8edec39776.png">

---

you may also have to copy .env to .env.dev

and run

`npm run migrate:dev`

to set up the initial database

## Multiple OAuth Apps Support

The backend supports multiple OAuth applications via the auth_apps table - see `prisma/protected/app_snippets.sql` for credential management.

### OAuth Configuration for Multiple Frontends

The backend can accept OAuth tokens from multiple client applications (e.g., Certify, Talent, etc.) using two approaches:

#### Option 1: Shared OAuth Credentials (Simple)
All frontends use the **same Google/LinkedIn OAuth Client ID**:

```bash
# Backend .env
GOOGLE_CLIENT_ID=shared-client-id
GOOGLE_CLIENT_SECRET=shared-secret
```

All frontends must use these same credentials.

#### Option 2: Multiple Client IDs (Advanced)
Backend can accept tokens from multiple OAuth apps:

```bash
# Backend .env
GOOGLE_CLIENT_ID=primary-client-id
GOOGLE_CLIENT_SECRET=primary-secret
ALLOWED_CLIENT_ID_2=secondary-client-id  # For additional frontend apps
```

The backend's `authApi.ts` validates tokens against both client IDs (see line 45).

**TODO for Future**: Build an admin interface to manage OAuth client IDs dynamically via the `auth_apps` table, allowing registration of new frontend applications without environment variable changes.
