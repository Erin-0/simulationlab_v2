#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
 LaboPhysique 3D  —  Serveur local (statique + relais multijoueur)
================================================================================
 Un SEUL fichier, AUCUNE dépendance externe (stdlib Python uniquement).

 Ce serveur fait deux choses :
   1. Il sert le jeu (index.html, css/, js/) sur http://localhost:PORT
   2. Il relaie l'état des joueurs entre les onglets/fenêtres connectés
      (positions, rotations, accroupissement, zoom, chat, coups, frappes).

 Une "salle" = un port. Deux ports différents sur la même machine
 => deux salles indépendantes (pratique pour faire deux groupes d'élèves).

 USAGE
 -----
     python3 server.py                 # salle par défaut sur le port 8000
     python3 server.py --port 8001     # seconde salle sur le port 8001
     python3 server.py --port 8000 --host 0.0.0.0 --name "Salle A"

 Puis, dans deux fenêtres du navigateur :
     http://localhost:8000/?nom=Alice
     http://localhost:8000/?nom=Bob        (ou simplement http://localhost:8000)

 TRANSPORTS
 ----------
   * WebSocket  (chemin /ws)   : temps réel, utilisé par défaut.
   * Long-polling HTTP (/tx)   : repli automatique si le WebSocket est bloqué
                                 (proxy scolaire, iframe restrictive…).
 Les deux parlent exactement le même protocole JSON, donc le client ne
 change rien à sa logique.
================================================================================
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import secrets
import signal
import struct
import sys
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# --------------------------------------------------------------------------- #
#  Configuration
# --------------------------------------------------------------------------- #
ROOT = Path(__file__).resolve().parent
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"      # RFC 6455 magic string
MAX_MSG = 64 * 1024                                    # 64 ko par message
PEER_TTL = 9.0                                         # s sans signe de vie -> expulsé
SWEEP_EVERY = 2.0                                      # fréquence du ménage
ROOMS: "dict[int, Room]" = {}                          # port -> salle

# Un seul fichier est servi tel quel, pas d'accès hors du dossier du jeu.
INDEX = ROOT / "index.html"
# Environment variables for TTS and Wall sync
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "onwK4e9ZLuTAKqWW03F9").strip()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE") or os.environ.get("SUPABASE_ANON", "").strip()
# --------------------------------------------------------------------------- #
#  Salle (un port = une salle = une liste de pairs)
# --------------------------------------------------------------------------- #
class Peer:
    """Un joueur connecté (WebSocket ou long-polling)."""

    __slots__ = ("pid", "name", "color", "transport", "state", "chat",
                 "last", "writer", "alive", "ws", "ws_send")

    def __init__(self, pid: str, name: str, color: str, transport: str):
        self.pid = pid
        self.name = name
        self.color = color
        self.transport = transport          # 'ws' | 'poll'
        self.state: dict = {}               # dernier état 3D reçu du client
        self.chat: list = []                # file d'attente pour le long-polling
        self.last = time.time()
        self.writer = None                  # asyncio.StreamWriter (ws)
        self.alive = True
        self.ws = None                      # WebSocketHandler
        self.ws_send = None                 # fonction d'envoi (posée à la volée)

    # -- sérialisation ------------------------------------------------------ #
    def public(self) -> dict:
        return {
            "id": self.pid,
            "name": self.name,
            "color": self.color,
            "transport": self.transport,
            "state": self.state,
        }


class Room:
    def __init__(self, port: int, name: str):
        self.port = port
        self.name = name
        self.peers: "dict[str, Peer]" = {}
        self.created = time.time()
        self.msg_in = 0
        self.msg_out = 0

    # -- présence ----------------------------------------------------------- #
    def add(self, peer: Peer) -> None:
        self.peers[peer.pid] = peer
        print(f"  [+] {peer.name or peer.pid}  ({peer.transport})  "
              f"-> {len(self.peers)} joueur(s) dans « {self.name} »")

    def remove(self, pid: str) -> None:
        p = self.peers.pop(pid, None)
        if not p:
            return
        p.alive = False
        print(f"  [-] {p.name or pid}  -> {len(self.peers)} joueur(s)")
        self.broadcast({"t": "leave", "id": pid}, skip=pid)

    # -- diffusion ---------------------------------------------------------- #
    def broadcast(self, msg: dict, skip: "str | None" = None) -> None:
        payload = json.dumps(msg, separators=(",", ":"))
        for peer in list(self.peers.values()):
            if peer.pid == skip or not peer.alive:
                continue
            if peer.transport == "ws":
                peer.ws_send(payload)
            else:
                peer.chat.append(payload)
                if len(peer.chat) > 240:          # garde-fou mémoire
                    del peer.chat[: len(peer.chat) - 240]
            self.msg_out += 1

    def send_to(self, pid: str, msg: dict) -> None:
        peer = self.peers.get(pid)
        if not peer or not peer.alive:
            return
        payload = json.dumps(msg, separators=(",", ":"))
        if peer.transport == "ws":
            peer.ws_send(payload)
        else:
            peer.chat.append(payload)
        self.msg_out += 1

    # -- relais des messages client ----------------------------------------- #
    def handle(self, sender: Peer, msg: dict) -> None:
        t = msg.get("t")
        sender.last = time.time()
        self.msg_in += 1

        if t == "st":                      # état 3D (position / rotation / …)
            st = msg.get("s")
            if isinstance(st, dict):
                st = _clamp_state(st)
                sender.state = st
                self.broadcast({"t": "st", "id": sender.pid, "s": st}, skip=sender.pid)

        elif t == "chat":                  # message de chat -> bulle au-dessus
            text = str(msg.get("m", ""))[:220].strip()
            if text:
                self.broadcast({"t": "chat", "id": sender.pid,
                                "name": sender.name, "m": text})

        elif t == "punch":                 # le frappeur annonce son geste
            self.broadcast({"t": "punch", "id": sender.pid}, skip=sender.pid)

        elif t == "hit":                   # la victime encaisse
            target = str(msg.get("to", ""))
            if target in self.peers:
                self.send_to(target, {"t": "hit", "from": sender.pid,
                                      "fromName": sender.name,
                                      "f": _num(msg.get("f"), 3.4, 0, 12),
                                      "dx": _num(msg.get("dx"), 0, -1, 1),
                                      "dz": _num(msg.get("dz"), 0, -1, 1)})

        elif t == "bye":
            self.remove(sender.pid)

        elif t == "ping":
            self.send_to(sender.pid, {"t": "pong", "k": msg.get("k")})

        elif t == "hello":                 # (long-polling) re-bonjour
            sender.name = _clean_name(msg.get("name")) or sender.name
            sender.color = str(msg.get("color") or sender.color)[:9]
            self.broadcast({"t": "join", "p": sender.public()}, skip=sender.pid)

    # -- ménage ------------------------------------------------------------- #
    def sweep(self) -> None:
        now = time.time()
        for pid in list(self.peers):
            if now - self.peers[pid].last > PEER_TTL:
                print(f"  [~] {pid} expiré (plus de signe de vie)")
                self.remove(pid)

    def stats(self) -> dict:
        return {
            "room": self.name,
            "port": self.port,
            "players": len(self.peers),
            "uptime": round(time.time() - self.created, 1),
            "in": self.msg_in,
            "out": self.msg_out,
            "who": [p.public() for p in self.peers.values()],
        }


