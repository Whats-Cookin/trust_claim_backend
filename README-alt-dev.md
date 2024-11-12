Alternate instructions

Run

`docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name postgres-db postgres`

ensure you have a .env file

```
PORT=9000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/claim"
ACCESS_SECRET=dPEBknfdAcx5bir34KnX2mATWZnvM4xF
REFRESH_SECRET=opdC0LNGrZWWF0jLrPJwhLPF8aew4l3L
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
