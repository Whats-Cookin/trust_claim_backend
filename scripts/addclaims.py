import urllib
import pandas as pd
import sys
import getopt
import psycopg2
from dotenv import dotenv_values

config = dotenv_values("../.env")


def get_db_connection():
    conn = psycopg2.connect(config.get("DATABASE_URL"))
    return conn


def db_get_one(query: str):
    conn = None
    res = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(query)
        res = cur.fetchone()

        cur.close()
    except (Exception, psycopg2.DatabaseError) as error:
        print(error)
    finally:
        if conn is not None:
            conn.close()
    return res


def db_post_many(query, values):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.executemany(query, values)
        conn.commit()

    except (Exception, psycopg2.Error) as error:
        print("Failed inserting {}".format(error))

    finally:
        if conn:
            cursor.close()
            conn.close()


def main(argv):
    arg_file = ""
    arg_subject = ""
    arg_qualifier = ""
    arg_claim = ""
    arg_aspect = ""
    arg_rating = ""
    arg_source = ""
    arg_confidence = ""
    arg_help = f"{argv[0]} -f <filepath> -s <subject> -q <qualifier> -c <claim> -a <aspect> -r <rating> -S <source> -C <confidence>"

    try:
        opts, _ = getopt.getopt(argv[1:], "hf:s:q:c:a:r:S:C:", ["help", "file=", "subject=",
                                "qualifier=", "claim=", "aspect=", "rating=", "source=", "confidence="])
    except Exception as e:
        print(arg_help)
        sys.exit(2)

    for opt, arg in opts:
        if opt in ("-h", "--help"):
            print(arg_help)
            sys.exit(2)
        elif opt in ("-f", "--file"):
            arg_file = arg
        elif opt in ("-s", "--subject"):
            arg_subject = arg
        elif opt in ("-q", "--qualifier"):
            arg_qualifier = arg
        elif opt in ("-c", "--claim"):
            arg_claim = arg
        elif opt in ("-a", "--aspect"):
            arg_aspect = arg
        elif opt in ("-r", "--rating"):
            arg_rating = int(arg)
        elif opt in ("-S", "--source"):
            arg_source = arg
        elif opt in ("-C", "--confidence"):
            print("confidence arg", arg)
            arg_confidence = float(arg)

    if not arg_file:
        print("Missing required argument -f (filepath).")
        sys.exit(2)
    if not arg_subject:
        print("Missing required argument -s (subject).")
        sys.exit(2)
    if not arg_claim:
        print("Missing required argument -c (claim).")
        sys.exit(2)

    try:
        df = pd.read_csv(arg_file)
    except FileNotFoundError:
        print(f"File not found. Is \"{arg_file}\" a valid path?")
        sys.exit(2)
    except Exception as e:
        print(f"{str(e)}")
        sys.exit(2)

    spider = db_get_one("""SELECT * FROM "User" WHERE name='SPIDER'""")
    spider_id = spider[0]

    values = []
    for _, row in df.iterrows():
        try:
            sub = row[arg_subject]
            subject = "http://trustclaims.whatscookin.us/local/company/" + urllib.parse.quote(sub)
            qualifier = row[arg_qualifier]
            issuer_id = f"http://trustclaims.whatscookin.us/users/{spider_id}"

            values.append((subject, qualifier, arg_claim, arg_aspect,
                           arg_rating, arg_source, arg_confidence, spider_id, issuer_id, 'URL'))

        except Exception as e:
            print("Error, ", type(e))

    query = """INSERT INTO "Claim" (subject, qualifier, claim, aspect, "reviewRating", source, confidence, "userId", "issuerId", "issuerIdType") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"""
    db_post_many(query, values)


if __name__ == "__main__":
    main(sys.argv)
