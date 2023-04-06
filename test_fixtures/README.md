# How to Load ClaimRds PostgreSQL Database File Backup in Localhost Database

This guide will walk you through the steps required to load a PostgreSQL database file backup into a local PostgreSQL database engine. The backup file is assumed to be located inside the test_fixtures folder of a GitHub repository.

## Prerequisites

Before you start, you will need the following:
- PostgreSQL installed on your local machine.
- The pg_restore command-line tool installed on your machine.
- The PostgreSQL database backup file that you want to load.


### Steps

1. Clone the GitHub repository that contains the database backup file.
-  Open a terminal window and navigate to the directory where you want to clone the repository.
- Then run the following command:
 
```
git clone https://github.com/Whats-Cookin/trust_claim_backend.git

```

2. Navigate to the test_fixtures folder inside the cloned repository:

```
cd trust_claim_backend/test_fixtures
```

3. Start the PostgreSQL server on your local machine if it is not already running.

- Create a new PostgreSQL database:

```
createdb <database_name>
```

- Replace <database_name> with a name of your choice.

4. Load the database backup file into the new database using the pg_restore command-line tool:

```
pg_restore --dbname=<database_name> <backup_file_name>
```

- Replace <database_name> with the name of the database you created in step 4
- <backup_file_name> with the name of the PostgreSQL database backup file that you want to load [claimbackup.dump].

[ Note:] If the backup file is compressed, you may need to add the --clean option to the pg_restore command to remove any existing objects in the database before loading the backup.

- Verify that the data has been loaded into the new database by connecting to the database and running some SQL queries.

```
psql <database_name>
```

- This will connect you to the new database. You can then run SQL queries to check that the data has been loaded correctly.

```
SELECT * FROM <table_name>;

```

- Replace <table_name> with the name of a table in the database.

```
You're done! You have successfully loaded a PostgreSQL database backup file into a local PostgreSQL database engine.

```

#### Conclusion
In this guide, we have walked you through the steps required to load a PostgreSQL database backup file into a local PostgreSQL database engine. By following these steps, you can easily transfer data between databases or restore a database from a backup.