#!/usr/bin/env bash
# Install/update only this dedicated service. Run from the uploaded office_hours directory.
set -euo pipefail
if [[ "$(hostname -s)" != "snail-services" ]]; then
  echo "Refusing: this installer is only for the dedicated snail-services VM." >&2
  exit 1
fi
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv curl gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades
# Use Caddy's signed stable repository, not Debian 12's old upstream release.
snail_install_tmp=$(mktemp -d)
curl --fail --silent --show-error https://dl.cloudsmith.io/public/caddy/stable/gpg.key --output "$snail_install_tmp/caddy.key"
gpg --batch --dearmor --output "$snail_install_tmp/caddy.gpg" "$snail_install_tmp/caddy.key"
curl --fail --silent --show-error https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt --output "$snail_install_tmp/caddy.list"
sudo install -m 0644 "$snail_install_tmp/caddy.gpg" /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo install -m 0644 "$snail_install_tmp/caddy.list" /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
if ! id snail >/dev/null 2>&1; then
  sudo useradd --system --home-dir /var/lib/snail --shell /usr/sbin/nologin snail
fi
sudo install -d -m 0755 /opt/snail/office-hours
sudo cp -a app.py providers.py schedule.py store.py requirements.txt deploy /opt/snail/office-hours/
sudo chown -R root:root /opt/snail/office-hours
if [[ ! -d /opt/snail/venv ]]; then sudo python3 -m venv /opt/snail/venv; fi
sudo /opt/snail/venv/bin/pip install --quiet -r /opt/snail/office-hours/requirements.txt
sudo /opt/snail/venv/bin/python /opt/snail/office-hours/deploy/initialize.py
sudo install -m 0644 deploy/snail-office-hours.service deploy/snail-backup.service deploy/snail-backup.timer /etc/systemd/system/
sudo install -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now snail-office-hours snail-backup.timer caddy
sudo systemctl restart snail-office-hours
sudo systemctl reload caddy
sudo systemctl start snail-backup.service
sudo systemctl --no-pager is-active snail-office-hours caddy
