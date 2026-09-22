"""SNAIL office hours API. Run one worker: durable reservations + serialized calendar writes."""
import json
import logging
import os
import secrets
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, time as daytime, timedelta
from pathlib import Path
from typing import Literal

import httpx
from cryptography.fernet import Fernet
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from providers import CalendarError, Providers
from schedule import HOSTS, PACIFIC, candidates, iso, overlaps, stamp, validate_slot
from store import Store, digest

LOG = logging.getLogger('snail')


class AuthStart(BaseModel):
    provider: Literal['google', 'microsoft']
    connect: bool = False


class AuthFinish(BaseModel):
    state: str = Field(min_length=20, max_length=200)
    code: str = Field(min_length=1, max_length=8192)


class BookingInput(BaseModel):
    host: Literal['dan', 'klemen', 'both']
    duration: Literal[30, 60]
    start: str = Field(max_length=50)
    request_key: uuid.UUID


class CalendarSelection(BaseModel):
    calendars: list[str] = Field(min_length=1, max_length=20)
    write_calendar: str = Field(min_length=1, max_length=1024)


def config_from_env():
    site = os.environ.get('SITE_URL', 'https://neuroailab.github.io/psi-docs/snail/office-hours/').rstrip('/') + '/'
    return dict(site=site, callback=site + 'callback.html',
                origin=os.environ.get('SITE_ORIGIN', 'https://neuroailab.github.io'),
                database=os.environ.get('DATABASE_PATH', '/var/lib/snail/office-hours.sqlite3'),
                key=os.environ.get('TOKEN_ENCRYPTION_KEY', ''),
                google_client_id=os.environ.get('GOOGLE_CLIENT_ID', ''),
                google_client_secret=os.environ.get('GOOGLE_CLIENT_SECRET', ''),
                microsoft_client_id=os.environ.get('MICROSOFT_CLIENT_ID', ''),
                microsoft_client_secret=os.environ.get('MICROSOFT_CLIENT_SECRET', ''),
                hosts={'dan': os.environ.get('DAN_EMAIL', 'yamins@stanford.edu').lower(),
                       'klemen': os.environ.get('KLEMEN_EMAIL', 'klemenk@stanford.edu').lower()})


