from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo('America/Los_Angeles')
HOSTS = ('dan', 'klemen')
OPEN_DAYS = (0, 1, 3, 4)


def stamp(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('A timezone is required.')
    return parsed.timestamp()


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace('+00:00', 'Z')


def validate_slot(start, duration, now):
    local = datetime.fromtimestamp(start, PACIFIC)
    end = local + timedelta(minutes=duration)
    if (duration not in (30, 60) or local.weekday() not in OPEN_DAYS
            or local.minute not in (0, 30) or local.second or local.microsecond
            or not 12 <= local.hour < 14 or end.hour > 14 or (end.hour == 14 and end.minute)
            or start < now + 30 * 60 or start > now + 28 * 86400):
        raise ValueError('Choose a 30- or 60-minute slot during office hours, 30 minutes to 28 days ahead.')
    return end.timestamp()


def candidates(first_day, duration, now):
    for offset in range(7):
        day = first_day + timedelta(days=offset)
        for minute in (0, 30, 60, 90):
            start = (datetime.combine(day, time(12), PACIFIC) + timedelta(minutes=minute)).timestamp()
            try:
                end = validate_slot(start, duration, now)
                yield start, end
            except ValueError:
                continue


def overlaps(start, end, periods):
    return any(start < b and end > a for a, b in periods)
