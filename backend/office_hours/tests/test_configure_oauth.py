import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('configure_oauth', Path(__file__).resolve().parents[1] / 'deploy/configure_oauth.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def client():
    return {'web': {'project_id': 'tpucloud-196821', 'client_id': 'fake-test.apps.googleusercontent.com',
                    'client_secret': 'fake-test-secret-not-real', 'redirect_uris': [module.CALLBACK]}}


def test_preserves_encryption_and_microsoft():
    before = 'TOKEN_ENCRYPTION_KEY=fake-test-key\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nMICROSOFT_CLIENT_SECRET=fake-ms-test\n'
    after = module.prepare_google_update(client(), before)
    assert 'TOKEN_ENCRYPTION_KEY=fake-test-key\n' in after
    assert 'MICROSOFT_CLIENT_SECRET=fake-ms-test\n' in after
    assert after.count('GOOGLE_CLIENT_ID=') == 1
    assert after.count('GOOGLE_CLIENT_SECRET=') == 1


@pytest.mark.parametrize('field,value', [('project_id', 'wrong-project'), ('redirect_uris', []),
                                       ('client_secret', 'secret\nEVIL=true'), ('client_id', None)])
def test_rejects_invalid_client(field, value):
    document = client()
    document['web'][field] = value
    with pytest.raises(ValueError):
        module.prepare_google_update(document, 'TOKEN_ENCRYPTION_KEY=fake-test-key\n')


def test_never_regenerates_a_missing_key():
    with pytest.raises(ValueError):
        module.prepare_google_update(client(), 'GOOGLE_CLIENT_ID=\n')
