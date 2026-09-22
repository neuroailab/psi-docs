"""Small, durable store. SQLite transactions reserve both hosts together."""
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.db() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sessions (
                  token TEXT PRIMARY KEY, email TEXT NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS oauth (
                  state TEXT PRIMARY KEY, data TEXT NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS connections (
                  host TEXT PRIMARY KEY, provider TEXT NOT NULL, account TEXT NOT NULL,
                  tokens TEXT NOT NULL, calendars TEXT NOT NULL, write_calendar TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS bookings (
                  id TEXT PRIMARY KEY, email TEXT NOT NULL, request_key TEXT NOT NULL,
                  start REAL NOT NULL, end REAL NOT NULL, hosts TEXT NOT NULL,
                  status TEXT NOT NULL, events TEXT NOT NULL DEFAULT '{}',
                  created REAL NOT NULL, UNIQUE(email, request_key));
                CREATE INDEX IF NOT EXISTS booking_times ON bookings(start,end,status);
            """)

    @contextmanager
    def db(self, immediate=False):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        try:
            if immediate:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def connection(self, host):
        with self.db() as db:
            row = db.execute("SELECT * FROM connections WHERE host=?", (host,)).fetchone()
        if row:
            result = dict(row)
            result['calendars'] = json.loads(result['calendars'])
            return result

    def save_connection(self, host, provider, account, tokens, calendars, write_calendar):
        with self.db() as db:
            db.execute("INSERT OR REPLACE INTO connections VALUES (?,?,?,?,?,?)",
                       (host, provider, account, tokens, json.dumps(calendars), write_calendar))

    @staticmethod
    def unpack(row):
        if row is None:
            return None
        row = dict(row)
        row['hosts'] = json.loads(row['hosts'])
        row['events'] = json.loads(row['events'])
        return row

    def booking(self, booking_id):
        with self.db() as db:
            return self.unpack(db.execute("SELECT * FROM bookings WHERE id=?", (booking_id,)).fetchone())

    def existing(self, email, key):
        with self.db() as db:
            return self.unpack(db.execute("SELECT * FROM bookings WHERE email=? AND request_key=?",
                                          (email, key)).fetchone())

    def bookings(self, start, end):
        with self.db() as db:
            return [self.unpack(r) for r in db.execute(
                "SELECT * FROM bookings WHERE start<? AND end>? AND status!='cancelled' ORDER BY start",
                (end, start))]

    def reserve(self, booking):
        with self.db(immediate=True) as db:
            prior = db.execute("SELECT * FROM bookings WHERE email=? AND request_key=?",
                               (booking['email'], booking['request_key'])).fetchone()
            if prior:
                return self.unpack(prior)
            rows = db.execute("SELECT * FROM bookings WHERE start<? AND end>? AND status!='cancelled'",
                              (booking['end'], booking['start'])).fetchall()
            if any(set(json.loads(r['hosts'])) & set(booking['hosts']) for r in rows):
                raise ValueError('That time was just taken. Please choose another slot.')
            if db.execute("SELECT count(*) FROM bookings WHERE email=? AND end>? AND status!='cancelled'",
                          (booking['email'], time.time())).fetchone()[0] >= 4:
                raise ValueError('You can hold up to four upcoming bookings. Cancel one before booking more.')
            db.execute("INSERT INTO bookings(id,email,request_key,start,end,hosts,status,created) VALUES (?,?,?,?,?,?,?,?)",
                       (booking['id'], booking['email'], booking['request_key'], booking['start'],
                        booking['end'], json.dumps(booking['hosts']), 'pending', time.time()))
        return self.booking(booking['id'])

    def update_booking(self, booking_id, status, events):
        with self.db() as db:
            db.execute("UPDATE bookings SET status=?,events=? WHERE id=?",
                       (status, json.dumps(events), booking_id))

    def has_future(self, host):
        return any(host in b['hosts'] for b in self.bookings(time.time(), time.time() + 365 * 86400))

    def prune(self):
        with self.db() as db:
            db.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
            db.execute("DELETE FROM oauth WHERE expires<?", (time.time(),))
            # Keep unfinished operations until resolved; confirmed history is retained 90 days.
            db.execute("DELETE FROM bookings WHERE end<? AND status IN ('confirmed','cancelled')",
                       (time.time() - 90 * 86400,))
