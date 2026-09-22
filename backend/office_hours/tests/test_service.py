import json
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from providers import CalendarError
from schedule import PACIFIC, candidates, iso, overlaps, stamp, validate_slot
from store import Store, digest


class FakeProviders:
    def __init__(self, config, store, cipher):
        self.store = store
        self.periods = {'dan': [], 'klemen': []}
        self.fail = set()
        self.fail_writes = set()
        self.events = {}
        self.creation_count = 0

    def ready(self, provider):
        return False

    def busy(self, host, start, end):
        if not self.store.connection(host) or host in self.fail:
            raise CalendarError('Calendar unavailable.')
        return self.periods[host]

    def create_event(self, host, booking, invite):
        if host in self.fail_writes:
            raise CalendarError('Temporary provider error.')
        key = (host, booking['id'])
        if key not in self.events:
            self.creation_count += 1
            self.events[key] = 'event-' + host + booking['id']
        return self.events[key]

    def delete_event(self, host, booking):
        if host in self.fail_writes:
            raise CalendarError('Temporary provider error.')
        self.events.pop((host, booking['id']), None)

    def calendars(self, host):
        return [{'id': 'primary', 'name': 'Primary', 'writable': True}, {'id': 'second', 'name': 'Second', 'writable': True}]


@pytest.fixture
def setup(tmp_path):
    cfg = dict(database=str(tmp_path / 'test.sqlite3'), key=Fernet.generate_key().decode(),
               origin='https://neuroailab.github.io', site='https://neuroailab.github.io/psi-docs/snail/office-hours/',
               callback='https://neuroailab.github.io/psi-docs/snail/office-hours/callback.html',
               hosts={'dan': 'yamins@stanford.edu', 'klemen': 'klemenk@stanford.edu'})
    app = create_app(cfg, FakeProviders, background=False)
    store = app.state.store
    for host in ('dan', 'klemen'):
        store.save_connection(host, 'google', host + '@stanford.edu', 'encrypted-placeholder', ['primary'], 'primary')
    for key, email in [('student', 'student@stanford.edu'), ('other', 'other@stanford.edu'), ('dan', 'yamins@stanford.edu')]:
        with store.db() as db:
            db.execute('INSERT INTO sessions VALUES (?,?,?)', (digest(key), email, time.time() + 3600))
    day = datetime.now(PACIFIC).date() + timedelta(days=2)
    while day.weekday() != 0:
        day += timedelta(days=1)
    start = datetime(day.year, day.month, day.day, 12, tzinfo=PACIFIC).timestamp()
    with TestClient(app) as client:
        yield app, client, start


def auth(who='student'):
    return {'Authorization': 'Bearer ' + who}


def booking(start, host='both', duration=30, key=None):
    return dict(host=host, duration=duration, start=iso(start), request_key=key or str(uuid.uuid4()))


def test_schedule_dst_and_boundaries():
    for day, utc_hour in [('2026-10-26', 19), ('2026-11-02', 20)]:
        start = datetime.fromisoformat(day + 'T12:00:00').replace(tzinfo=PACIFIC).timestamp()
        assert datetime.fromisoformat(iso(start).replace('Z', '+00:00')).hour == utc_hour
        assert validate_slot(start, 60, start - 86400) == start + 3600
        with pytest.raises(ValueError):
            validate_slot(start + 90 * 60, 60, start - 86400)
    assert not overlaps(10, 20, [(20, 30)])
    assert overlaps(10, 21, [(20, 30)])
    with pytest.raises(ValueError):
        stamp('2026-10-26T12:00:00')


@pytest.mark.parametrize('hour,minute,duration', [(11, 30, 30), (14, 0, 30), (13, 30, 60), (12, 15, 30), (12, 0, 90), (23, 0, 60), (23, 30, 30)])
def test_invalid_slots(hour, minute, duration):
    start = datetime(2026, 10, 26, hour, minute, tzinfo=PACIFIC).timestamp()
    with pytest.raises(ValueError):
        validate_slot(start, duration, start - 86400)


def test_wednesday_and_lead_time():
    start = datetime(2026, 10, 28, 12, tzinfo=PACIFIC).timestamp()
    with pytest.raises(ValueError):
        validate_slot(start, 30, start - 86400)
    start = datetime(2026, 10, 26, 12, tzinfo=PACIFIC).timestamp()
    with pytest.raises(ValueError):
        validate_slot(start, 30, start - 60)
    with pytest.raises(ValueError):
        validate_slot(start, 30, start - 29 * 86400)


def test_auth_and_host_authorization(setup):
    _, client, start = setup
    assert client.post('/v1/bookings', json=booking(start)).status_code == 401
    assert client.get('/v1/host/calendars', headers=auth()).status_code == 403
    assert client.get('/v1/host/calendars', headers=auth('dan')).status_code == 200
    assert client.post('/v1/auth/start', json={'provider': 'google'}).status_code == 503
    assert client.post('/v1/auth/finish', json={'code': 'fake', 'state': 'x' * 40}).status_code == 400
    assert client.post('/v1/auth/logout', headers=auth()).status_code == 200
    assert client.get('/v1/me', headers=auth()).status_code == 401


def test_live_calendar_update_and_failure_closed(setup):
    app, client, start = setup
    week = datetime.fromtimestamp(start, PACIFIC).date().isoformat()
    path = f'/v1/availability?week={week}&host=both&duration=60'
    initial = client.get(path).json()
    assert initial['slots'][0]['available']
    app.state.provider.periods['klemen'] = [(start + 1800, start + 3600)]
    changed = client.get(path).json()
    assert not changed['slots'][0]['available']
    assert changed['slots'][0]['available_hosts'] == ['dan']
    app.state.provider.fail.add('dan')
    failed = client.get(path).json()
    assert failed['hosts']['dan'] == 'unavailable'
    assert not any(x['available'] for x in failed['slots'])
    assert 'email' not in json.dumps(failed)


