Alternate instructions

Run

`docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name postgres-db postgres`

ensure you have a .env file

```
PORT=9000
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/claim"
ACCESS_SECRET=dPEBknfdAcx5bir34KnX2mATWZnvM4xF
REFRESH_SECRET=opdC0LNGrZWWF0jLrPJwhLPF8aew4l3L
```

then run 

`npm run dev`
