#!/usr/bin/env python3
"""Interactive local Nest PCM OAuth. Never prints codes, tokens or client secrets.

Download a Web application OAuth client JSON privately, register the exact localhost
redirect, then run this helper. Keep output under ignored tmp/; paste properties only
in the private worker's Script Properties UI, never chat or source code.
"""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser


def authorize(client_file, project_id, output, port=8765, pubsub=False):
    if output.exists():
        raise ValueError('Output already exists; preserve it or choose another private output path')
    client = json.loads(client_file.read_text()).get('web')
    if not client or not client.get('client_id') or not client.get('client_secret'):
        raise ValueError('Expected downloaded Web application OAuth client JSON')
    redirect = f'http://localhost:{port}/callback'
    if redirect not in client.get('redirect_uris', []):
        raise ValueError('Register the localhost callback URI in the OAuth client first')
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    response = {}

    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # HTTP request paths contain authorization codes.

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if parsed.path != '/callback' or not secrets.compare_digest(params.get('state', [''])[0], state):
                self.send_error(400, 'Invalid authorization response')
                return
            response['code'] = params.get('code', [None])[0]
            response['error'] = 'Authorization declined' if params.get('error') else None
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(b'Authorization received. You may close this window.')

    query = urllib.parse.urlencode({'redirect_uri': redirect, 'access_type': 'offline', 'prompt': 'consent',
        'client_id': client['client_id'], 'response_type': 'code',
        'scope': 'https://www.googleapis.com/auth/pubsub' if pubsub else 'https://www.googleapis.com/auth/sdm.service', 'state': state,
        'code_challenge': challenge, 'code_challenge_method': 'S256'})
    with HTTPServer(('127.0.0.1', port), Callback) as server:
        server.timeout = 1
        base = 'https://accounts.google.com/o/oauth2/v2/auth' if pubsub else 'https://nestservices.google.com/partnerconnections/' + urllib.parse.quote(project_id, safe='') + '/auth'
        webbrowser.open(base + '?' + query)
        print('Complete Nest authorization in your browser. No thermostat commands will be sent.')
        deadline = time.monotonic() + 600
        while not response and time.monotonic() < deadline:
            server.handle_request()
    if not response.get('code') or response.get('error'):
        raise ValueError('Authorization incomplete or declined')
    body = urllib.parse.urlencode({'grant_type': 'authorization_code', 'code': response['code'],
        'redirect_uri': redirect, 'client_id': client['client_id'], 'client_secret': client['client_secret'],
        'code_verifier': verifier}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=body), timeout=45) as result:
            tokens = json.load(result)
    except (urllib.error.URLError, ValueError):
        raise ValueError('OAuth token exchange failed; response omitted to protect credentials') from None
    if not tokens.get('refresh_token'):
        raise ValueError('No refresh token returned; repeat consent with offline access')
    properties = {'NEST_DEVICE_ACCESS_PROJECT_ID': project_id, 'NEST_CLIENT_ID': client['client_id'],
                  'NEST_CLIENT_SECRET': client['client_secret'], 'NEST_REFRESH_TOKEN': tokens['refresh_token']}
    if pubsub:
        properties = {'NEST_PUBSUB_REFRESH_TOKEN': tokens['refresh_token']}
    output.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(properties, handle)
    print('Authorization stored in the private output file (mode 0600). No credentials printed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-file', type=Path, required=True)
    parser.add_argument('--device-access-project', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--pubsub', action='store_true', help='Authorize Pub/Sub separately; no SDM scope')
    args = parser.parse_args()
    try:
        authorize(args.client_file, args.device_access_project, args.output, pubsub=args.pubsub)
    except (ValueError, OSError):
        raise SystemExit('Nest authorization did not finish. Check client/callback configuration and try again; secrets were not printed.') from None
