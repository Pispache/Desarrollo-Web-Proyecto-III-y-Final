import os, time

INTERVAL = int(os.getenv("ETL_INTERVAL_SECONDS", "120"))

def run_once():
    # TODO: implement extract from SQL Server and upsert to Postgres
    print("ETL heartbeat - placeholder")

if __name__ == "__main__":
    while True:
        run_once()
        time.sleep(INTERVAL)