def test_busy_rechecked_on_booking(setup):
    app, client, start = setup
    app.state.provider.periods['dan'] = [(start, start + 1800)]
    response = client.post('/v1/bookings', headers=auth(), json=booking(start))
    assert response.status_code == 409
    assert not app.state.store.bookings(start, start + 3600)


def test_combined_reservation_idempotency_and_cancel(setup):
    app, client, start = setup
    body = booking(start)
    first = client.post('/v1/bookings', headers=auth(), json=body)
    assert first.status_code == 201
    assert first.json()['status'] == 'confirmed'
    assert len(app.state.provider.events) == 2
    retry = client.post('/v1/bookings', headers=auth(), json=body)
    assert retry.json()['id'] == first.json()['id']
    assert app.state.provider.creation_count == 2
    for host in ['dan', 'klemen', 'both']:
        assert client.post('/v1/bookings', headers=auth('other'), json=booking(start, host)).status_code == 409
    assert client.get('/v1/bookings', headers=auth('other')).json() == []
    assert len(client.get('/v1/bookings', headers=auth('dan')).json()) == 1
    assert client.delete('/v1/bookings/' + first.json()['id'], headers=auth('other')).status_code == 404
    assert client.delete('/v1/bookings/' + first.json()['id'], headers=auth()).json()['status'] == 'cancelled'
    assert not app.state.provider.events
    assert client.post('/v1/bookings', headers=auth('other'), json=booking(start)).status_code == 201


def test_independent_hosts_and_hour_overlap(setup):
    _, client, start = setup
    assert client.post('/v1/bookings', headers=auth(), json=booking(start, 'dan', 60)).status_code == 201
    assert client.post('/v1/bookings', headers=auth('other'), json=booking(start, 'klemen')).status_code == 201
    assert client.post('/v1/bookings', headers=auth('other'), json=booking(start + 1800, 'dan')).status_code == 409


def test_partial_provider_failure_durable_recovery(setup):
    app, client, start = setup
    app.state.provider.fail_writes.add('klemen')
    first = client.post('/v1/bookings', headers=auth(), json=booking(start))
    assert first.status_code == 202 and first.json()['status'] == 'pending'
    assert len(app.state.provider.events) == 1
    b = app.state.store.booking(first.json()['id'])
    assert 'dan' in b['events']
    assert client.post('/v1/bookings', headers=auth('other'), json=booking(start, 'klemen')).status_code == 409
    app.state.provider.fail_writes.clear()
    app.state.advance(b)
    assert app.state.store.booking(b['id'])['status'] == 'confirmed'
    assert app.state.provider.creation_count == 2


def test_failed_cancellation_holds_slot_until_recovered(setup):
    app, client, start = setup
    b = client.post('/v1/bookings', headers=auth(), json=booking(start)).json()
    app.state.provider.fail_writes.add('klemen')
    assert client.delete('/v1/bookings/' + b['id'], headers=auth()).json()['status'] == 'cancelling'
    assert client.post('/v1/bookings', headers=auth('other'), json=booking(start)).status_code == 409
    app.state.provider.fail_writes.clear()
    app.state.advance(app.state.store.booking(b['id']))
    assert app.state.store.booking(b['id'])['status'] == 'cancelled'


def test_calendar_changes_protect_existing_bookings(setup):
    _, client, start = setup
    client.post('/v1/bookings', headers=auth(), json=booking(start))
    assert client.delete('/v1/host/calendars', headers=auth('dan')).status_code == 409
    assert client.put('/v1/host/calendars', headers=auth('dan'), json={'calendars': ['primary'], 'write_calendar': 'second'}).status_code == 409
    assert client.put('/v1/host/calendars', headers=auth('dan'), json={'calendars': ['second'], 'write_calendar': 'primary'}).status_code == 200


def test_sqlite_simultaneous_reservations(tmp_path):
    path = tmp_path / 'race.sqlite3'
    store = Store(path)
    barrier = threading.Barrier(2)
    def reserve(email):
        independent = Store(path)
        barrier.wait()
        try:
            independent.reserve(dict(id=uuid.uuid4().hex, email=email, request_key=str(uuid.uuid4()),
                                     start=time.time() + 3600, end=time.time() + 7200, hosts=['dan', 'klemen']))
            return True
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, ['a@stanford.edu', 'b@stanford.edu']))
    assert sorted(results) == [False, True]
    assert len(store.bookings(time.time(), time.time() + 86400)) == 1


def test_cors_and_public_configuration(setup):
    _, client, _ = setup
    response = client.get('/v1/config', headers={'Origin': 'https://neuroailab.github.io'})
    assert response.headers['access-control-allow-origin'] == 'https://neuroailab.github.io'
    assert response.headers['cache-control'] == 'no-store'
    assert 'tokens' not in response.text and 'secret' not in response.text
    response = client.get('/v1/config', headers={'Origin': 'https://evil.example'})
    assert 'access-control-allow-origin' not in response.headers
    assert client.get('/openapi.json').status_code == 404


def test_mismatched_idempotency_and_booking_limit(setup):
    _, client, start = setup
    key = str(uuid.uuid4())
    assert client.post('/v1/bookings', headers=auth(), json=booking(start, 'dan', key=key)).status_code == 201
    assert client.post('/v1/bookings', headers=auth(), json=booking(start + 1800, 'dan', key=key)).status_code == 409
    for i in range(1, 4):
        assert client.post('/v1/bookings', headers=auth(), json=booking(start + i * 1800, 'dan')).status_code == 201
    assert client.post('/v1/bookings', headers=auth(), json=booking(start, 'klemen')).status_code == 409
