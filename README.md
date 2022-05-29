## Local Ceramic node

To run this, running a ceramic node is important.

#### Install ceramic cli

```
npm install -g @ceramicnetwork/cli
```

#### Run ceramic

```
ceramic daemon
```

#### Creating a ceramic datamodel

```
npm run create_model
```

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
DID_KEY=743470467f09759cf83ca2c61a651a68e4067afddffaff0e918ccef55286bf88
DATABASE_URL=file:./dev.db
```

To create the `DID_KEY`, take help of glaze cli. Install glaze cli using following command.

```
npm install --global @glazed/cli
```

#### Then create the a DID

```
glaze did:create
```

Something like this will be printed

```
Created DID did:key:z6MkiTnTkbtkpLd7zk5Yfuq5C7EHeKQmPNPor26eqad2npmP with seed 6f38c7993a868d1787c2d57b5c4e500ca8cfc85ec984c2aa415414f055a40c8c
```

Take the seed portion, and set it as the env variable `DID_KEY`.

## Run the application in development environment

```
npm run dev
```
