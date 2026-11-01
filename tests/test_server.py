#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
 tests/test_server.py — teste server.py de bout en bout (sans navigateur)
================================================================================
 Démarre le serveur sur un port libre, puis vérifie :
   • le service des fichiers statiques (200 / 404) ;
   • la poignée de main WebSocket (RFC 6455) et la présence des deux joueurs ;
   • le relais de l'état 3D, du chat, du coup de poing et de l'impact ;
   • le bornage des valeurs aberrantes envoyées par un client ;
   • la notification de déconnexion ;
   • le repli long-polling (POST /tx + GET /tx) et /status.

 USAGE :  python3 tests/test_server.py
================================================================================
"""
import base64
import hashlib
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = '127.0.0.1'
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
PORT = int(os.environ.get('LABO_TEST_PORT', '0'))


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def http(path, data=None, port=None):
    port = port or PORT
    req = urllib.request.Request(f'http://{HOST}:{port}{path}', data=data,
                                 headers={'Content-Type': 'application/json'} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class WS:
    """Client WebSocket minimal (masquage client obligatoire selon RFC 6455)."""

    def __init__(self, name, port=None):
        self.s = socket.create_connection((HOST, port or PORT), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET /ws?nom={name} HTTP/1.1\r\nHost: {HOST}\r\n"
                        f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.s.recv(4096)
        head = buf.split(b'\r\n\r\n')[0].decode()
        assert '101' in head, head
        assert base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode() in head
        self.buf = buf.split(b'\r\n\r\n', 1)[1]

    def send(self, obj):
        payload = json.dumps(obj).encode()
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        n = len(payload)
        head = bytearray([0x81])
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126); head += struct.pack('>H', n)
        else:
            head.append(0x80 | 127); head += struct.pack('>Q', n)
        self.s.sendall(bytes(head) + mask + masked)

    def _fill(self):
        while True:
            if len(self.buf) < 2:
                chunk = self.s.recv(65536)
                if not chunk:
                    raise ConnectionError('connexion fermée')
                self.buf += chunk
                continue
            b1, b2 = self.buf[0], self.buf[1]
            ln, off = b2 & 0x7f, 2
            if ln == 126:
                ln = struct.unpack('>H', self.buf[2:4])[0]; off = 4
            elif ln == 127:
                ln = struct.unpack('>Q', self.buf[2:10])[0]; off = 10
            if len(self.buf) < off + ln:
                self.buf += self.s.recv(65536); continue
            payload = self.buf[off:off + ln]; self.buf = self.buf[off + ln:]
            return b1 & 0x0f, payload

    def recv(self, timeout=3):
        self.s.settimeout(timeout)
        try:
            op, p = self._fill()
            return json.loads(p.decode()) if op == 1 else {'_op': op}
        except socket.timeout:
            return None

    def close(self):
        self.s.close()


PASS = FAIL = 0


def chk(label, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1; print('  ✓', label, extra)
    else:
        FAIL += 1; print('  ✗', label, extra)


def main():
    global PORT
    PORT = free_port()
    # environnement du serveur de test : JAMAIS de clé Groq réelle + dossier
    # de comptabilité jetable (les tests ne doivent pas appeler l'API)
    env = dict(os.environ)
    env.pop('GROQ_API_KEY', None); env.pop('GROQ_KEY_FILE', None)
    import tempfile
    tutor_dir = tempfile.mkdtemp(prefix='labo-tutor-test-')
    env['LABO_TUTOR_DIR'] = tutor_dir
    proc = subprocess.Popen([sys.executable, str(ROOT / 'server.py'), '--port', str(PORT),
                             '--name', 'Salle de test'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        for _ in range(60):
            try:
                socket.create_connection((HOST, PORT), timeout=.3).close(); break
            except OSError:
                time.sleep(.15)
        else:
            print('[ERREUR] le serveur ne démarre pas'); return 1

        print(f'--- serveur lancé sur le port {PORT} ---')

        for path, want in [('/', 200), ('/index.html', 200), ('/js/main.js', 200),
                           ('/css/style.css', 200), ('/js/state.js', 200), ('/inexistant.js', 404),
                           ('/../server.py', 403),      # traversal refusé (403 ou 404 selon le client)
                           ('/server.py', 200)]:
            st, body = http(path)
            chk(f'GET {path} -> {want}', st == want, f'({st}, {len(body)} octets)')

        a = WS('Alice'); b = WS('Bob')
        oa, ob = a.recv(), b.recv()
        chk('poignée de main WS + message « ok »', oa.get('t') == 'ok' and ob.get('t') == 'ok')
        chk('Bob voit Alice dans la liste des pairs',
            any(p['name'] == 'Alice' for p in ob.get('peers', [])))
        chk('Alice est avertie de l\'arrivée de Bob', a.recv().get('t') == 'join')

        a.send({'t': 'st', 's': {'x': 1.5, 'y': 1.62, 'z': 2.0, 'yaw': .7, 'pitch': -.2,
                                 'crouch': 0, 'zoom': 1, 'punch': 0, 'bob': 0, 'lvl': 'A'}})
        m = b.recv()
        chk('relais de l\'état 3D (position/rotation/zoom)',
            m.get('t') == 'st' and m['s']['x'] == 1.5 and m['s']['zoom'] == 1, str(m.get('s')))

        b.send({'t': 'chat', 'm': 'Salut Alice !'})
        got = [a.recv() for _ in range(1)]
        chk('relais du chat', any(g.get('t') == 'chat' and g['m'] == 'Salut Alice !' for g in got))

        a.send({'t': 'punch'})
        a.send({'t': 'hit', 'to': ob['id'], 'f': 3.6, 'dx': .4, 'dz': .9})
        got = [b.recv() for _ in range(3)]
        types = [g.get('t') for g in got]
        chk('relais du coup (punch) et de l\'impact (hit)', 'punch' in types and 'hit' in types, str(types))
        hit = next((g for g in got if g.get('t') == 'hit'), {})
        chk('l\'impact transporte la force et la direction', hit.get('f') == 3.6 and hit.get('fromName') == 'Alice')

        a.send({'t': 'st', 's': {'x': 'NaN', 'y': 1e9, 'z': None, 'yaw': 0}})
        m = b.recv()
        chk('valeurs aberrantes bornées côté serveur', abs(m['s']['x']) < 61 and abs(m['s']['y']) < 21, str(m['s']))

        b.close(); time.sleep(.3)
        left = [a.recv() for _ in range(2)]
        chk('notification de déconnexion', any(g and g.get('t') == 'leave' for g in left))
        a.close()

        # --- repli long-polling ---
        r = http('/tx', json.dumps({'id': 'p1', 'name': 'Carol', 'color': '#a3e635',
                                    'm': [{'t': 'hello', 'name': 'Carol'}]}).encode())
        chk('inscription en long-polling', json.loads(r[1]).get('new') is True)
        http('/tx', json.dumps({'id': 'p1', 'm': [{'t': 'st', 's': {'x': -2, 'y': 1.62, 'z': 1}}]}).encode())
        r = http('/tx?id=p1')
        chk('réception long-polling', json.loads(r[1]).get('ok') is True)
        st = json.loads(http('/status')[1])
        chk('/status liste les joueurs', any(w['name'] == 'Carol' for w in st['who']), str(st['players']) + ' joueur(s)')

        # --- tuteur « Ohmie » (sans clé : jamais d'appel à l'API Groq) ---
        print('--- tuteur Ohmie ---')
        st, body = http('/tutor/stats')
        j = json.loads(body)
        chk('GET /tutor/stats -> 200 et conforme',
            st == 200 and j.get('ok') is True and j.get('configured') is False
            and j['limits']['rpm'] == 30 and j['limits']['tpm'] == 8000
            and j['limits']['rpd'] == 1000 and j['limits']['tpd'] == 200000,
            f'({st}) {body[:120]!r}')
        chk('stats : pourcentages présents', 'pct_tokens' in j and 'pct_requests' in j)

        st, body = http('/tutor_docs/systeme.md')
        chk('GET /tutor_docs/* bloqué (doc serveur uniquement)', st == 404, f'({st})')
        st, body = http('/secrets/groq.key')
        chk('GET /secrets/* bloqué', st == 404, f'({st})')

        st, body = http('/tutor', json.dumps({'message': 'a'}).encode())
        chk('POST /tutor message trop court -> 400 amical',
            st == 400 and json.loads(body).get('ok') is False and 'courte' in json.loads(body).get('e', ''),
            f'({st})')
        st, body = http('/tutor', json.dumps({'message': '!!! ??? ...'}).encode())
        chk('POST /tutor signes seuls -> 400 amical',
            st == 400 and 'étranges' in json.loads(body).get('e', ''), f'({st})')
        st, body = http('/tutor', b'pas-du-json')
        chk('POST /tutor JSON invalide -> 400', st == 400, f'({st})')
        st, body = http('/tutor', json.dumps(
            {'message': 'Comment terminer la première mission ?', 'doc': 'tp1_A',
             'ctx': {'tp': 1}, 'history': []}).encode())
        j = json.loads(body)
        chk('POST /tutor sans clé API -> 503 + message amical (jamais brut)',
            st == 503 and j.get('ok') is False and 'clé' in j.get('e', '')
            and 'Traceback' not in j.get('e', ''), f'({st})')
        gros = json.dumps({'message': 'Question légitime sur le montage ?',
                           'ctx': {'tp': 1, 'bruit': 'x' * (33 * 1024)}}).encode()
        st, body = http('/tutor', gros)
        chk('POST /tutor corps > 32 Kio -> 413', st == 413, f'({st})')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    print(f'\n{PASS} réussi(s), {FAIL} échec(s)')
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