# --------------------------------------------------------------------------- #
#  Petits utilitaires de validation (on ne fait jamais confiance au client)
# --------------------------------------------------------------------------- #
def _num(v, default=0.0, lo=-1e6, hi=1e6) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f:                              # NaN
        return default
    return max(lo, min(hi, f))


def _clamp_state(s: dict) -> dict:
    """Bornage de l'état 3D : évite les NaN / valeurs absurdes dans le relais."""
    out = {
        "x": _num(s.get("x"), 0, -60, 60),
        "y": _num(s.get("y"), 1.6, -5, 20),
        "yaw": _num(s.get("yaw"), 0, -100, 100),
        "pitch": _num(s.get("pitch"), 0, -3, 3),
        "crouch": 1 if s.get("crouch") else 0,
        "zoom": 1 if s.get("zoom") else 0,
        "punch": _num(s.get("punch"), 0, 0, 1),
        "hurt": _num(s.get("hurt"), 0, 0, 1),
        "bob": _num(s.get("bob"), 0, -10, 10),
        "lvl": str(s.get("lvl") or "A")[:2],
    }
    return out


def _clean_name(v) -> str:
    s = "".join(ch for ch in str(v or "") if ch.isprintable() and ch not in "<>&\"")
    return s.strip()[:18]


# --------------------------------------------------------------------------- #
#  TUTEUR « OHMIE » — relais Groq côté serveur
#
#  SÉCURITÉ DE LA CLÉ : elle vit UNIQUEMENT sur le serveur.
#    1. variable d'environnement  GROQ_API_KEY          (recommandé en prod)
#    2. variable d'environnement  GROQ_KEY_FILE         (chemin d'un fichier)
#    3. fichier par défaut  ~/.config/labo3d/groq.key   (chmod 600, hors web)
#  Elle n'est JAMAIS envoyée au navigateur, JAMAIS loguée, et le dossier
#  tutor_docs/ (contextes envoyés au modèle) est exclu du serveur statique.
#
#  LIMITES DU MODÈLE (openai/gpt-oss-120b sur Groq) :
#    30 requêtes / 8 000 jetons par minute · 1 000 requêtes / 200 000 jetons
#    par jour — appliquées ICI, et comptabilité précise (champ `usage` de
#    l'API) exposée au client via GET /tutor/stats (pourcentage rouge).
# --------------------------------------------------------------------------- #
import re as _tre
import urllib.request
import urllib.error
from collections import deque as _tdeque

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
TUTOR_RPM, TUTOR_TPM = 30, 8000            # requêtes / jetons par minute
TUTOR_RPD, TUTOR_TPD = 1000, 200_000       # requêtes / jetons par jour
TUTOR_MAX_MSG = 600                        # caractères max d'une question
TUTOR_MAX_BODY = 32 * 1024                 # poids max d'un POST /tutor
TUTOR_MAX_OUT = 2048                        # jetons max d'une réponse
TUTOR_DOCS = ROOT / "tutor_docs"
TUTOR_DOC_KEYS = {
    "tp1_A": "tp1_A.md", "tp1_B": "tp1_B.md",
    "tp2_rc": "tp2_rc.md", "tp2_cr": "tp2_cr.md", "tp2_bande": "tp2_bande.md",
    "tp3_1": "tp3_1.md", "tp3_2": "tp3_2.md", "tp3_3": "tp3_3.md",
    "tp3_4": "tp3_4.md", "tp3_5": "tp3_5.md",
}
TUTOR_FRIENDLY_ERR = ("Oups ! Un petit court-circuit dans mes neurones : "
                      "je n'ai pas pu répondre. Réessaie dans quelques "
                      "secondes, je reboot. ^_^")


def tutor_cfg_dir() -> Path:
    d = Path(os.environ.get("LABO_TUTOR_DIR",
                            str(Path.home() / ".config" / "labo3d")))
    try:
        d.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return d


