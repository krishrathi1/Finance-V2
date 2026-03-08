import sqlite3
import os

db_path = "financial_forensics.db"
schema_path = "../data-pipeline/sql/schema.sql"

if not os.path.exists(schema_path):
    print(f"Error: {schema_path} not found.")
    exit(1)

with open(schema_path, 'r', encoding='utf-8') as f:
    sql_script = f.read()

# Connect to the database (creates it if it doesn't exist)
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Execute the SQL script
    cursor.executescript(sql_script)
    conn.commit()
    print("Schema executed successfully.")
except sqlite3.Error as e:
    print(f"An error occurred: {e}")
finally:
    conn.close()
