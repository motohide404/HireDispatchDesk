"""Deployment boundaries without SSH, sudo, PostgreSQL, or a live server."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, PROJECT / 'deploy/github' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


builder = module('github_builder', 'build_release.py')
receiver = module('github_receiver', 'receive.py')


class GitHubDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name, content in {
            'client/dist/index.html': '<html>tested release</html>',
            'client/dist/assets/app.js': 'console.log("tested")',
            'server/app.py': '# application',
            'deploy/releases/20261114-ledgers/verify_server.py': '# isolated checks',
            '.private/access.json': '{"password":"must-not-be-packaged"}',
            'deploy/runtime.env': 'AUTH_HASH=must-not-be-packaged',
            'outputs/other-project.txt': 'must-not-be-packaged'
        }.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.output = self.root / 'output'
        self.commit = 'a' * 40
        self.manifest = builder.build(self.root, self.commit, self.output)
        self.body = (self.output / 'github-release.tgz').read_bytes()

    def repack(self, files=None, mutate=None):
        manifest, payload = receiver.unpack(self.body)
        manifest = copy.deepcopy(manifest)
        if files is not None:
            payload = builder.archive(files)
            manifest['files'] = {name: builder.sha(content) for name, content in files.items()}
            manifest['archive_sha256'] = builder.sha(payload)
        if mutate:
            mutate(manifest)
        return builder.archive({'manifest.json': json.dumps(manifest).encode(), 'payload.tgz': payload})

    def files(self):
        _, payload = receiver.unpack(self.body)
        with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
            return {entry.name: archive.extractfile(entry).read() for entry in archive.getmembers()}

    def test_bundle_roundtrip_is_reproducible_and_never_packages_credentials_or_other_projects(self):
        manifest, _ = receiver.unpack(self.body)
        self.assertEqual(manifest, self.manifest)
        builder.build(self.root, self.commit, self.output)
        self.assertEqual(self.body, (self.output / 'github-release.tgz').read_bytes())
        self.assertFalse(any('.private' in path or '.env' in path or 'outputs' in path for path in manifest['files']))
        self.assertNotIn(b'must-not-be-packaged', self.body)
        self.assertEqual(json.loads(self.files()['client/dist/build.json'])['source_commit'], self.commit)

    def test_foreign_repository_branch_or_commit_is_rejected(self):
        for key, value in [('repository', 'somewhere/else'), ('branch', 'unreviewed'),
                           ('source_commit', '../escape'), ('release_id', 'wrong')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                receiver.unpack(self.repack(mutate=lambda manifest: manifest.update({key: value})))

    def test_payload_tampering_and_inconsistent_public_version_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'checksum'):
            receiver.unpack(self.repack(mutate=lambda manifest: manifest.update(archive_sha256='0' * 64)))
        files = self.files()
        files['client/dist/build.json'] = json.dumps({'source_commit': 'b' * 40}).encode()
        with self.assertRaisesRegex(ValueError, 'metadata'):
            receiver.unpack(self.repack(files=files))
        with self.assertRaisesRegex(ValueError, 'checksum'):
            receiver.unpack(self.repack(mutate=lambda manifest: manifest['files'].update({'server/app.py': '0' * 64})))

    def test_root_executables_config_and_traversal_paths_cannot_be_uploaded(self):
        for name in ['remote_update.py', '/etc/hiredispatch.env', 'client/dist/../../server/hack.py',
                     'server/extra.py', 'client/dist/.//app.js', 'checks/other.py']:
            with self.subTest(name=name):
                files = self.files()
                files[name] = b'forbidden'
                with self.assertRaises(ValueError):
                    receiver.unpack(self.repack(files=files))

    def test_symlink_payload_is_rejected_even_with_a_matching_manifest(self):
        files = self.files()
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
            for name, content in files.items():
                entry = tarfile.TarInfo(name)
                if name == 'server/app.py':
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = '/etc/hiredispatch.env'
                    archive.addfile(entry)
                else:
                    entry.size = len(content)
                    archive.addfile(entry, io.BytesIO(content))
        payload = buffer.getvalue()
        manifest = {**self.manifest, 'archive_sha256': builder.sha(payload)}
        body = builder.archive({'manifest.json': json.dumps(manifest).encode(), 'payload.tgz': payload})
        with self.assertRaisesRegex(ValueError, 'members'):
            receiver.unpack(body)

    def test_changed_running_code_stops_before_any_deployment_command(self):
        baseline = {'release_id': self.manifest['release_id'], 'files': receiver.deployed_files(self.manifest)}
        # Public metadata is generated into the bundle rather than the source dist.
        (self.root / 'client/dist/build.json').write_bytes(self.files()['client/dist/build.json'])
        state = self.root / 'state.json'
        state.write_text(json.dumps(baseline))
        original = state.read_bytes()
        (self.root / 'server/app.py').write_text('# changed outside deployment')
        with patch.object(receiver, 'ROOT', self.root), patch.object(receiver, 'STATE', state), patch.object(receiver.subprocess, 'run') as command:
            with self.assertRaisesRegex(ValueError, 'outside managed'):
                receiver.apply(self.body)
            command.assert_not_called()
        self.assertEqual(state.read_bytes(), original)

    def test_baseline_state_is_private_atomic_and_has_no_checker_or_private_data(self):
        state = self.root / 'managed' / 'state.json'
        with patch.object(receiver, 'STATE', state):
            receiver.write_state(self.manifest)
        data = json.loads(state.read_text())
        self.assertEqual(state.stat().st_mode & 0o777, 0o600)
        self.assertNotIn('checks/verify_server.py', data['files'])
        self.assertEqual(list(state.parent.iterdir()), [state])

    def test_failed_deployment_never_advances_the_baseline(self):
        state = self.root / 'state.json'
        state.write_text(json.dumps({'files': receiver.deployed_files(self.manifest)}))
        original = state.read_bytes()
        (self.root / 'client/dist/build.json').write_bytes(self.files()['client/dist/build.json'])
        installed = self.root / 'installed'
        installed.mkdir()
        (installed / 'remote_update.py').write_text('# trusted updater')
        from subprocess import CompletedProcess
        with patch.object(receiver, 'ROOT', self.root), patch.object(receiver, 'STATE', state), patch.object(receiver, 'INSTALL', installed), patch.object(receiver.subprocess, 'run', return_value=CompletedProcess([], 1, '', 'rollback complete')):
            with self.assertRaisesRegex(RuntimeError, 'baseline was not advanced'):
                receiver.apply(self.body)
        self.assertEqual(state.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