def tutor_key() -> "str | None":
    """Clé API Groq : env d'abord, puis fichier 600 hors racine web."""
    k = os.environ.get("GROQ_API_KEY", "").strip()
    if k:
        return k
    p = os.environ.get("GROQ_KEY_FILE", "").strip() \
        or str(tutor_cfg_dir() / "groq.key")
    try:
        f = Path(p)
        if f.is_file():
            return f.read_text(encoding="utf-8").strip() or None
    except OSError:
        return None
    return None


# ---- comptabilité : fenêtre glissante 1 min + compteurs du jour (fichier) --
_TUTOR_MIN = _tdeque()                                  # (horloge, jetons)
_TUTOR_DAY = {"date": "", "tokens": 0, "requests": 0}


def _tutor_day_load() -> None:
    today = time.strftime("%Y-%m-%d")
    if _TUTOR_DAY["date"] == today:
        return
    try:
        d = json.loads((tutor_cfg_dir() / "usage.json").read_text("utf-8"))
        if isinstance(d, dict) and d.get("date") == today:
            _TUTOR_DAY.update({"date": today,
                               "tokens": int(d.get("tokens", 0)),
                               "requests": int(d.get("requests", 0))})
            return
    except Exception:
        pass
    _TUTOR_DAY.update({"date": today, "tokens": 0, "requests": 0})


def _tutor_day_save() -> None:
    try:
        (tutor_cfg_dir() / "usage.json").write_text(
            json.dumps(_TUTOR_DAY), encoding="utf-8")
    except OSError:
        pass


def _tutor_minute() -> "tuple[int, int]":
    now = time.monotonic()
    while _TUTOR_MIN and now - _TUTOR_MIN[0][0] > 60:
        _TUTOR_MIN.popleft()
    return len(_TUTOR_MIN), sum(t for _, t in _TUTOR_MIN)


def tutor_stats_payload() -> dict:
    _tutor_day_load()
    rmin, tmin = _tutor_minute()
    return {
        "ok": True, "configured": tutor_key() is not None,
        "model": GROQ_MODEL,
        "day_tokens": _TUTOR_DAY["tokens"], "day_requests": _TUTOR_DAY["requests"],
        "min_requests": rmin, "min_tokens": tmin,
        "pct_tokens": round(100 * _TUTOR_DAY["tokens"] / TUTOR_TPD, 2),
        "pct_requests": round(100 * _TUTOR_DAY["requests"] / TUTOR_RPD, 2),
        "limits": {"rpm": TUTOR_RPM, "tpm": TUTOR_TPM,
                   "rpd": TUTOR_RPD, "tpd": TUTOR_TPD},
    }


# ---- garde-fous d'entrée (anti-abus, anti-bruit) ---------------------------
_TUTOR_WORD = _tre.compile(r"[A-Za-z0-9\u00c0-\u017f]{2,}")


def tutor_validate(msg) -> "str | None":
    """None si OK, sinon un message amical expliquant le refus."""
    if not isinstance(msg, str):
        return "Hmm, je n'ai rien reçu de lisible : réécris ta question ? o_O"
    m = msg.strip()
    if len(m) < 2:
        return "Question trop courte pour moi : deux caractères minimum, je t'écoute ! ^_^"
    if len(m) > TUTOR_MAX_MSG:
        return (f"Houla, {len(m)} caractères d'un coup ! Coupe ta question en "
                f"morceaux de {TUTOR_MAX_MSG} caractères max, je répondrai mieux. o_o")
    if not _TUTOR_WORD.search(m):
        return "Je ne vois que des signes étranges… écris-moi une petite phrase en français, veux-tu ? o_O"
    if any(ord(c) < 32 for c in m):
        return "Ton message contient des caractères invisibles : recopie-le en texte simple. ^_^"
    return None


# ---- mise en forme du contexte envoyé au modèle ----------------------------
def tutor_context_text(c: dict) -> str:
    if not isinstance(c, dict):
        return ""
    L = ["ÉTAT DU BANC (instantané, fourni par le simulateur) :"]
    tp = c.get("tp")
    L.append(f"- TP actif : {tp}" + (f" · niveau {c.get('niveau')}" if tp == 1 else "")
             + (f" · filtre {c.get('filtre')}" if tp == 2 else "")
             + (f" · manipulation {c.get('manip')}" if tp == 3 else ""))
    g = c.get("generateur") or {}
    if g:
        L.append(f"- Générateur TP1 : {'allumé' if g.get('on') else 'ÉTEINT'}, consigne {g.get('consigne_V')} V")
    m = c.get("multimetres") or {}
    if m:
        L.append(f"- Voltmètre : calibre {m.get('calibre_V')} V, aiguille à {m.get('aiguille_V_div')} div · "
                 f"Ampèremètre : calibre {m.get('calibre_mA')} mA, aiguille à {m.get('aiguille_mA_div')} div"
                 + (" · SURCHARGE (OL)" if m.get("surcharge") else ""))
    gb = c.get("gbf") or {}
    if gb:
        L.append(f"- GBF : {'ON' if gb.get('on') else 'OFF'}, f = {gb.get('frequence_Hz')} Hz, amplitude {gb.get('amplitude_Vcc')} Vcc (bouton aveugle)")
    o = c.get("oscilloscope") or {}
    if o:
        L.append(f"- Oscilloscope : CH1 {o.get('vdiv1')} V/div, CH2 {o.get('vdiv2')} V/div, "
                 f"{o.get('tdiv')} s/div · sonde CH1 {'branchée' if o.get('sonde_ch1') else 'NON branchée'}, "
                 f"sonde CH2 {'branchée' if o.get('sonde_ch2') else 'NON branchée'}")
    t3 = c.get("tp3") or {}
    if t3:
        L.append(f"- TP3 : E1 {t3.get('e1')} · E2 {t3.get('e2')} · rhéostat {t3.get('rheo')} Ω · topologie : {t3.get('topologie')}")
    w = c.get("cablage")
    if isinstance(w, list):
        L.append(f"- Câblage ({len(w)} fil(s)) : " + (" ; ".join(f"{a}—{b}" for a, b in w[:40]) or "aucun fil"))
    mis = c.get("missions")
    if isinstance(mis, list):
        L.append("- Objectifs de l'étape : " + " ; ".join(
            f"[{'OK' if mm.get('ok') else 'à faire'}] {mm.get('t')}" for mm in mis[:12]))
    f = c.get("feuille") or {}
    if f:
        L.append(f"- Feuille de relevés : {f.get('lignes', 0)} ligne(s) TP1, {f.get('cases9', 0)} case(s) table 9 remplie(s)")
    return "\n".join(L)


