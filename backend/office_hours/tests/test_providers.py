import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import httpx
import jwt
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from providers import CalendarError, Providers, STANFORD_TENANT, GOOGLE_CALENDAR_SCOPES
from store import Store


@pytest.fixture
def provider(tmp_path):
    store = Store(tmp_path / 'providers.sqlite3')
    cipher = Fernet(Fernet.generate_key())
    config = dict(google_client_id='google-client', google_client_secret='fake-test-only',
                  microsoft_client_id='microsoft-client', microsoft_client_secret='fake-test-only',
                  callback='https://example.org/callback', site='https://example.org/')
    p = Providers(config, store, cipher)
    def connect(kind='google'):
        tokens = cipher.encrypt(json.dumps({'access_token': 'test-access', 'refresh_token': 'test-refresh',
                                           'expires_at': time.time() + 3600}).encode()).decode()
        store.save_connection('dan', kind, 'host@example.org', tokens, ['primary'], 'primary')
    connect()
    p.test_connect = connect
    return p


def transport(provider, handler):
    provider.client = httpx.Client(transport=httpx.MockTransport(handler))


def test_google_freebusy_errors_are_not_free(provider):
    transport(provider, lambda r: httpx.Response(200, json={'calendars': {'primary': {'errors': [{'reason': 'notFound'}]}}}))
    with pytest.raises(CalendarError):
        provider.busy('dan', 1790622000, 1790625600)
    transport(provider, lambda r: httpx.Response(200, json={'calendars': {}}))
    with pytest.raises(CalendarError):
        provider.busy('dan', 1790622000, 1790625600)


def test_google_busy_and_encrypted_refresh(provider):
    calls = []
    with provider.store.db() as db:
        tokens = provider.cipher.encrypt(json.dumps({'access_token': 'old', 'refresh_token': 'secret-refresh', 'expires_at': 0}).encode()).decode()
        db.execute('UPDATE connections SET tokens=?', (tokens,))
    def handler(request):
        calls.append(str(request.url))
        if '/token' in str(request.url):
            return httpx.Response(200, json={'access_token': 'new', 'expires_in': 3600})
        assert request.headers['authorization'] == 'Bearer new'
        return httpx.Response(200, json={'calendars': {'primary': {'busy': [{'start': '2026-09-28T19:00:00Z', 'end': '2026-09-28T19:30:00Z'}]}}})
    transport(provider, handler)
    assert provider.busy('dan', 1790622000, 1790625600) == [(1790622000, 1790623800)]
    stored = provider.store.connection('dan')['tokens']
    assert 'secret-refresh' not in stored
    assert json.loads(provider.cipher.decrypt(stored.encode()))['access_token'] == 'new'
    assert len(calls) == 2


