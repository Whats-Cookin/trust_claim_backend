This is an implementation of the OpenTrustClaims schema from https://github.com/blueskyCommunity/OpenTrustClaims/blob/main/open_trust_claim.yaml

## Run the application

Running in application in docker is only important if you don't want to set up postgresql server in your pc. If you choose to not use docker in development, then set the postgresql db url in .env file. Check [Env variables](#env-variables) section.

Create a `.env` file in project root directory. And refer to [Env variables](#env-variables) section.

Then running below command is sufficient.

```
npm run dev
```

To run with docker, firstly, have all the [env variables](#env-variables) in a `.env` file in our project root.

Then, build the project -

```
npm run build
```

You will need docker installed in your computer. For help with installation, ask in slack.

Build the docker containers and run it.

```
docker-compose up
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

```
npx prisma migrate dev
```

#### To check the database, use the goodness of prisma studio

```
npx prisma studio
```

After running this command prisma studio opens in port 5555.

## Env variables

Create a `.env` file in project root. Refer to below example for env variables:

```
PORT=9000
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/claim"
ACCESS_SECRET=dPEBknfdAcx5bir34KnX2mATWZnvM4xF
REFRESH_SECRET=opdC0LNGrZWWF0jLrPJwhLPF8aew4l3L
```

Value for `ACCESS_SECRET` and `REFRESH_SECRET` can be anything.

## PoC Deployment

See `ssh -l ubuntu -i .ssh/trustclaim.pem trustclaims.whatscookin.us`