def tutor_doc_text(key: str) -> str:
    name = TUTOR_DOC_KEYS.get(key or "", "")
    if not name:
        return ""
    try:
        return (TUTOR_DOCS / name).read_text(encoding="utf-8")
    except OSError:
        return ""


def tutor_system_text(doc_key: str) -> str:
    parts = []
    for n in ("systeme.md", "labo.md"):
        try:
            parts.append((TUTOR_DOCS / n).read_text(encoding="utf-8"))
        except OSError:
            pass
    d = tutor_doc_text(doc_key)
    if d:
        parts.append("# DOSSIER DU NIVEAU EN COURS\n" + d)
    return "\n\n".join(parts)


def _tutor_clean_history(h) -> list:
    out = []
    if isinstance(h, list):
        for it in h[-6:]:
            if isinstance(it, dict) and it.get("role") in ("user", "assistant"):
                c = str(it.get("content") or "")[:2000]
                if c.strip():
                    out.append({"role": it["role"], "content": c})
    return out


def _groq_call(messages: list) -> dict:
    # Cloudflare (devant api.groq.com) renvoie 403 / "error code: 1010"
    # à tout client sans User-Agent "navigateur".  On se présente comme
    # un navigateur : Groq accepte, Cloudflare laisse passer.
    UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
          "AppleWebKit/537.36 (KHTML, like Gecko) "
          "Chrome/120.0.0.0 Safari/537.36")
    base_headers = {
        "Authorization": f"Bearer {tutor_key()}",
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Accept": "application/json",
    }

    body = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.6,
        "max_completion_tokens": TUTOR_MAX_OUT,
        # GPT-OSS-120B est un modèle de RAISONNEMENT : sans consigne, il
        # consomme tout le budget en "reasoning" et laisse "content" vide
        # (finish_reason: "length").  "low" limite la réflexion interne
        # et garantit de la place pour la réponse finale.
        "reasoning_effort": "low",
    }

    def _post(b: dict) -> dict:
        req = urllib.request.Request(
            GROQ_URL,
            data=json.dumps(b).encode("utf-8"),
            headers=base_headers,
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))

    try:
        resp = _post(body)
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", "replace")
        # Repli historique : ancienne API qui refuse max_completion_tokens.
        if e.code == 400 and "max_completion_tokens" in err_text:
            body.pop("max_completion_tokens", None)
            body["max_tokens"] = TUTOR_MAX_OUT
            resp = _post(body)
        # Repli : si "reasoning_effort" n'est pas reconnu par le modèle,
        # on retire le paramètre et on retente (le fallback "content vide"
        # ci-dessous s'occupera quand même de la réponse).
        elif e.code == 400 and "reasoning_effort" in err_text:
            body.pop("reasoning_effort", None)
            resp = _post(body)
        else:
            raise

    # --- Fallback : GPT-OSS laisse parfois "content" vide et met tout
    #     dans "reasoning".  On récupère ce qui est exploitable pour
    #     éviter une bulle vide au client.
    try:
        msg = resp["choices"][0]["message"]
        if not (msg.get("content") or "").strip():
            reasoning = (msg.get("reasoning") or msg.get("reasoning_content") or "").strip()
            msg["content"] = reasoning or "Hmm… je n'ai rien réussi à formuler cette fois. Reformule ta question ? ^_^"
    except (KeyError, IndexError, TypeError):
        pass

    return resp

# --------------------------------------------------------------------------- #
#  WebSocket (RFC 6455) — implémentation minimale sur asyncio
# --------------------------------------------------------------------------- #
def ws_accept_key(key: str) -> str:
    return base64.b64encode(hashlib.sha1((key.strip() + WS_GUID).encode()).digest()).decode()


def ws_encode(payload: str, opcode: int = 0x1) -> bytes:
    data = payload.encode("utf-8") if isinstance(payload, str) else payload
    n = len(data)
    head = bytearray([0x80 | opcode])
    if n < 126:
        head.append(n)
    elif n < 65536:
        head.append(126)
        head += struct.pack(">H", n)
    else:
        head.append(127)
        head += struct.pack(">Q", n)
    return bytes(head) + data


