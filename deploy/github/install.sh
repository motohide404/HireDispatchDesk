#!/usr/bin/env bash
# One-time administrator setup on the existing dedicated test server.
set -euo pipefail
test "$(id -u)" -eq 0
test "$#" -eq 2
setup_dir=$(cd -- "$(dirname -- "$0")" && pwd)
deploy_public_key=$1
bootstrap=$2
expected_hostname=$(python3 - "$bootstrap" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))['hostname'])
PY
)
test "$(hostname)" = "$expected_hostname"
python3 - "$deploy_public_key" <<'PY'
from pathlib import Path
import re, sys
key=Path(sys.argv[1]).read_text().strip()
if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]*)?', key):
    raise SystemExit('A single Ed25519 PUBLIC key is required.')
PY
ssh-keygen -lf "$deploy_public_key" >/dev/null
if id hiredispatch-deploy >/dev/null 2>&1 && [ ! -f /usr/local/lib/hiredispatch-github/ssh-entry ]; then
    printf '%s\n' 'The deployment account already exists outside this setup; stopped.' >&2
    exit 1
fi
install -d -m 755 /usr/local/lib/hiredispatch-github
for name in receive.py remote_update.py; do
    install -m 644 -o root -g root "$setup_dir/$name" "/usr/local/lib/hiredispatch-github/$name"
done
install -m 600 -o root -g root "$bootstrap" /usr/local/lib/hiredispatch-github/target.json
install -m 755 -o root -g root "$setup_dir/ssh-entry" /usr/local/lib/hiredispatch-github/ssh-entry
python3 - <<'PY'
import importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('github_receiver','/usr/local/lib/hiredispatch-github/receive.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
if module.STATE.exists():
    module.verify_baseline(json.loads(module.STATE.read_text()))
else:
    baseline=json.loads(Path('/usr/local/lib/hiredispatch-github/target.json').read_text())
    module.verify_baseline(baseline)
    module.write_state(baseline)
PY
if ! id hiredispatch-deploy >/dev/null 2>&1; then
    useradd --system --create-home --shell /bin/sh hiredispatch-deploy
    usermod --password '*' hiredispatch-deploy
fi
deploy_home=$(getent passwd hiredispatch-deploy | cut -d: -f6)
install -d -m 700 -o hiredispatch-deploy -g hiredispatch-deploy "$deploy_home/.ssh"
authorized_temp=$(mktemp)
sudoers_temp=$(mktemp)
trap 'rm -f "$authorized_temp" "$sudoers_temp"' EXIT
printf 'restrict,command="/usr/local/lib/hiredispatch-github/ssh-entry" %s\n' "$(cat "$deploy_public_key")" > "$authorized_temp"
install -m 600 -o hiredispatch-deploy -g hiredispatch-deploy "$authorized_temp" "$deploy_home/.ssh/authorized_keys"
printf '%s\n' 'hiredispatch-deploy ALL=(root) NOPASSWD: /usr/bin/python3 /usr/local/lib/hiredispatch-github/receive.py' > "$sudoers_temp"
visudo -cf "$sudoers_temp" >/dev/null
install -m 440 -o root -g root "$sudoers_temp" /etc/sudoers.d/hiredispatch-github
printf '%s\n' 'Dedicated deployment entry installed. GitHub secret/variable configuration and the first deployment are still required.'
