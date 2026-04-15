import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

def init_db():
    # Parse DATABASE_URL manually for initialization
    # Format: mysql+aiomysql://user:password@host:port/dbname
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url.startswith("mysql"):
        print("Error: DATABASE_URL must start with 'mysql'")
        return

    # Clean the URL to get components
    # Using a simple parser for this script
    import re
    match = re.search(r"mysql\+aiomysql://(.*?):(.*?)@(.*?):(.*?)/(.*)", db_url)
    if not match:
        # Try without port
        match = re.search(r"mysql\+aiomysql://(.*?):(.*?)@(.*?)/(.*)", db_url)
        if match:
            user, password, host, dbname = match.groups()
            port = 3306
        else:
            print("Error parsing DATABASE_URL. Ensure it follows: mysql+aiomysql://user:password@host:port/dbname")
            return
    else:
        user, password, host, port, dbname = match.groups()
        port = int(port)

    schema_path = os.path.join(os.path.dirname(__file__), "..", "data-pipeline", "sql", "schema_mysql.sql")
    if not os.path.exists(schema_path):
        print(f"Error: {schema_path} not found.")
        return

    with open(schema_path, 'r', encoding='utf-8') as f:
        sql_script = f.read()

    print(f"Connecting to MySQL at {host}...")
    try:
        # Connect without dbname first to create it if needed
        conn = pymysql.connect(
            host=host,
            user=user,
            password=password,
            port=port,
            autocommit=True
        )
        cursor = conn.cursor()
        
        print(f"Creating database {dbname} if not exists...")
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {dbname}")
        conn.select_db(dbname)

        print("Executing schema script...")
        # Split by semicolon to execute one by one
        # Note: This is a simple split and may fail on complex scripts with semicolons in strings
        for statement in sql_script.split(';'):
            if statement.strip():
                cursor.execute(statement)
        
        print("Success! Database initialized.")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    init_db()