class WSConn:
    """Lecture/écriture d'une connexion WebSocket sur un StreamReader."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer
        self.closed = False
        self._frag = bytearray()
        self._frag_opcode = 0

    async def recv(self) -> "str | None":
        """Renvoie le prochain message texte, ou None si la connexion tombe."""
        while True:
            b1 = await self.reader.readexactly(1)
            b2 = await self.reader.readexactly(1)
            fin = b1[0] & 0x80
            opcode = b1[0] & 0x0F
            masked = b2[0] & 0x80
            ln = b2[0] & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", await self.reader.readexactly(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", await self.reader.readexactly(8))[0]
            if ln > MAX_MSG:
                raise ValueError("message trop volumineux")
            mask = await self.reader.readexactly(4) if masked else b""
            data = await self.reader.readexactly(ln) if ln else b""
            if masked:
                data = bytes(c ^ mask[i & 3] for i, c in enumerate(data))

            if opcode == 0x8:                                   # close
                return None
            if opcode == 0x9:                                   # ping -> pong
                await self.raw(ws_encode(data, 0xA))
                continue
            if opcode == 0xA:                                   # pong
                continue

            if opcode == 0x0:                                   # continuation
                self._frag += data
            else:
                self._frag_opcode = opcode
                self._frag = bytearray(data)

            if fin:
                msg = bytes(self._frag)
                self._frag.clear()
                if self._frag_opcode == 0x1:
                    return msg.decode("utf-8", "replace")
                # binaire : non utilisé par le jeu
        return None

    async def raw(self, data: bytes) -> None:
        if self.closed:
            return
        self.writer.write(data)
        try:
            await self.writer.drain()
        except (ConnectionResetError, BrokenPipeError):
            self.closed = True

    async def send(self, text: str) -> None:
        await self.raw(ws_encode(text, 0x1))

    def close(self) -> None:
        self.closed = True
        try:
            self.writer.close()
        except Exception:
            pass


async def ws_handshake(reader, writer, headers) -> bool:
    key = headers.get("sec-websocket-key")
    if not key:
        writer.write(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        return False
    resp = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {ws_accept_key(key)}\r\n\r\n"
    )
    writer.write(resp.encode())
    await writer.drain()
    return True


# --------------------------------------------------------------------------- #
#  Serveur HTTP + WS
# --------------------------------------------------------------------------- #
class Server:
    def __init__(self, port: int, room_name: str):
        self.port = port
        self.room = Room(port, room_name)
        ROOMS[port] = self.room

    # ------------------------------------------------------------------ #
    async def handle_conn(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            request_line = await asyncio.wait_for(reader.readline(), 15)
        except (asyncio.TimeoutError, ConnectionResetError):
            writer.close()
            return
        if not request_line:
            writer.close()
            return
        try:
            method, target, _ver = request_line.decode("latin-1").split(" ", 2)
        except ValueError:
            writer.close()
            return

        headers = {}
        while True:
            line = await reader.readline()
            if line in (b"\r\n", b"\n", b""):
                break
            if b":" in line:
                k, v = line.decode("latin-1").split(":", 1)
                headers[k.strip().lower()] = v.strip()

        url = urlparse(target)
        path = url.path or "/"
        query = parse_qs(url.query)

        try:
            if "upgrade" in headers.get("connection", "").lower() and path == "/ws":
                if await ws_handshake(reader, writer, headers):
                    await self.ws_session(reader, writer, query)
                return
            if method == "GET":
                await self.http_get(writer, path, query)
            elif method == "POST":
                await self.http_post(reader, writer, path, headers, query)
            elif method == "OPTIONS":
                await self._send(writer, 204, b"", "text/plain",
                                 extra={"Access-Control-Allow-Origin": "*",
                                        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
                                        "Access-Control-Allow-Headers": "Content-Type"})
            else:
                await self._send(writer, 405, b"405 Method Not Allowed", "text/plain")
        except (ConnectionResetError, BrokenPipeError, asyncio.IncompleteReadError):
            pass
        except Exception as exc:                       # ne jamais tuer le serveur
            print(f"  [!] erreur requête : {exc!r}")
            try:
                await self._send(writer, 500, b"500 Internal Server Error", "text/plain")
            except Exception:
                pass
        finally:
            try:
                if not writer.is_closing():
                    writer.close()
            except Exception:
                pass

    # ------------------------------------------------------------------ #
    #  WebSocket : session de jeu
    # ------------------------------------------------------------------ #
    async def ws_session(self, reader, writer, query):
        conn = WSConn(reader, writer)
        peer = Peer(secrets.token_hex(4),
                    _clean_name(query.get("nom", query.get("name", [""]))[0]),
                    "#22d3ee", "ws")
        peer.ws = conn
        peer.writer = writer

        def ws_send(payload: str) -> None:
            if peer.alive and not conn.closed:
                asyncio.ensure_future(conn.send(payload))
        peer.ws_send = ws_send                      # type: ignore[attr-defined]

        self.room.add(peer)
        await conn.send(json.dumps({
            "t": "ok", "id": peer.pid,
            "peers": [p.public() for k, p in self.room.peers.items() if k != peer.pid],
            "room": self.room.name,
        }, separators=(",", ":")))
        self.room.broadcast({"t": "join", "p": peer.public()}, skip=peer.pid)

        try:
            while True:
                raw = await conn.recv()
                if raw is None:
                    break
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict):
                    if msg.get("t") == "hello":
                        peer.name = _clean_name(msg.get("name")) or peer.name
                        peer.color = str(msg.get("color") or peer.color)[:9]
                        self.room.broadcast({"t": "join", "p": peer.public()}, skip=peer.pid)
                    self.room.handle(peer, msg)
        except (asyncio.IncompleteReadError, ConnectionResetError, ValueError, OSError):
            pass
        finally:
            self.room.remove(peer.pid)
            conn.close()

    # ------------------------------------------------------------------ #
    #  Long-polling de secours :  POST /tx  (envoi)   GET /tx (réception)
    # ------------------------------------------------------------------ #
    async def http_post(self, reader, writer, path, headers, query):
        length = int(headers.get("content-length", "0") or 0)
        if length > TUTOR_MAX_BODY and path == "/tutor":
            await self._json(writer, 413, {
                "ok": False,
                "e": "Message trop volumineux pour Ohmie : allège ta question. o_o"})
            return
        body = await reader.readexactly(length) if length else b""

        if path == "/tutor":
            await self.tutor_ask(writer, body)
            return

        # ---> ADD THIS:
        if path == "/api/tts":
            await self.tts_speak(writer, body)
            return

        if path == "/api/wall":
            await self.wall_post(writer, body)
            return
        # <---
        

        if path == "/tx":
            try:
                msg = json.loads(body.decode("utf-8", "replace") or "{}")
            except json.JSONDecodeError:
                await self._json(writer, 400, {"ok": False})
                return
            pid = str(msg.get("id") or "")[:32]
            if not pid:
                await self._json(writer, 400, {"ok": False, "e": "id manquant"})
                return
            peer = self.room.peers.get(pid)
            if peer is None or peer.transport != "poll":
                # (re)inscription du joueur en mode polling
                peer = Peer(pid, _clean_name(msg.get("name")),
                            str(msg.get("color") or "#22d3ee")[:9], "poll")
                self.room.add(peer)
                await self._json(writer, 200, {
                    "ok": True, "new": True,
                    "peers": [p.public() for k, p in self.room.peers.items() if k != pid],
                    "room": self.room.name,
                })
                return
            inner = msg.get("m")
            if isinstance(inner, dict):
                self.room.handle(peer, inner)
            elif isinstance(inner, list):
                for it in inner:
                    if isinstance(it, dict):
                        self.room.handle(peer, it)
            peer.last = time.time()
            await self._json(writer, 200, {"ok": True})
            return

        await self._json(writer, 404, {"ok": False, "e": "route inconnue"})

    # ------------------------------------------------------------------ #
    #  Tuteur « Ohmie » : POST /tutor  (relais Groq, clé côté serveur)
    # ------------------------------------------------------------------ #
    async def tutor_ask(self, writer, body: bytes) -> None:
        try:
            req = json.loads(body.decode("utf-8", "replace") or "{}")
        except json.JSONDecodeError:
            await self._json(writer, 400, {
                "ok": False, "e": "Je n'ai pas compris ta requête : réessaie. o_O"})
            return
        if not isinstance(req, dict):
            await self._json(writer, 400, {"ok": False, "e": "Requête invalide."})
            return

        msg = req.get("message")
        err = tutor_validate(msg)
        if err:
            await self._json(writer, 400, {"ok": False, "e": err})
            return

        key = tutor_key()
        if not key:
            await self._json(writer, 503, {
                "ok": False,
                "e": ("Ohmie est muet pour l'instant : la clé API du tuteur "
                      "n'est pas configurée sur ce serveur. Vois le README, "
                      "section « Robot tuteur Ohmie » pour la lui donner. ^_^")})
            return

        # ---- limites de débit (minute glissante + quotas du jour) ---- #
        _tutor_day_load()
        rmin, tmin = _tutor_minute()
        if _TUTOR_DAY["requests"] >= TUTOR_RPD or _TUTOR_DAY["tokens"] >= TUTOR_TPD:
            await self._json(writer, 429, {
                "ok": False,
                "e": ("Quota quotidien du tuteur atteint : Ohmie recharge ses "
                      "batteries jusqu'à demain. o_O"),
                "stats": tutor_stats_payload()})
            return
        if rmin >= TUTOR_RPM:
            await self._json(writer, 429, {
                "ok": False,
                "e": ("Trop de questions d'un coup ! Laisse-moi respirer "
                      "quelques secondes. ^_^"),
                "stats": tutor_stats_payload()})
            return
        if tmin >= TUTOR_TPM:
            await self._json(writer, 429, {
                "ok": False,
                "e": ("Beaucoup de texte cette minute-ci : attends un instant "
                      "avant de me reposer une question. o_o"),
                "stats": tutor_stats_payload()})
            return

        # ---- construction du prompt ---- #
        messages = [{"role": "system",
                     "content": tutor_system_text(str(req.get("doc") or ""))}]
        messages += _tutor_clean_history(req.get("history"))
        ctx_txt = tutor_context_text(req.get("ctx"))
        user_msg = msg.strip()
        if ctx_txt:
            user_msg = ctx_txt + "\n\nQUESTION DE L'ÉTUDIANT :\n" + user_msg
        messages.append({"role": "user", "content": user_msg})

        # ---- appel Groq (thread : ne bloque pas la boucle asyncio) ---- #
        try:
            resp = await asyncio.to_thread(_groq_call, messages)
        except Exception as exc:
            print(f"  [tutor] erreur Groq : {exc!r}")
            await self._json(writer, 502, {
                "ok": False,
                "e": ("Oups ! Un petit souci technique m'empêche de répondre "
                      "pour l'instant. Réessaie dans quelques secondes. >_<")})
            return

        try:
            reply = resp["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            await self._json(writer, 502, {
                "ok": False,
                "e": ("Oups ! Ma réponse est partie en fumée : repose-moi la "
                      "question, veux-tu ? >_<")})
            return
        reply = "".join(ch for ch in reply if ord(ch) >= 32 or ch in "\n\t")[:4000]
        usage = resp.get("usage") or {}
        tot = int(usage.get("total_tokens") or 0) or max(1, len(user_msg) // 4 + len(reply) // 4)

        # ---- comptabilité précise (jetons réellement facturés) ---- #
        _TUTOR_MIN.append((time.monotonic(), tot))
        _TUTOR_DAY["tokens"] += tot
        _TUTOR_DAY["requests"] += 1
        _tutor_day_save()

        await self._json(writer, 200, {
            "ok": True, "reply": reply, "tokens": tot,
            "stats": tutor_stats_payload()})
    # ------------------------------------------------------------------ #
    #  Relais ElevenLabs TTS
    # ------------------------------------------------------------------ #
    # ------------------------------------------------------------------ #
    #  Relais ElevenLabs TTS
    # ------------------------------------------------------------------ #
    async def tts_speak(self, writer, body: bytes) -> None:
        if not ELEVENLABS_API_KEY:
            await self._json(writer, 503, {"ok": False, "fallback": True, "error": "ELEVENLABS_API_KEY non configurée."})
            return

        try:
            data = json.loads(body.decode("utf-8", "replace") or "{}")
            text = str(data.get("text", "")).strip()
            if not text:
                await self._json(writer, 400, {"ok": False, "error": "Texte manquant"})
                return

            # Troncature à 280 caractères
            if len(text) > 280:
                cut = text[:280]
                last_p = max(cut.rfind('.'), cut.rfind('!'), cut.rfind('?'))
                text = cut[:last_p + 1] if last_p > 100 else cut[:cut.rfind(' ')] + '...'

            url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128"
            payload = json.dumps({
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {"stability": 0.55, "similarity_boost": 0.80, "speed": 1.02}
            }).encode("utf-8")

            # Emulate standard browser User-Agent so Cloudflare doesn't drop the connection
            UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36")

            req = urllib.request.Request(url, data=payload, headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
                "User-Agent": UA
            })

            def _call_eleven():
                with urllib.request.urlopen(req, timeout=15) as r:
                    return r.read()

            audio_data = await asyncio.to_thread(_call_eleven)

        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", "replace")
            print(f"  [TTS] Erreur API ElevenLabs ({e.code}): {err_msg}")
            await self._json(writer, e.code, {"ok": False, "fallback": True, "error": err_msg})
            return
        except Exception as exc:
            print(f"  [TTS] Erreur connexion ElevenLabs : {exc!r}")
            await self._json(writer, 500, {"ok": False, "fallback": True, "error": str(exc)})
            return

        # Send audio back to the browser
        try:
            await self._send(writer, 200, audio_data, "audio/mpeg", extra={"Cache-Control": "public, max-age=1800"})
        except (ConnectionError, OSError):
            # Client closed the tab or cancelled the speech; ignore cleanly
            pass

    # ------------------------------------------------------------------ #
    #  Relais Supabase (Mur des Croquis)
    # ------------------------------------------------------------------ #
    async def wall_get(self, writer, query) -> None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            await self._json(writer, 500, {"error": "Supabase non configuré"})
            return

        cursor = query.get("after", ["0"])[0]
        limit = query.get("limit", ["1000"])[0]
        target_url = f"{SUPABASE_URL}/rest/v1/wall_strokes?select=id,player_id,color,size,points&wall=eq.main&id=gt.{cursor}&order=id.asc&limit={limit}"
        
        req = urllib.request.Request(target_url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        })

        try:
            def _get_strokes():
                with urllib.request.urlopen(req, timeout=8) as r:
                    return r.read()
            data = await asyncio.to_thread(_get_strokes)
            await self._send(writer, 200, data, "application/json")
        except Exception as exc:
            await self._json(writer, 500, {"error": str(exc)})

    async def wall_post(self, writer, body: bytes) -> None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            await self._json(writer, 500, {"error": "Supabase non configuré"})
            return

        try:
            strokes = json.loads(body.decode("utf-8", "replace") or "[]")
            if not isinstance(strokes, list) or len(strokes) == 0:
                await self._json(writer, 200, {"ok": True})
                return

            clean_strokes = [{
                "wall": "main",
                "player_id": str(s.get("player_id", "anon"))[:36],
                "player_name": str(s.get("player_name", "Anonyme"))[:24],
                "color": str(s.get("color", "#ffffff"))[:10],
                "size": max(1, min(30, int(s.get("size", 8)))),
                "points": s.get("points", [])[:3000]
            } for s in strokes[:50]]

            target_url = f"{SUPABASE_URL}/rest/v1/wall_strokes"
            req = urllib.request.Request(target_url, data=json.dumps(clean_strokes).encode(), headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            })

            def _save_strokes():
                with urllib.request.urlopen(req, timeout=8) as r:
                    return r.read()

            await asyncio.to_thread(_save_strokes)
            await self._json(writer, 200, {"ok": True})
        except Exception as exc:
            await self._json(writer, 500, {"error": str(exc)})

    async def http_get(self, writer, path, query):
        if path == "/tutor/stats":
            await self._json(writer, 200, tutor_stats_payload())
            return
        # ---> ADD THIS:
        if path == "/api/wall":
            await self.wall_get(writer, query)
            return

        # les dossiers serveur du tuteur ne sont JAMAIS servis au navigateur
        if path.startswith("/tutor_docs") or path.startswith("/secrets"):
            await self._send(writer, 404, b"404 Not Found", "text/plain")
            return

        if path in ("/", "/index.html"):
            data = INDEX.read_bytes()
            await self._send(writer, 200, data, "text/html; charset=utf-8")
            return

        if path == "/status":
            await self._json(writer, 200, {"ok": True, **self.room.stats()})
            return

        if path == "/tx":
            pid = (query.get("id", [""])[0] or "")[:32]
            peer = self.room.peers.get(pid)
            out = []
            if peer is not None and peer.transport == "poll":
                peer.last = time.time()
                out, peer.chat = peer.chat, []
            # état complet des joueurs WebSocket (les pollers sont poussés via out)
            ws_states = [p.public() for p in self.room.peers.values()
                         if p.transport == "ws" and p.pid != pid]
            await self._json(writer, 200, {
                "ok": True, "q": out, "ws": ws_states,
                "room": self.room.name, "players": len(self.room.peers),
            })
            return

        # ---- fichiers statiques ---- #
        rel = path.lstrip("/")
        fpath = (ROOT / rel).resolve()
        try:
            fpath.relative_to(ROOT)
        except ValueError:
            await self._send(writer, 403, b"403 Forbidden", "text/plain")
            return
        if fpath.is_dir():
            fpath = fpath / "index.html"
        if not fpath.is_file():
            await self._send(writer, 404, self._not_found(rel), "text/html; charset=utf-8")
            return
        ctype, _ = mimetypes.guess_type(str(fpath))
        ctype = ctype or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        data = fpath.read_bytes()
        await self._send(writer, 200, data, ctype,
                         extra={"Cache-Control": "no-store"})

    # ------------------------------------------------------------------ #
    def _not_found(self, rel: str) -> bytes:
        return (
            "<!doctype html><meta charset=utf-8><title>404</title>"
            "<body style='background:#05060a;color:#e5eaf3;font-family:system-ui;"
            "padding:40px'><h1>404 — fichier introuvable</h1>"
            f"<p><code>{rel}</code></p><p>Dossier du jeu : <code>{ROOT}</code></p>"
            "</body>"
        ).encode()

    async def _json(self, writer, code: int, obj: dict) -> None:
        await self._send(writer, code, json.dumps(obj, separators=(",", ":")).encode(),
                         "application/json; charset=utf-8")

    async def _send(self, writer, code: int, data: bytes, ctype: str, extra=None) -> None:
        reason = {200: "OK", 204: "No Content", 400: "Bad Request", 403: "Forbidden",
                  404: "Not Found", 405: "Method Not Allowed",
                  500: "Internal Server Error"}.get(code, "OK")
        head = [f"HTTP/1.1 {code} {reason}",
                f"Content-Type: {ctype}",
                f"Content-Length: {len(data)}",
                "Connection: close",
                "Access-Control-Allow-Origin: *"]
        for k, v in (extra or {}).items():
            head.append(f"{k}: {v}")
        writer.write(("\r\n".join(head) + "\r\n\r\n").encode("latin-1"))
        if data:
            writer.write(data)
        try:
            await writer.drain()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, ConnectionError):
            pass

    # ------------------------------------------------------------------ #
    async def sweeper(self) -> None:
        while True:
            await asyncio.sleep(SWEEP_EVERY)
            self.room.sweep()

    async def serve(self, host: str) -> None:
        srv = await asyncio.start_server(self.handle_conn, host, self.port)
        task = asyncio.ensure_future(self.sweeper())
        socks = ", ".join(f"http://{s.getsockname()[0]}:{s.getsockname()[1]}"
                          for s in srv.sockets)
        print("=" * 72)
        print(f"  LaboPhysique 3D — serveur local")
        print(f"  Salle : « {self.room.name} »   (port {self.port})")
        print("-" * 72)
        print(f"  Solo (défaut) :  http://localhost:{self.port}/")
        print("                   aucun personnage, aucun serveur utilisé par le client")
        print(f"  Joueur 1 :  http://localhost:{self.port}/?nom=Alice")
        print(f"  Joueur 2 :  http://localhost:{self.port}/?nom=Bob")
        print(f"  État    :  {socks}/status")
        print("-" * 72)
        print("  Une salle = un port. Pour une 2e salle indépendante :")
        print(f"      python3 server.py --port {self.port + 1} --name \"Salle B\"")
        print("  Arrêt : Ctrl+C")
        print("=" * 72, flush=True)
        async with srv:
            await srv.serve_forever()


# --------------------------------------------------------------------------- #
#  Point d'entrée
# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description="Serveur local LaboPhysique 3D")
    ap.add_argument("--port", "-p", type=int, default=8000, help="port d'écoute (défaut 8000)")
    ap.add_argument("--host", default="0.0.0.0", help="interface (défaut 0.0.0.0)")
    ap.add_argument("--name", "-n", default="TP Résistances", help="nom de la salle")
    args = ap.parse_args()

    if not INDEX.is_file():
        print(f"[ERREUR] index.html introuvable dans {ROOT}", file=sys.stderr)
        sys.exit(1)

    srv = Server(args.port, args.name)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def _run():
        try:
            await srv.serve(args.host)
        except asyncio.CancelledError:
            pass

    task = loop.create_task(_run())

    def _stop(*_a):
        print("\n  Arrêt du serveur… au revoir !", flush=True)
        task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            pass
    try:
        loop.run_until_complete(task)
    except (KeyboardInterrupt, SystemExit, asyncio.CancelledError):
        pass
    except OSError as exc:
        print(f"[ERREUR] port {args.port} indisponible : {exc}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError:
        pass                      # boucle interrompue par un signal : arrêt propre
    finally:
        # On annule tout ce qui reste (connexions clients, tâches internes),
        # puis on laisse la boucle traiter ces annulations avant de fermer :
        # plus aucune trace d'erreur à l'écran au Ctrl+C.
        pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
        for t in pending:
            t.cancel()
        if pending:
            try:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            except (RuntimeError, KeyboardInterrupt, SystemExit):
                pass
        try:
            loop.run_until_complete(loop.shutdown_asyncgens())
        except (RuntimeError, KeyboardInterrupt, SystemExit):
            pass
        try:
            loop.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