def test_microsoft_pagination_all_day_free_and_tentative(provider):
    provider.test_connect('microsoft')
    calls = []
    def handler(request):
        calls.append(str(request.url))
        assert 'outlook.timezone="UTC"' in request.headers['prefer']
        assert 'subject' not in str(request.url)
        if len(calls) == 1:
            return httpx.Response(200, json={'value': [
                {'start': {'dateTime': '2026-09-28T19:00:00'}, 'end': {'dateTime': '2026-09-28T20:00:00'}, 'showAs': 'free'},
                {'start': {'dateTime': '2026-09-28T20:00:00'}, 'end': {'dateTime': '2026-09-28T20:30:00'}, 'showAs': 'tentative'},
            ], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars/primary/calendarView?$skiptoken=2'})
        return httpx.Response(200, json={'value': [
            {'start': {'dateTime': '2026-09-29T07:00:00'}, 'end': {'dateTime': '2026-09-30T07:00:00'}, 'showAs': 'busy'},
        ]})
    transport(provider, handler)
    assert len(provider.busy('dan', 1790622000, 1790800000)) == 2
    assert len(calls) == 2


def test_provider_pagination_cannot_exfiltrate_token(provider):
    provider.test_connect('microsoft')
    transport(provider, lambda r: httpx.Response(200, json={'value': [], '@odata.nextLink': 'https://evil.example/steal'}))
    with pytest.raises(CalendarError):
        provider.calendars('dan')


def signed_exchange(provider, kind, changes=None, member='Member', mail='student@stanford.edu', host=None, scope=None):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    claims = dict(iss='https://accounts.google.com', aud=kind + '-client', sub='identity123',
                  iat=int(time.time()), exp=int(time.time()) + 3600, nonce='nonce', email=mail, email_verified=True)
    if kind == 'microsoft':
        claims.update(tid=STANFORD_TENANT, iss=f'https://login.microsoftonline.com/{STANFORD_TENANT}/v2.0')
    claims.update(changes or {})
    token = jwt.encode(claims, private, algorithm='RS256')
    provider.keys[kind] = SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=private.public_key()))
    def handler(request):
        if str(request.url).endswith('/token'):
            return httpx.Response(200, json={'id_token': token, 'access_token': 'test', 'refresh_token': 'test-refresh',
                                            'scope': scope or 'openid email profile', 'expires_in': 3600})
        return httpx.Response(200, json={'mail': mail, 'userPrincipalName': mail, 'userType': member})
    transport(provider, handler)
    return provider.exchange(kind, 'code', dict(host=host, nonce='nonce', verifier='verifier'))


def test_verified_google_stanford_login(provider):
    email, tokens = signed_exchange(provider, 'google')
    assert email == 'student@stanford.edu' and 'id_token' not in tokens


@pytest.mark.parametrize('claims', [{'email_verified': False}, {'email': 'x@evil.org'}, {'nonce': 'wrong'}, {'aud': 'wrong'}, {'iss': 'https://evil.org'}, {'exp': 1}])
def test_google_rejects_invalid_identity(provider, claims):
    with pytest.raises(CalendarError):
        signed_exchange(provider, 'google', claims)


def test_microsoft_stanford_member_login(provider):
    assert signed_exchange(provider, 'microsoft')[0] == 'student@stanford.edu'
    with pytest.raises(CalendarError):
        signed_exchange(provider, 'microsoft', member='Guest')
    with pytest.raises(CalendarError):
        signed_exchange(provider, 'microsoft', mail='student@evil.org')
    other = '11111111-1111-1111-1111-111111111111'
    with pytest.raises(CalendarError):
        signed_exchange(provider, 'microsoft', changes={'tid': other, 'iss': f'https://login.microsoftonline.com/{other}/v2.0'})


def test_host_can_connect_different_account_but_must_grant_scopes(provider):
    with pytest.raises(CalendarError):
        signed_exchange(provider, 'google', host='dan', mail='host@gmail.com')
    assert signed_exchange(provider, 'google', host='dan', mail='host@gmail.com', scope=' '.join(GOOGLE_CALENDAR_SCOPES))[0] == 'host@gmail.com'


def test_google_deterministic_event_recovery(provider):
    calls = []
    def handler(request):
        calls.append(request.method)
        return httpx.Response(200, json={'id': 'already-created', 'status': 'confirmed'})
    transport(provider, handler)
    b = dict(id='a' * 32, hosts=['dan'], email='student@stanford.edu', start=1790622000, end=1790623800, events={})
    assert provider.create_event('dan', b, True) == 'already-created'
    assert calls == ['GET']


def test_microsoft_transaction_recovery(provider):
    provider.test_connect('microsoft')
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={'value': [{'id': 'recovered-event'}]})
    transport(provider, handler)
    b = dict(id='a' * 32, hosts=['dan'], email='student@stanford.edu', start=1790622000, end=1790623800, events={})
    assert provider.create_event('dan', b, True) == 'recovered-event'
    assert len(calls) == 1 and calls[0].method == 'GET'
    assert 'singleValueExtendedProperties' in str(calls[0].url)
