"""Run as root on the NEW SNAIL VM. Never overwrites an existing secret file."""
import os
from pathlib import Path
from cryptography.fernet import Fernet

directory = Path('/etc/snail')
directory.mkdir(mode=0o700, exist_ok=True)
path = directory / 'office-hours.env'
if not path.exists():
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write('TOKEN_ENCRYPTION_KEY=' + Fernet.generate_key().decode() + '\n')
        stream.write('DATABASE_PATH=/var/lib/snail/office-hours.sqlite3\n')
        stream.write('SITE_URL=https://neuroailab.github.io/psi-docs/snail/office-hours/\n')
        stream.write('SITE_ORIGIN=https://neuroailab.github.io\n')
        stream.write('DAN_EMAIL=yamins@stanford.edu\nKLEMEN_EMAIL=klemenk@stanford.edu\n')
        stream.write('GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nMICROSOFT_CLIENT_ID=\nMICROSOFT_CLIENT_SECRET=\n')
    print('Created root-only environment. OAuth credentials still need configuring.')
else:
    print('Preserved existing environment and encryption key.')
