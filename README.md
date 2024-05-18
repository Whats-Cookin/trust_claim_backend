# Linked Trust Backend

This is an implementation of the OpenTrustClaims schema from https://github.com/blueskyCommunity/OpenTrustClaims/blob/main/open_trust_claim.yaml, and is the backend powering https://live.linkedtrust.us 

trust_claim_backend is a Node application for adding Claims, and for presenting Nodes and Edges derived from claims in it

To generate Nodes and Edges from Claims it is also necessary to run [trust-claim-data-pipeline](https://github.com/Whats-Cookin/trust-claim-data-pipeline)

## Concept

Claim: a signed set of structured data with the raw claim or attestation, often signed on front end by the user's DID
Node: an entity that a claim is about.  This is created in the app as a view of what a claim is about.
Edge: a representation of a claim that relates to a Node or connects two Nodes.  Created in the app as a view of a claim.

## Run the application 

Running the application in docker is only important if you don't want to set up postgresql server in your pc. If you choose to not use docker in development, then set the postgresql db url and env variables in `.env` file. Check [Env variables](#env-variables).  section.

Then running below command is sufficient.

```
npm run dev
```

To run with docker, firstly, have all the env variables in `.env` and `.env.dev` file in our project root. Check [Env variables](#env-variables) for help with env variables.

Then, build the project -

```
npx prisma generate # the first time
npm run build
```

You will need docker installed in your computer. For help with installation, ask in slack.

Build the docker containers and run it.  Two options are available

### Option 1: Without the data pipeline - for viewing only

```
docker-compose up
```

### Option 2: With the data pipeline

```
cd ..
git clone git@github.com:Whats-Cookin/trust-claim-data-pipeline.git
cd trust_claim_backend
docker-compose -f docker-compose-full.yml up
```

Once the docker containers are running, install the packages and run the migration

```
npm i
npm run migrate:dev
```

Then, while developing, run

```
npm run dev:watch
```

To stop and delete the containers

```
docker-compose down
```

## JWT Token secrets

For one way hashing and comparing, jwt needs 2 environment variables. Check [Env variables](#env-variables) section for the required variables.

## Database

Database is handled with the help of prisma orm.

#### Apply migration

If migration is not for docker container then run

```
npx prisma migrate dev
```

For docker container

```
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

```
npx prisma studio
```

If using docker containers

```
npm run prisma:studio
```

After running this command prisma studio opens in port 5555.

#### Integrated seeding with Prisma Migrate:
Database seeding happens in two ways with Prisma: manually with prisma db seed and automatically in prisma migrate dev.

Run 
```
npx prisma db seed
```
or
```
npm i
prisma migrate dev
```

When you want to use prisma migrate dev without seeding, you can pass the --skip-seed flag.

## Env variables

Create a `.env` file in project root. If running with docker an additional `.env.dev` file is needed. Refer to below example for env variables:

```
PORT=9000
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/claim"
ACCESS_SECRET=dPEBknfdAcx5bir34KnX2mATWZnvM4xF
REFRESH_SECRET=opdC0LNGrZWWF0jLrPJwhLPF8aew4l3L
```

In `.env.dev`, change `DATABASE_URL` like below, everything else can be exactly like `.env`.

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/claim"
```

Value for `ACCESS_SECRET` and `REFRESH_SECRET` can be anything.

<a name="deploy"></a>
## PoC Deployment

SSH into the server with the private key. If you don't have the key, ask for it in slack.

```
ssh -l ubuntu -i [key] trustclaims.whatscookin.us
```

cd into the project

```
cd /data/trust_claim_backend
```

Pull the latest master branch from github

```
git pull origin master
```

Run this command to check for possible changes in packages, and install changed packages.

```
npm i
```

If there is any database migration, it is a good idea to backup the database.

```
sudo su postgres
pg_dump claim > /postgres/backup_filename.sql
```

Then run the following 2 commands to generate artifacts and deploy migrations.

```
npx prisma generate
npx prisma migrate deploy
```

Then, building the project is enough, because `pm2` is watching for changes.

```
npm run build
```

NOTE: Run this ONLY when the server is  down

```
pm2 start index.js --watch
```

Logs are in `/data/home/ubuntu/.pm2/logs`

To see all about the pm2 process use

```
PM2_HOME=/data/home/ubuntu/.pm2 /data/home/ubuntu/.nvm/versions/node/v16.15.1/bin/pm2 describe index
```

#### NGINX config

Nginx config is located here - `/etc/nginx/sites-available/trustclaims.whatscookin.us`. To change the config -

```
sudo vim /etc/nginx/sites-available/trustclaims.whatscookin.us
```

After changing Nginx config, test it using -

```
sudo nginx -t
```

Then reload nginx service

```
sudo systemctl reload nginx.service`
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
