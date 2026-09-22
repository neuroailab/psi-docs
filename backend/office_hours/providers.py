"""Delegated Google/Microsoft OAuth and calendars. Never expose provider tokens."""
import base64
import hashlib
import html
import json
import time
import uuid
from urllib.parse import quote, urlencode, urlparse

import httpx
import jwt

from schedule import iso, stamp

GOOGLE = 'https://www.googleapis.com/calendar/v3'
GRAPH = 'https://graph.microsoft.com/v1.0'
EXTENSION = 'String {98c3cd65-46df-4a4a-9539-86ca27ac33f1} Name SnailBooking'
STANFORD_TENANT = '396573cb-f378-4b68-9bc8-15755c0c51f3'
GOOGLE_CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events.owned',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.freebusy',
]


class CalendarError(Exception):
    pass


class Providers:
    def __init__(self, config, store, cipher):
        self.config, self.store, self.cipher = config, store, cipher
        self.client = httpx.Client(timeout=12, follow_redirects=False)
        self.keys = {
            'google': jwt.PyJWKClient('https://www.googleapis.com/oauth2/v3/certs', timeout=12),
            'microsoft': jwt.PyJWKClient('https://login.microsoftonline.com/common/discovery/v2.0/keys', timeout=12),
        }

    def ready(self, provider):
        return bool(self.config.get(provider + '_client_id') and self.config.get(provider + '_client_secret'))

    def endpoints(self, provider, connect=False):
        if provider == 'google':
            return 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token'
        tenant = 'common' if connect else STANFORD_TENANT
        base = f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0'
        return base + '/authorize', base + '/token'

    def authorize(self, provider, data):
        scope = ['openid', 'email', 'profile']
        connect = bool(data['host'])
        if provider == 'google' and connect:
            scope += GOOGLE_CALENDAR_SCOPES
        if provider == 'microsoft':
            scope += ['User.Read']
            if connect:
                scope += ['offline_access', 'Calendars.ReadWrite']
        challenge = base64.urlsafe_b64encode(hashlib.sha256(data['verifier'].encode()).digest()).decode().rstrip('=')
        params = dict(client_id=self.config[provider + '_client_id'], redirect_uri=self.config['callback'],
                      response_type='code', scope=' '.join(scope), state=data['state'], nonce=data['nonce'],
                      code_challenge=challenge, code_challenge_method='S256', prompt='consent' if connect else 'select_account')
        if provider == 'google' and connect:
            params['access_type'] = 'offline'
        return self.endpoints(provider, connect)[0] + '?' + urlencode(params)

    def exchange(self, provider, code, data):
        response = self.client.post(self.endpoints(provider, bool(data['host']))[1], data={
            'client_id': self.config[provider + '_client_id'],
            'client_secret': self.config[provider + '_client_secret'], 'grant_type': 'authorization_code',
            'code': code, 'redirect_uri': self.config['callback'], 'code_verifier': data['verifier'],
        })
        if response.status_code != 200:
            raise CalendarError('Authorization failed. Please start sign-in again.')
        token = response.json()
        if data['host']:
            granted = set(token.get('scope', '').split())
            required = set(GOOGLE_CALENDAR_SCOPES) if provider == 'google' else {'Calendars.ReadWrite'}
            if not required.issubset(granted):
                raise CalendarError('Please grant all requested calendar permissions, then reconnect.')
        try:
            encoded = token['id_token']
            unverified = jwt.decode(encoded, options={'verify_signature': False})
            issuer = 'https://accounts.google.com'
            if provider == 'microsoft':
                tenant = str(uuid.UUID(unverified['tid']))
                issuer = f'https://login.microsoftonline.com/{tenant}/v2.0'
            claims = jwt.decode(encoded, self.keys[provider].get_signing_key_from_jwt(encoded).key,
                                algorithms=['RS256'], audience=self.config[provider + '_client_id'],
                                issuer=issuer, options={'require': ['exp', 'iat', 'sub', 'aud', 'iss']})
            if claims.get('nonce') != data['nonce']:
                raise ValueError('nonce')
            if claims.get('azp', self.config[provider + '_client_id']) != self.config[provider + '_client_id']:
                raise ValueError('authorized party')
            if provider == 'google':
                if not claims.get('email_verified'):
                    raise ValueError('unverified email')
                email = claims['email'].lower()
            else:
                profile = self.client.get(GRAPH + '/me', headers={'Authorization': 'Bearer ' + token['access_token']},
                                          params={'$select': 'mail,userPrincipalName,userType'})
                profile.raise_for_status()
                profile = profile.json()
                email = (profile.get('mail') or profile.get('userPrincipalName') or '').lower()
                if not data['host'] and (claims['tid'] != STANFORD_TENANT or profile.get('userType') != 'Member'):
                    raise ValueError('Stanford member required')
            if not data['host'] and not email.endswith('@stanford.edu'):
                raise ValueError('Stanford email required')
        except (KeyError, ValueError, jwt.PyJWTError, httpx.HTTPError) as exc:
            raise CalendarError('Please sign in with a verified Stanford account. Calendar connections require valid consent.') from exc
        token['expires_at'] = time.time() + token.get('expires_in', 3600)
        token.pop('id_token', None)
        return email, token

    def token(self, host):
        connection = self.store.connection(host)
        if not connection:
            raise CalendarError('Calendar not connected.')
        token = json.loads(self.cipher.decrypt(connection['tokens'].encode()))
        if token.get('expires_at', 0) < time.time() + 90:
            p = connection['provider']
            response = self.client.post(self.endpoints(p, True)[1], data={
                'client_id': self.config[p + '_client_id'], 'client_secret': self.config[p + '_client_secret'],
                'grant_type': 'refresh_token', 'refresh_token': token['refresh_token'],
            })
            if response.status_code != 200:
                raise CalendarError('Calendar needs to be reconnected.')
            token.update(response.json())
            token['expires_at'] = time.time() + token.get('expires_in', 3600)
            token.pop('id_token', None)
            # UPDATE tokens only: do not overwrite calendar choices changed by another request.
            with self.store.db() as db:
                db.execute('UPDATE connections SET tokens=? WHERE host=?',
                           (self.cipher.encrypt(json.dumps(token).encode()).decode(), host))
        return connection, token['access_token']

    def request(self, host, method, path, *, allow=(), **kwargs):
        connection, token = self.token(host)
        root = GOOGLE if connection['provider'] == 'google' else GRAPH
        # Pagination URLs come from providers, but never send a bearer to another origin.
        url = path if path.startswith('https://') else root + path
        if not url.startswith(root + '/') or urlparse(url).netloc != urlparse(root).netloc:
            raise CalendarError('Invalid calendar response.')
        headers = {'Authorization': 'Bearer ' + token, 'Prefer': 'outlook.timezone="UTC", IdType="ImmutableId"'}
        try:
            response = self.client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise CalendarError('Calendar is temporarily unreachable.') from exc
        if response.status_code not in allow and response.status_code >= 400:
            raise CalendarError('Calendar request failed. Reconnect or try again shortly.')
        return response

    def calendars(self, host):
        provider = self.store.connection(host)['provider']
        results = []
        if provider == 'google':
            page = None
            for _ in range(20):
                params = {'maxResults': 250}
                if page:
                    params['pageToken'] = page
                body = self.request(host, 'GET', '/users/me/calendarList', params=params).json()
                results += [dict(id=x['id'], name=x.get('summary', 'Calendar'), writable=x.get('accessRole') == 'owner')
                            for x in body.get('items', []) if not x.get('deleted')]
                page = body.get('nextPageToken')
                if not page:
                    return results
        else:
            path = '/me/calendars?$select=id,name,canEdit&$top=100'
            for _ in range(20):
                body = self.request(host, 'GET', path).json()
                results += [dict(id=x['id'], name=x['name'], writable=bool(x.get('canEdit'))) for x in body['value']]
                path = body.get('@odata.nextLink')
                if not path:
                    return results
        raise CalendarError('Too many calendars to load safely.')

    def busy(self, host, start, end):
        connection = self.store.connection(host)
        if not connection or not connection['calendars']:
            raise CalendarError('Choose conflict calendars first.')
        calendars = connection['calendars']
        periods = []
        if connection['provider'] == 'google':
            body = self.request(host, 'POST', '/freeBusy', json={
                'timeMin': iso(start), 'timeMax': iso(end), 'items': [{'id': c} for c in calendars],
            }).json()
            for cid in calendars:
                result = body.get('calendars', {}).get(cid)
                if result is None or result.get('errors'):
                    raise CalendarError('A selected calendar could not be checked.')
                periods += [(stamp(x['start']), stamp(x['end'])) for x in result.get('busy', [])]
        else:
            for cid in calendars:
                path = '/me/calendars/' + quote(cid, safe='') + '/calendarView?' + urlencode({
                    'startDateTime': iso(start), 'endDateTime': iso(end),
                    '$select': 'start,end,showAs,isCancelled', '$top': 1000,
                })
                for _ in range(20):
                    body = self.request(host, 'GET', path).json()
                    for event in body['value']:
                        if not event.get('isCancelled') and event.get('showAs') != 'free':
                            # Prefer UTC guarantees these dateTime fields are UTC even for all-day/recurring events.
                            periods.append((stamp(event['start']['dateTime'].removesuffix('Z') + 'Z'),
                                            stamp(event['end']['dateTime'].removesuffix('Z') + 'Z')))
                    path = body.get('@odata.nextLink')
                    if not path:
                        break
                else:
                    raise CalendarError('Calendar response exceeded safe pagination limit.')
        return periods

    def event_path(self, host):
        c = self.store.connection(host)
        return ('/calendars/' if c['provider'] == 'google' else '/me/calendars/') + quote(c['write_calendar'], safe='') + '/events'

    def lookup_event(self, host, booking, cancelling=False):
        marker = booking['id'] + host
        connection = self.store.connection(host)
        if connection['provider'] == 'google':
            event_id = hashlib.sha256(marker.encode()).hexdigest()
            response = self.request(host, 'GET', self.event_path(host) + '/' + event_id, allow=(404, 410))
            if response.status_code in (404, 410):
                return None
            event = response.json()
            if event.get('status') == 'cancelled':
                if cancelling:
                    return None
                raise CalendarError('The calendar event was removed. Cancel this booking before trying another slot.')
            return event['id']
        body = self.request(host, 'GET', '/me/events', params={
            '$filter': f"singleValueExtendedProperties/Any(ep: ep/id eq '{EXTENSION}' and ep/value eq '{marker}')",
            '$select': 'id',
        }).json()
        return body['value'][0]['id'] if body['value'] else None

    def create_event(self, host, booking, invite):
        existing = self.lookup_event(host, booking)
        if existing:
            return existing
        marker = booking['id'] + host
        names = ' & '.join(h.title() for h in booking['hosts'])
        description = (f"SNAIL office hours with {names}.\nBooked by {booking['email']}.\n"
                       f"Manage or cancel: {self.config['site']}\n"
                       'Please coordinate the meeting location with your host. Both-host bookings place a hold on each host calendar.')
        title = f'SNAIL office hours · {names}'
        c = self.store.connection(host)
        if c['provider'] == 'google':
            body = dict(id=hashlib.sha256(marker.encode()).hexdigest(), summary=title, description=html.escape(description),
                        start={'dateTime': iso(booking['start'])}, end={'dateTime': iso(booking['end'])},
                        transparency='opaque', visibility='private', guestsCanModify=False, guestsCanInviteOthers=False,
                        extendedProperties={'private': {'snailBooking': marker}})
            if invite:
                body['attendees'] = [{'email': booking['email']}]
            response = self.request(host, 'POST', self.event_path(host), json=body, params={'sendUpdates': 'all'}, allow=(409,))
            if response.status_code == 409:
                found = self.lookup_event(host, booking)
                if not found:
                    raise CalendarError('Calendar event could not be recovered.')
                return found
            return response.json()['id']
        body = dict(subject=title, body={'contentType': 'text', 'content': description},
                    start={'dateTime': iso(booking['start']).rstrip('Z'), 'timeZone': 'UTC'},
                    end={'dateTime': iso(booking['end']).rstrip('Z'), 'timeZone': 'UTC'},
                    showAs='busy', sensitivity='private', transactionId=marker,
                    singleValueExtendedProperties=[{'id': EXTENSION, 'value': marker}])
        if invite:
            body['attendees'] = [{'emailAddress': {'address': booking['email']}, 'type': 'required'}]
        return self.request(host, 'POST', self.event_path(host), json=body).json()['id']

    def delete_event(self, host, booking):
        event_id = booking['events'].get(host)
        if not event_id:
            event_id = self.lookup_event(host, booking, cancelling=True)
        if event_id:
            c = self.store.connection(host)
            path = self.event_path(host) + '/' + quote(event_id, safe='') if c['provider'] == 'google' else '/me/events/' + quote(event_id, safe='')
            self.request(host, 'DELETE', path, params={'sendUpdates': 'all'} if c['provider'] == 'google' else {}, allow=(404, 410))
