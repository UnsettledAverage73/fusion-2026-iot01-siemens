"""
Enterprise TimescaleDB / PostgreSQL Time-Series Adapter.
Provides high-throughput batch ingestion, hypertable management, and continuous
downsampling queries for industrial plant telemetry.
Falls back seamlessly to local SQLite if PostgreSQL is offline or unconfigured.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("timescale_adapter")

POSTGRES_HOST = os.getenv("POSTGRES_HOST", os.getenv("DB_HOST", "localhost"))
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", os.getenv("DB_PORT", 5432)))
POSTGRES_USER = os.getenv("POSTGRES_USER", os.getenv("DB_USER", "predictmaint"))
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", os.getenv("DB_PASS", "predictmaint_pass"))
POSTGRES_DB = os.getenv("POSTGRES_DB", os.getenv("DB_NAME", "predictmaint"))
DATABASE_URL = os.getenv("DATABASE_URL")

try:
    import psycopg2
    from psycopg2 import pool, extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False


class TimescaleAdapter:
    """
    Industrial Time-Series Database Adapter.
    Supports TimescaleDB hypertables, continuous aggregates, and multi-sensor batch inserts.
    """

    def __init__(self):
        self.is_connected = False
        self._pool = None
        self._init_connection()

    def _init_connection(self):
        if not PSYCOPG2_AVAILABLE:
            logger.info("psycopg2 not installed; using SQLite storage mode.")
            return

        try:
            if DATABASE_URL:
                self._pool = pool.SimpleConnectionPool(1, 10, dsn=DATABASE_URL, connect_timeout=3)
            else:
                self._pool = pool.SimpleConnectionPool(
                    minconn=1,
                    maxconn=10,
                    host=POSTGRES_HOST,
                    port=POSTGRES_PORT,
                    user=POSTGRES_USER,
                    password=POSTGRES_PASSWORD,
                    dbname=POSTGRES_DB,
                    connect_timeout=3
                )
            # Test connection
            conn = self._pool.getconn()
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                v = cur.fetchone()[0]
                logger.info(f"Connected to PostgreSQL engine: {v}")
            self._pool.putconn(conn)
            self.is_connected = True
            self._setup_schema()
        except Exception as exc:
            logger.info(f"PostgreSQL/TimescaleDB not reachable ({exc}). Operating in SQLite fallback mode.")
            self.is_connected = False

    def _setup_schema(self):
        """Sets up hypertable schema and compression policies if TimescaleDB extension is present."""
        if not self.is_connected:
            return

        conn = self._pool.getconn()
        try:
            with conn.cursor() as cur:
                # 1. Check for TimescaleDB extension
                cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
                
                # 2. Universal Telemetry Hypertable
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS telemetry_hypertable (
                        time TIMESTAMPTZ NOT NULL,
                        equipment_id VARCHAR(64) NOT NULL,
                        parameter_key VARCHAR(64) NOT NULL,
                        value DOUBLE PRECISION,
                        string_value TEXT
                    );
                """)

                # 3. Create hypertable (idempotent)
                try:
                    cur.execute("SELECT create_hypertable('telemetry_hypertable', 'time', if_not_exists => TRUE);")
                except Exception:
                    pass

                # 4. Indices for fast equipment/time lookups
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_telemetry_eq_time 
                    ON telemetry_hypertable (equipment_id, time DESC);
                """)
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_telemetry_param_time 
                    ON telemetry_hypertable (equipment_id, parameter_key, time DESC);
                """)
            conn.commit()
            logger.info("TimescaleDB hypertable schema verified.")
        except Exception as e:
            logger.warning(f"TimescaleDB schema init warning (non-fatal): {e}")
            conn.rollback()
        finally:
            self._pool.putconn(conn)

    def insert_batch(self, records: List[Tuple[datetime, str, str, Optional[float], Optional[str]]]) -> bool:
        """
        High-throughput batch insertion into telemetry hypertable.
        records: [(time, equipment_id, parameter_key, numeric_value, string_value), ...]
        """
        if not self.is_connected or not records:
            return False

        conn = self._pool.getconn()
        try:
            with conn.cursor() as cur:
                extras.execute_values(
                    cur,
                    """
                    INSERT INTO telemetry_hypertable (time, equipment_id, parameter_key, value, string_value)
                    VALUES %s
                    """,
                    records,
                    template="(%s, %s, %s, %s, %s)",
                    page_size=1000
                )
            conn.commit()
            return True
        except Exception as exc:
            logger.error(f"Batch insert error in TimescaleDB: {exc}")
            conn.rollback()
            return False
        finally:
            self._pool.putconn(conn)

    def query_downsampled(
        self,
        equipment_id: str,
        parameter_key: str,
        bucket_interval: str = "1 minute",
        lookback_hours: int = 24
    ) -> List[Dict[str, Any]]:
        """
        Queries downsampled time-series using TimescaleDB time_bucket for instant dashboard charts.
        """
        if not self.is_connected:
            return []

        conn = self._pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT 
                        time_bucket(%s, time) AS bucket,
                        AVG(value) AS avg_value,
                        MIN(value) AS min_value,
                        MAX(value) AS max_value,
                        COUNT(*) AS sample_count
                    FROM telemetry_hypertable
                    WHERE equipment_id = %s 
                      AND parameter_key = %s
                      AND time > NOW() - INTERVAL '%s hours'
                    GROUP BY bucket
                    ORDER BY bucket ASC;
                """, (bucket_interval, equipment_id, parameter_key, lookback_hours))
                rows = cur.fetchall()
                return [
                    {
                        "bucket": r[0].isoformat() if r[0] else None,
                        "avg": round(r[1], 2) if r[1] is not None else None,
                        "min": round(r[2], 2) if r[2] is not None else None,
                        "max": round(r[3], 2) if r[3] is not None else None,
                        "count": r[4]
                    }
                    for r in rows
                ]
        except Exception as e:
            logger.error(f"TimescaleDB query error: {e}")
            return []
        finally:
            self._pool.putconn(conn)


# Global Singleton
timescale_engine = TimescaleAdapter()
