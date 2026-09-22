"""Encrypted consistent local snapshots; copy off-VM for disaster recovery."""
import os
import sqlite3
import time
from pathlib import Path

from cryptography.fernet import Fernet

source = Path(os.environ['DATABASE_PATH'])
destination = source.parent / 'backups'
destination.mkdir(mode=0o700, exist_ok=True)
with sqlite3.connect(source) as db, sqlite3.connect(':memory:') as snapshot:
    db.backup(snapshot)
    encrypted = Fernet(os.environ['TOKEN_ENCRYPTION_KEY'].encode()).encrypt(snapshot.serialize())
path = destination / (time.strftime('%Y-%m-%d', time.gmtime()) + '.sqlite3.fernet')
path.write_bytes(encrypted)
path.chmod(0o600)
for old in destination.glob('*.sqlite3.fernet'):
    if time.time() - old.stat().st_mtime > 14 * 86400:
        old.unlink()
print('Encrypted backup completed.')