def create_app(config=None, provider_factory=Providers, background=True):
    config = config or config_from_env()
    if not config['key']:
        raise RuntimeError('TOKEN_ENCRYPTION_KEY must be set; refusing ephemeral encryption keys.')
    cipher = Fernet(config['key'].encode())
    Path(config['database']).parent.mkdir(parents=True, exist_ok=True)
    store = Store(config['database'])
    provider = provider_factory(config, store, cipher)
    lock = threading.RLock()
    token_lock = threading.RLock()
    stopped = threading.Event()
    limits = {}
    limits_lock = threading.Lock()

    def public_booking(b):
        return {k: b[k] for k in ('id', 'hosts', 'status')} | {'start': iso(b['start']), 'end': iso(b['end'])}

    def advance(b):
        """Write-ahead booking: pending/cancelling holds survive crashes and retries."""
        try:
            if b['status'] == 'cancelling':
                for host in b['hosts']:
                    provider.delete_event(host, b)
                store.update_booking(b['id'], 'cancelled', b['events'])
            elif b['status'] == 'pending':
                # Never finish an abandoned pending booking after its scheduled start.
                if b['start'] <= time.time():
                    store.update_booking(b['id'], 'cancelling', b['events'])
                    return
                for index, host in enumerate(b['hosts']):
                    if host not in b['events']:
                        b['events'][host] = provider.create_event(host, b, invite=index == 0)
                        store.update_booking(b['id'], 'pending', b['events'])
                store.update_booking(b['id'], 'confirmed', b['events'])
        except (CalendarError, httpx.HTTPError):
            # Log identifiers only, never provider response bodies, tokens, or calendar details.
            LOG.warning('Calendar operation pending: booking=%s status=%s', b['id'], b['status'])

    def maintenance():
        while not stopped.wait(60):
            try:
                with lock, token_lock:
                    with store.db() as db:
                        rows = db.execute("SELECT * FROM bookings WHERE status IN ('pending','cancelling') ORDER BY created LIMIT 20").fetchall()
                    for row in rows:
                        advance(store.unpack(row))
                    store.prune()
            except Exception:
                LOG.error('Maintenance needs attention; retrying next minute.')

    @asynccontextmanager
    async def lifespan(_):
        worker = threading.Thread(target=maintenance, daemon=True)
        if background:
            worker.start()
        yield
        stopped.set()
        if background:
            worker.join(timeout=2)

    app = FastAPI(title='SNAIL office hours', docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.store, app.state.provider = store, provider
    app.state.advance = advance
    app.add_middleware(CORSMiddleware, allow_origins=[config['origin']], allow_credentials=False,
                       allow_methods=['GET', 'POST', 'PUT', 'DELETE'], allow_headers=['Authorization', 'Content-Type'])

    @app.middleware('http')
    async def safety(request, call_next):
        if int(request.headers.get('content-length', '0') or 0) > 16384:
            return JSONResponse({'detail': 'Request too large.'}, status_code=413)
        # Backend is exposed only through Caddy. Uvicorn trusts forwarding from loopback only.
        address = request.client.host if request.client else 'unknown'
        now = time.time()
        with limits_lock:
            if len(limits) > 10000:
                for k in [k for k, v in limits.items() if now - v[0] > 60]:
                    limits.pop(k, None)
            start, count = limits.get(address, (now, 0))
            if now - start > 60:
                start, count = now, 0
            limits[address] = (start, count + 1)
        if count >= 90:
            return JSONResponse({'detail': 'Please wait a minute before trying again.'}, status_code=429,
                                headers={'Retry-After': '60'})
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    @app.exception_handler(CalendarError)
    async def calendar_error(_, exc):
        return JSONResponse({'detail': str(exc)}, status_code=503)

    def session(authorization: str = Header(default='')):
        if not authorization.startswith('Bearer '):
            raise HTTPException(401, 'Sign in with Stanford to continue.')
        with store.db() as db:
            row = db.execute('SELECT email FROM sessions WHERE token=? AND expires>?',
                             (digest(authorization[7:]), time.time())).fetchone()
        if not row:
            raise HTTPException(401, 'Your sign-in expired. Please sign in again.')
        return row['email']

    def host_for(email):
        return next((h for h, address in config['hosts'].items() if email == address), None)

    def host_session(email=Depends(session)):
        host = host_for(email)
        if not host:
            raise HTTPException(403, 'Only Dan and Klemen can manage calendars.')
        return host

    @app.get('/healthz')
    def health():
        with store.db() as db:
            db.execute('SELECT 1')
        return {'service': 'snail-office-hours', 'status': 'ok'}

    @app.get('/v1/config')
    def public_config():
        return {'timezone': 'America/Los_Angeles', 'days': [0, 1, 3, 4], 'open': '12:00', 'close': '14:00',
                'durations': [30, 60], 'providers': {p: provider.ready(p) for p in ('google', 'microsoft')},
                'hosts': {h: {'connected': bool(store.connection(h))} for h in HOSTS}}

    @app.post('/v1/auth/start')
    def auth_start(body: AuthStart, authorization: str = Header(default='')):
        if not provider.ready(body.provider):
            raise HTTPException(503, 'This sign-in provider is awaiting app registration. Booking is not open yet.')
        host = None
        email = None
        if body.connect:
            email = session(authorization)
            host = host_for(email)
            if not host:
                raise HTTPException(403, 'Only hosts can connect a calendar.')
        data = dict(state=secrets.token_urlsafe(32), nonce=secrets.token_urlsafe(32),
                    verifier=secrets.token_urlsafe(64), host=host, actor=email, provider=body.provider)
        with store.db() as db:
            db.execute('INSERT INTO oauth VALUES (?,?,?)',
                       (digest(data['state']), cipher.encrypt(json.dumps(data).encode()).decode(), time.time() + 600))
        return {'url': provider.authorize(body.provider, data), 'state': data['state']}

    @app.post('/v1/auth/finish')
    def auth_finish(body: AuthFinish):
        with store.db(immediate=True) as db:
            row = db.execute('SELECT data FROM oauth WHERE state=? AND expires>?',
                             (digest(body.state), time.time())).fetchone()
            if not row:
                raise HTTPException(400, 'Sign-in expired or was already used. Start again.')
            db.execute('DELETE FROM oauth WHERE state=?', (digest(body.state),))
        data = json.loads(cipher.decrypt(row['data'].encode()))
        with lock, token_lock:
            email, token = provider.exchange(data['provider'], body.code, data)
            if data['host']:
                host = data['host']
                previous = store.connection(host)
                same = previous and previous['provider'] == data['provider'] and previous['account'] == email
                if previous and not same and store.has_future(host):
                    raise HTTPException(409, 'Cancel upcoming bookings before switching calendar accounts.')
                if not token.get('refresh_token') and same:
                    token['refresh_token'] = json.loads(cipher.decrypt(previous['tokens'].encode())).get('refresh_token')
                if not token.get('refresh_token'):
                    raise HTTPException(400, 'Offline calendar access was not granted. Please reconnect and grant access.')
                store.save_connection(host, data['provider'], email, cipher.encrypt(json.dumps(token).encode()).decode(),
                                      previous['calendars'] if same else [], previous['write_calendar'] if same else '')
                # No availability until the host explicitly chooses calendars; do not assume their primary is sufficient.
                email = data['actor']
            bearer = secrets.token_urlsafe(40)
            with store.db() as db:
                db.execute('INSERT INTO sessions VALUES (?,?,?)', (digest(bearer), email, time.time() + 12 * 3600))
        return {'token': bearer, 'email': email, 'host': host_for(email), 'calendar_connected': bool(data['host'])}

    @app.post('/v1/auth/logout')
    def logout(authorization: str = Header(default=''), email=Depends(session)):
        with store.db() as db:
            db.execute('DELETE FROM sessions WHERE token=?', (digest(authorization[7:]),))
        return {'ok': True}

    @app.get('/v1/me')
    def me(email=Depends(session)):
        return {'email': email, 'host': host_for(email)}

    @app.get('/v1/host/calendars')
    def calendars(host=Depends(host_session)):
        with token_lock:
            c = store.connection(host)
            if not c:
                return {'connected': False, 'calendars': []}
            return {'connected': True, 'provider': c['provider'], 'account': c['account'],
                    'selected': c['calendars'], 'write_calendar': c['write_calendar'], 'calendars': provider.calendars(host)}

    @app.put('/v1/host/calendars')
    def select_calendars(body: CalendarSelection, host=Depends(host_session)):
        with lock, token_lock:
            c = store.connection(host)
            if not c:
                raise HTTPException(400, 'Connect a calendar first.')
            choices = {x['id']: x for x in provider.calendars(host)}
            c = store.connection(host)  # Preserve any refresh-token rotation during the request above.
            selected = list(dict.fromkeys(body.calendars + [body.write_calendar]))
            if (any(x not in choices for x in selected) or body.write_calendar not in choices
                    or not choices[body.write_calendar]['writable']):
                raise HTTPException(400, 'Choose accessible calendars and a writable booking calendar.')
            if c['write_calendar'] and c['write_calendar'] != body.write_calendar and store.has_future(host):
                raise HTTPException(409, 'Cancel upcoming bookings before changing the booking calendar.')
            # Check permissions before marking the host ready; restore prior choices on error.
            store.save_connection(host, c['provider'], c['account'], c['tokens'], selected, body.write_calendar)
            try:
                provider.busy(host, time.time(), time.time() + 86400)
            except Exception:
                store.save_connection(host, c['provider'], c['account'], c['tokens'], c['calendars'], c['write_calendar'])
                raise
        return {'ok': True}

    @app.delete('/v1/host/calendars')
    def disconnect(host=Depends(host_session)):
        with lock, token_lock:
            if store.has_future(host):
                raise HTTPException(409, 'Cancel upcoming bookings before disconnecting.')
            with store.db() as db:
                db.execute('DELETE FROM connections WHERE host=?', (host,))
        return {'ok': True}

    @app.get('/v1/availability')
    def availability(week: date, duration: int = 30, host: Literal['dan', 'klemen', 'both'] = 'both'):
        if duration not in (30, 60):
            raise HTTPException(400, 'Duration must be 30 or 60 minutes.')
        today = datetime.now(PACIFIC).date()
        if not today - timedelta(days=6) <= week <= today + timedelta(days=28):
            raise HTTPException(400, 'Choose a week within the next 28 days.')
        start = datetime.combine(week, daytime.min, PACIFIC).timestamp()
        end = datetime.combine(week + timedelta(days=7), daytime.min, PACIFIC).timestamp()
        periods, state = {}, {}
        with token_lock:
            for h in HOSTS:
                c = store.connection(h)
                if not c or not c['write_calendar'] or not c['calendars']:
                    state[h] = 'not_connected'
                    continue
                try:
                    periods[h] = provider.busy(h, start, end)
                    state[h] = 'ready'
                except (CalendarError, httpx.HTTPError):
                    state[h] = 'unavailable'
        for booking in store.bookings(start, end):
            for h in booking['hosts']:
                periods.setdefault(h, []).append((booking['start'], booking['end']))
        slots = []
        for a, b in candidates(week, duration, time.time()):
            free = [h for h in HOSTS if state[h] == 'ready' and not overlaps(a, b, periods.get(h, []))]
            requested = list(HOSTS) if host == 'both' else [host]
            slots.append({'start': iso(a), 'end': iso(b), 'available_hosts': free,
                          'available': all(h in free for h in requested)})
        return {'slots': slots, 'hosts': state, 'checked_at': iso(time.time())}

    @app.get('/v1/bookings')
    def my_bookings(email=Depends(session)):
        host = host_for(email)
        return [public_booking(b) | ({'email': b['email']} if host else {})
                for b in store.bookings(time.time() - 86400, time.time() + 29 * 86400)
                if b['email'] == email or (host and host in b['hosts'])]

    @app.post('/v1/bookings')
    def book(body: BookingInput, email=Depends(session)):
        try:
            start = stamp(body.start)
            end = validate_slot(start, body.duration, time.time())
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        hosts = list(HOSTS) if body.host == 'both' else [body.host]
        with lock, token_lock:
            existing = store.existing(email, str(body.request_key))
            if existing:
                if (existing['start'], existing['end'], existing['hosts']) != (start, end, hosts):
                    raise HTTPException(409, 'This request key belongs to a different booking.')
                return public_booking(existing)
            for host in hosts:
                # Fresh read, no availability cache. Provider failures fail closed.
                if overlaps(start, end, provider.busy(host, start, end)):
                    raise HTTPException(409, 'A calendar changed and this time is no longer available.')
            try:
                b = store.reserve(dict(id=uuid.uuid4().hex, email=email, request_key=str(body.request_key),
                                       start=start, end=end, hosts=hosts))
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from exc
            advance(b)
            result = store.booking(b['id'])
        return JSONResponse(public_booking(result), status_code=201 if result['status'] == 'confirmed' else 202)

    @app.delete('/v1/bookings/{booking_id}')
    def cancel(booking_id: uuid.UUID, email=Depends(session)):
        with lock, token_lock:
            b = store.booking(booking_id.hex)
            if not b or (b['email'] != email and host_for(email) not in b['hosts']):
                raise HTTPException(404, 'Booking not found.')
            if b['status'] != 'cancelled':
                store.update_booking(b['id'], 'cancelling', b['events'])
                advance(store.booking(b['id']))
            result = store.booking(b['id'])
        return public_booking(result)

    return app
