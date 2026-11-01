import urllib.request, urllib.error, json, pathlib

k = pathlib.Path.home().joinpath(".config", "labo3d", "groq.key").read_text().strip()
print("clé :", len(k), "caractères, commence par", k[:7], "…")

def call(label, extra_headers):
    print(f"\n=== {label} ===")
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps({
            "model": "openai/gpt-oss-120b",
            "messages": [{"role": "user", "content": "dis pong"}],
            "max_tokens": 5,
            "temperature": 0,
        }).encode(),
        headers={
            "Authorization": f"Bearer {k}",
            "Content-Type": "application/json",
            **extra_headers,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode(errors="replace")
            print("HTTP", r.status)
            print("BODY:", body[:300])
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print("HTTP", e.code, "—", e.reason)
        print("BODY:", body[:500])       # ← le vrai message Groq

call("Sans User-Agent (comportement actuel du serveur)", {})
call("Avec User-Agent navigateur",
     {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"})