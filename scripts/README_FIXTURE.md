## How to create the fixture data


On a server with data:
```

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d claim -A -f make_fixture.sql > fixture_data.txt

python convert_to_inserts.py  # creates fixture_data.sql

```

## Load the fixture data into local db

If using postgres in a docker container,

```

docker cp fixture_data postgres:/
docker exec postgres psql -U postgres -d claim -f /fixture_data/import_fixture.sql

```
