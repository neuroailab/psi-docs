"""Browser fixtures never reach production calendar/booking endpoints."""
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / 'scratch' / 'office-hours-review'
OUTPUT.mkdir(parents=True, exist_ok=True)
PAGE = os.environ.get('OFFICE_HOURS_REVIEW_URL', 'http://127.0.0.1:8942/snail/office-hours/')
API = 'https://snail-api.35.206.117.162.sslip.io'
PACIFIC = ZoneInfo('America/Los_Angeles')
results = []


def check(condition, name):
    assert condition, name
    results.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/ccn2/u/klemenk/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args=['--no-sandbox'])
    for width, height in [(1440, 1000), (390, 844), (320, 740)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        state = {'connected': False, 'busy': False, 'bookings': [], 'host': False, 'offline': False, 'selected': []}

        def route_api(route):
            from urllib.parse import urlparse, parse_qs
            request = route.request
            url = urlparse(request.url)
            path, query = url.path, parse_qs(url.query)
            if state['offline'] and path == '/v1/availability':
                route.fulfill(status=503, json={'detail': 'Test outage'}, headers={'Access-Control-Allow-Origin': '*'})
                return
            if path == '/v1/config':
                data = {'providers': dict(google=state['connected'], microsoft=state['connected']), 'hosts': {h: {'connected': state['connected']} for h in ('dan', 'klemen')}}
            elif path == '/v1/me':
                data = {'email': 'yamins@stanford.edu' if state['host'] else 'student@stanford.edu', 'host': 'dan' if state['host'] else None}
            elif path == '/v1/availability':
                week = datetime.fromisoformat(query['week'][0]).replace(hour=12, tzinfo=PACIFIC)
                duration = int(query['duration'][0])
                host = query['host'][0]
                slots = []
                for day in [0, 1, 3, 4]:
                    for minute in range(0, 121-duration, 30):
                        start = week + timedelta(days=day, minutes=minute)
                        free = state['connected'] and not (state['busy'] and day == 0 and minute == 0)
                        slots.append({'start': start.isoformat(), 'end': (start + timedelta(minutes=duration)).isoformat(),
                                      'available_hosts': ['dan', 'klemen'] if free else [], 'available': free})
                data = {'hosts': {h: 'ready' if state['connected'] else 'not_connected' for h in ('dan', 'klemen')}, 'slots': slots,
                        'checked_at': datetime.now(PACIFIC).isoformat()}
            elif path == '/v1/bookings' and request.method == 'POST':
                body = request.post_data_json
                data = {'id': 'a' * 32, 'hosts': ['dan', 'klemen'] if body['host'] == 'both' else [body['host']],
                        'start': body['start'], 'end': (datetime.fromisoformat(body['start']) + timedelta(minutes=body['duration'])).isoformat(), 'status': 'confirmed'}
                state['bookings'] = [data]
            elif path == '/v1/bookings':
                data = state['bookings']
            elif path.startswith('/v1/bookings/'):
                state['bookings'] = []
                data = {'status': 'cancelled'}
            elif path == '/v1/host/calendars':
                if request.method == 'PUT':
                    state['selected'] = request.post_data_json['calendars']
                    data = {'ok': True}
                else:
                    data = {'connected': True, 'provider': 'microsoft', 'account': 'yamins@stanford.edu',
                            'selected': state['selected'], 'write_calendar': 'primary',
                            'calendars': [{'id': 'primary', 'name': 'Calendar', 'writable': True}, {'id': 'research', 'name': 'Research', 'writable': True}]}
            elif path == '/v1/auth/logout':
                data = {'ok': True}
            else:
                raise AssertionError('Unexpected test API request ' + request.method + ' ' + path)
            route.fulfill(json=data, headers={'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'})

        page.route(API + '/**', route_api)
        page.goto(PAGE, wait_until='networkidle')
        check(page.locator('[data-login=google]').is_disabled(), f'{width}: sign-in disabled until configured')
        check(page.locator('.time-slot:not(:disabled)').count() == 0, f'{width}: no fake availability')
        page.screenshot(path=str(OUTPUT / f'{width}-setup.png'), full_page=True)
        state['connected'] = True
        page.evaluate("sessionStorage.setItem('snail-token', 'browser-fixture-only')")
        page.reload(wait_until='networkidle')
        check(page.locator('#email').inner_text() == 'student@stanford.edu', f'{width}: signed-in UI')
        page.locator('input[name=host][value=both]').check(force=True)
        page.locator('input[name=duration][value="60"]').check(force=True)
        page.wait_for_timeout(150)
        check(page.locator('.time-slot').count() == 12, f'{width}: 60-minute contiguous starts')
        page.locator('.time-slot:not(:disabled)').first.click()
        check('Dan + Klemen' in page.locator('#selection-detail').inner_text(), f'{width}: both-host selection')
        page.screenshot(path=str(OUTPUT / f'{width}-booking.png'), full_page=True)
        page.locator('#book').click()
        page.wait_for_timeout(200)
        check(page.locator('.booking-row').count() == 1, f'{width}: confirmation and bookings list')
        page.on('dialog', lambda dialog: dialog.accept())
        page.get_by_role('button', name='Cancel booking', exact=True).click()
        page.wait_for_timeout(150)
        check(page.locator('.booking-row').count() == 0, f'{width}: cancellation')
        state['busy'] = True
        page.locator('#refresh').click()
        page.wait_for_timeout(150)
        check(page.locator('.time-slot').first.is_disabled(), f'{width}: external calendar change hides slot')
        state['host'] = True
        page.reload(wait_until='networkidle')
        check(page.locator('#host-panel').is_visible(), f'{width}: host calendar panel')
        page.locator('#calendar-settings input[value=research]').check()
        page.get_by_role('button', name='Save calendar choices').click()
        page.wait_for_timeout(150)
        check(set(state['selected']) == {'research', 'primary'}, f'{width}: calendar selection includes write calendar')
        state['offline'] = True
        page.locator('#refresh').click()
        page.wait_for_timeout(150)
        check(page.locator('.time-slot:not(:disabled)').count() == 0, f'{width}: outage fails closed')
        check(page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{width}: no horizontal overflow')
        check(not errors, f'{width}: no JavaScript errors')
        for sibling in ['directory', 'onboarding']:
            page.goto(PAGE.replace('office-hours/', sibling + '/'), wait_until='networkidle')
            check(page.get_by_role('link', name='Office hours', exact=True).is_visible(), f'{width}: {sibling} navigation')
            check(page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{width}: {sibling} no overflow')
        context.close()
    browser.close()

(OUTPUT / 'browser-results.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps({'checks': len(results), 'output': str(OUTPUT)}, indent=2))
