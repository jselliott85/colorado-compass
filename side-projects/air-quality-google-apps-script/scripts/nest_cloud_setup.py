"""Create only the dedicated Nest topic/subscription using locally authorized Pub/Sub OAuth."""
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'air-quality-nest'
TOPIC = f'projects/{PROJECT}/topics/nest-aq-events'
SUBSCRIPTION = f'projects/{PROJECT}/subscriptions/nest-aq-events-pull'


def setup():
    base = Path(__file__).resolve().parents[1] / 'tmp'
    client = json.loads((base / 'nest-oauth.json').read_text())
    grant = json.loads((base / 'nest-pubsub-oauth.json').read_text())
    body = urllib.parse.urlencode({'grant_type': 'refresh_token', 'client_id': client['NEST_CLIENT_ID'],
        'client_secret': client['NEST_CLIENT_SECRET'], 'refresh_token': grant['NEST_PUBSUB_REFRESH_TOKEN']}).encode()
    with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=body), timeout=30) as response:
        token = json.load(response)['access_token']

    def call(resource, method='GET', data=None):
        url = 'https://pubsub.googleapis.com/v1/' + resource
        request = urllib.request.Request(url, method=method,
            data=json.dumps(data).encode() if data is not None else None,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    def exists(resource):
        try:
            return call(resource)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            return None

    if not exists(TOPIC):
        call(TOPIC, 'PUT', {})
    policy = call(TOPIC + ':getIamPolicy')
    bindings = policy.setdefault('bindings', [])
    member = 'group:sdm-publisher@googlegroups.com'
    binding = next((b for b in bindings if b['role'] == 'roles/pubsub.publisher' and not b.get('condition')), None)
    if binding is None:
        binding = {'role': 'roles/pubsub.publisher', 'members': []}
        bindings.append(binding)
    if member not in binding['members']:
        binding['members'].append(member)
        call(TOPIC + ':setIamPolicy', 'POST', {'policy': policy})
    existing = exists(SUBSCRIPTION)
    if existing and existing.get('topic') != TOPIC:
        raise ValueError('Existing subscription points to a different topic; no replacement attempted')
    if not existing:
        call(SUBSCRIPTION, 'PUT', {'topic': TOPIC, 'ackDeadlineSeconds': 60,
            'messageRetentionDuration': '604800s', 'expirationPolicy': {}})
    print(json.dumps({'topic': TOPIC, 'subscription': SUBSCRIPTION, 'publisher_granted': True}))


if __name__ == '__main__':
    try:
        setup()
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Cloud setup failed: HTTP {error.code}. Response body/credentials withheld.') from None
    except (urllib.error.URLError, ValueError, OSError):
        raise SystemExit('Cloud setup did not finish; check project permissions/configuration. Credentials withheld.') from None
