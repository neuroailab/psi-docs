"""Install OAuth credentials from stdin, without printing them or changing other secrets.

Run as root on snail-services. Send the Google downloaded client JSON through an
SSH stdin pipe; never place its contents in command arguments or shell history.
"""
import json
import os
import re
import socket
import sys
import tempfile
from pathlib import Path

CALLBACK = 'https://neuroailab.github.io/psi-docs/snail/office-hours/callback.html'


def prepare_google_update(document, existing):
    client = document.get('web')
    if not isinstance(client, dict) or client.get('project_id') != 'tpucloud-196821':
        raise ValueError('Expected a Google web client in the SNAIL cloud project.')
    if CALLBACK not in client.get('redirect_uris', []):
        raise ValueError('The required Office Hours callback is missing.')
    changes = {'GOOGLE_CLIENT_ID': client.get('client_id'), 'GOOGLE_CLIENT_SECRET': client.get('client_secret')}
    if any(not isinstance(v, str) or not re.fullmatch(r'[A-Za-z0-9._-]{10,1024}', v) for v in changes.values()):
        raise ValueError('Missing or malformed Google credentials.')
    lines = existing.splitlines()
    if not any(line.startswith('TOKEN_ENCRYPTION_KEY=') and line.split('=', 1)[1] for line in lines):
        raise ValueError('The existing encryption key is missing; refusing to reinitialize it.')
    output = [line for line in lines if line.partition('=')[0] not in changes]
    output += [name + '=' + value for name, value in changes.items()]
    return '\n'.join(output) + '\n'


def main():
    if os.geteuid() != 0 or socket.gethostname().split('.')[0] != 'snail-services':
        raise ValueError('Run as root on the dedicated snail-services VM.')
    destination = Path('/etc/snail/office-hours.env')
    if destination.is_symlink() or not destination.is_file():
        raise ValueError('Expected the existing regular SNAIL environment file.')
    document = json.load(sys.stdin)
    existing = destination.read_text()
    updated = prepare_google_update(document, existing)
    backup = destination.with_name('office-hours.env.before-google-auth')
    if not backup.exists():
        fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(existing)
    fd, temporary = tempfile.mkstemp(prefix='.office-hours-', dir=destination.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({'google_credentials_installed': True, 'other_settings_preserved': True,
                      'environment_mode': oct(destination.stat().st_mode & 0o777)}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never emit input, secret values, or a traceback from credential handling.
        print('Credential installation failed; verify the client file and existing server configuration.', file=sys.stderr)
        sys.exit(1)
