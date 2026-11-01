/* =====================================================================
   functions/tutor.js  —  Tuteur « Ohmie » (Cloudflare Pages Function)
   Portage fidèle de server.py :
     • modèle openai/gpt-oss-120b (modèle de RAISONNEMENT)
     • reasoning_effort: "low" (sinon content vide)
     • max_completion_tokens: 2048
     • fallback content → reasoning
     • validation + rate limiting + stats (best-effort par isolate)
   ===================================================================== */

const GROQ_URL    = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL  = "openai/gpt-oss-120b";
const TUTOR_RPM   = 30,  TUTOR_TPM = 8000;
const TUTOR_RPD   = 1000, TUTOR_TPD = 200000;
const TUTOR_MAX_MSG  = 600;
const TUTOR_MAX_OUT  = 2048;
const TUTOR_MAX_BODY = 32 * 1024;
const TUTOR_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                 "AppleWebKit/537.36 (KHTML, like Gecko) " +
                 "Chrome/120.0.0.0 Safari/537.36";

const TUTOR_DOC_KEYS = {
    "tp1_A": "tp1_A.md", "tp1_B": "tp1_B.md",
    "tp2_rc": "tp2_rc.md", "tp2_cr": "tp2_cr.md", "tp2_bande": "tp2_bande.md",
    "tp3_1": "tp3_1.md", "tp3_2": "tp3_2.md", "tp3_3": "tp3_3.md",
    "tp3_4": "tp3_4.md", "tp3_5": "tp3_5.md",
};

const WORD_RE = /[A-Za-z0-9\u00c0-\u017f]{2,}/;
const FRIENDLY_ERR = "Oups ! Un petit court-circuit dans mes neurones : " +
                     "je n'ai pas pu répondre. Réessaie dans quelques " +
                     "secondes, je reboot. ^_^";

/* ---- comptabilité par isolate (best-effort) ---- */
const _MIN = [];   // [{t, n}]
const _DAY = { date: "", tokens: 0, requests: 0 };
const today = () => new Date().toISOString().slice(0, 10);
function dayLoad() {
    if (_DAY.date !== today()) { _DAY.date = today(); _DAY.tokens = 0; _DAY.requests = 0; }
}
function minuteStats() {
    const now = Date.now();
    while (_MIN.length && now - _MIN[0].t > 60000) _MIN.shift();
    return { reqs: _MIN.length, tokens: _MIN.reduce((s, x) => s + x.n, 0) };
}
function statsPayload(configured) {
    dayLoad();
    const { reqs, tokens } = minuteStats();
    return {
        ok: true, configured: !!configured, model: GROQ_MODEL,
        day_tokens: _DAY.tokens, day_requests: _DAY.requests,
        min_requests: reqs, min_tokens: tokens,
        pct_tokens: Math.round(100 * _DAY.tokens / TUTOR_TPD * 100) / 100,
        pct_requests: Math.round(100 * _DAY.requests / TUTOR_RPD * 100) / 100,
        limits: { rpm: TUTOR_RPM, tpm: TUTOR_TPM, rpd: TUTOR_RPD, tpd: TUTOR_TPD },
    };
}
function recordUsage(tokens) {
    _MIN.push({ t: Date.now(), n: tokens });
    _DAY.tokens += tokens;
    _DAY.requests += 1;
}

/* ---- validation ---- */
function validateMessage(msg) {
    if (typeof msg !== "string") return "Hmm, je n'ai rien reçu de lisible : réécris ta question ? o_O";
    const m = msg.trim();
    if (m.length < 2) return "Question trop courte pour moi : deux caractères minimum, je t'écoute ! ^_^";
    if (m.length > TUTOR_MAX_MSG)
        return `Houla, ${m.length} caractères d'un coup ! Coupe ta question en morceaux de ${TUTOR_MAX_MSG} caractères max, je répondrai mieux. o_o`;
    if (!WORD_RE.test(m)) return "Je ne vois que des signes étranges… écris-moi une petite phrase en français, veux-tu ? o_O";
    for (const ch of m) if (ch.charCodeAt(0) < 32) return "Ton message contient des caractères invisibles : recopie-le en texte simple. ^_^";
    return null;
}

/* ---- contexte du banc (porté de tutor_context_text) ---- */
function buildContextText(c) {
    if (!c || typeof c !== "object") return "";
    const L = ["ÉTAT DU BANC (instantané, fourni par le simulateur) :"];
    const tp = c.tp;
    L.push(`- TP actif : ${tp}` +
        (tp === 1 ? ` · niveau ${c.niveau}` : "") +
        (tp === 2 ? ` · filtre ${c.filtre}` : "") +
        (tp === 3 ? ` · manipulation ${c.manip}` : ""));

    const g = c.generateur;
    if (g && typeof g === "object" && Object.keys(g).length)
        L.push(`- Générateur TP1 : ${g.on ? "allumé" : "ÉTEINT"}, consigne ${g.consigne_V} V`);

    const m = c.multimetres;
    if (m && typeof m === "object" && Object.keys(m).length)
        L.push(`- Voltmètre : calibre ${m.calibre_V} V, aiguille à ${m.aiguille_V_div} div · ` +
               `Ampèremètre : calibre ${m.calibre_mA} mA, aiguille à ${m.aiguille_mA_div} div` +
               (m.surcharge ? " · SURCHARGE (OL)" : ""));

    const gb = c.gbf;
    if (gb && typeof gb === "object" && Object.keys(gb).length)
        L.push(`- GBF : ${gb.on ? "ON" : "OFF"}, f = ${gb.frequence_Hz} Hz, ` +
               `amplitude ${gb.amplitude_Vcc} Vcc (bouton aveugle)`);

    const o = c.oscilloscope;
    if (o && typeof o === "object" && Object.keys(o).length)
        L.push(`- Oscilloscope : CH1 ${o.vdiv1} V/div, CH2 ${o.vdiv2} V/div, ${o.tdiv} s/div · ` +
               `sonde CH1 ${o.sonde_ch1 ? "branchée" : "NON branchée"}, ` +
               `sonde CH2 ${o.sonde_ch2 ? "branchée" : "NON branchée"}`);

    const t3 = c.tp3;
    if (t3 && typeof t3 === "object" && Object.keys(t3).length)
        L.push(`- TP3 : E1 ${t3.e1} · E2 ${t3.e2} · rhéostat ${t3.rheo} Ω · topologie : ${t3.topologie}`);

    const w = c.cablage;
    if (Array.isArray(w)) {
        const txt = w.slice(0, 40).map(p => Array.isArray(p) ? `${p[0]}—${p[1]}` : String(p)).join(" ; ");
        L.push(`- Câblage (${w.length} fil(s)) : ${txt || "aucun fil"}`);
    }
    const mis = c.missions;
    if (Array.isArray(mis))
        L.push("- Objectifs de l'étape : " +
            mis.slice(0, 12).map(mm => `[${mm && mm.ok ? "OK" : "à faire"}] ${(mm && mm.t) || "?"}`).join(" ; "));

    const f = c.feuille;
    if (f && typeof f === "object" && Object.keys(f).length)
        L.push(`- Feuille de relevés : ${f.lignes || 0} ligne(s) TP1, ${f.cases9 || 0} case(s) table 9 remplie(s)`);

    return L.join("\n");
}

/* ---- chargement des docs Markdown via le binding ASSETS ---- */
async function loadDoc(env, request, name) {
    if (!name) return "";
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") return "";
    try {
        const r = await env.ASSETS.fetch(new URL(`/tutor_docs/${name}`, request.url));
        return r.ok ? await r.text() : "";
    } catch { return ""; }
}
async function buildSystemText(env, request, docKey) {
    const parts = [];
    for (const n of ["systeme.md", "labo.md"]) {
        const t = await loadDoc(env, request, n);
        if (t) parts.push(t);
    }
    const name = TUTOR_DOC_KEYS[docKey] || "";
    const d = await loadDoc(env, request, name);
    if (d) parts.push("# DOSSIER DU NIVEAU EN COURS\n" + d);
    return parts.join("\n\n");
}

/* ---- historique filtré ---- */
function cleanHistory(h) {
    if (!Array.isArray(h)) return [];
    const out = [];
    for (const it of h.slice(-6)) {
        if (it && (it.role === "user" || it.role === "assistant")) {
            const c = String(it.content || "").slice(0, 2000);
            if (c.trim()) out.push({ role: it.role, content: c });
        }
    }
    return out;
}

/* ---- appel Groq avec retries (compat API ancienne) ---- */
async function callGroq(key, body) {
    const headers = {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": TUTOR_UA,
        "Accept": "application/json",
    };
    const post = () => fetch(GROQ_URL, { method: "POST", headers, body: JSON.stringify(body) });

    let res = await post();
    if (res.ok) return res;

    const errText = await res.clone().text();
    if (res.status === 400 && errText.includes("max_completion_tokens")) {
        delete body.max_completion_tokens;
        body.max_tokens = TUTOR_MAX_OUT;
        res = await post();
        if (res.ok) return res;
    } else if (res.status === 400 && errText.includes("reasoning_effort")) {
        delete body.reasoning_effort;
        res = await post();
        if (res.ok) return res;
    }
    return res;
}

/* ---- handler POST /tutor ---- */
export async function onRequestPost(context) {
    const { request, env } = context;
    const key = (env.GROQ_API_KEY || "").trim();

    if (!key) {
        return json({ ok: false, e: "Ohmie est muet pour l'instant : la clé API du tuteur n'est pas configurée sur ce serveur. ^_^" }, 503);
    }

    try {
        const rawBody = await request.text();
        if (rawBody.length > TUTOR_MAX_BODY) {
            return json({ ok: false, e: "Message trop volumineux pour Ohmie : allège ta question. o_o" }, 413);
        }

        let req;
        try { req = JSON.parse(rawBody || "{}"); }
        catch { return json({ ok: false, e: "Je n'ai pas compris ta requête : réessaie. o_O" }, 400); }
        if (!req || typeof req !== "object" || Array.isArray(req)) {
            return json({ ok: false, e: "Requête invalide." }, 400);
        }

        const err = validateMessage(req.message);
        if (err) return json({ ok: false, e: err }, 400);

        /* ---- rate limiting (per-isolate, best-effort) ---- */
        dayLoad();
        const { reqs: rmin, tokens: tmin } = minuteStats();
        if (_DAY.requests >= TUTOR_RPD || _DAY.tokens >= TUTOR_TPD) {
            return json({
                ok: false,
                e: "Quota quotidien du tuteur atteint : Ohmie recharge ses batteries jusqu'à demain. o_O",
                stats: statsPayload(true),
            }, 429);
        }
        if (rmin >= TUTOR_RPM) {
            return json({ ok: false, e: "Trop de questions d'un coup ! Laisse-moi respirer quelques secondes. ^_^", stats: statsPayload(true) }, 429);
        }
        if (tmin >= TUTOR_TPM) {
            return json({ ok: false, e: "Beaucoup de texte cette minute-ci : attends un instant avant de me reposer une question. o_o", stats: statsPayload(true) }, 429);
        }

        /* ---- construction du prompt ---- */
        const systemText = await buildSystemText(env, request, String(req.doc || ""));
        const messages = [{
            role: "system",
            content: systemText || "Tu es Ohmie, le sympathique robot tuteur d'un laboratoire de physique 3D. Réponds en français de façon pédagogique, concise et encourageante.",
        }];
        messages.push(...cleanHistory(req.history));
        const ctxText = buildContextText(req.ctx);
        let userMsg = String(req.message).trim();
        if (ctxText) userMsg = ctxText + "\n\nQUESTION DE L'ÉTUDIANT :\n" + userMsg;
        messages.push({ role: "user", content: userMsg });

        /* ---- appel Groq ---- */
        const body = {
            model: GROQ_MODEL,
            messages,
            temperature: 0.6,
            max_completion_tokens: TUTOR_MAX_OUT,
            reasoning_effort: "low",
        };

        const res = await callGroq(key, body);

        if (!res.ok) {
            const errText = await res.text();
            console.warn("[Groq tutor] HTTP", res.status, errText.slice(0, 400));
            if (res.status === 429) {
                return json({
                    ok: false,
                    e: "Trop de questions en peu de temps (quota Groq). Réessaie dans une minute. ^_^",
                    stats: statsPayload(true),
                }, 429);
            }
            return json({
                ok: false,
                e: `Oups ! Un petit souci technique m'empêche de répondre pour l'instant (HTTP ${res.status}). Réessaie dans quelques secondes. >_<`,
                stats: statsPayload(true),
            }, 502);
        }

        const data = await res.json();

        /* ---- fallback content → reasoning ---- */
        try {
            const m = data.choices[0].message;
            if (!((m.content || "").trim())) {
                const reasoning = (m.reasoning || m.reasoning_content || "").trim();
                m.content = reasoning || "Hmm… je n'ai rien réussi à formuler cette fois. Reformule ta question ? ^_^";
            }
        } catch { /* ignore */ }

        let reply = "";
        try { reply = data.choices[0].message.content || ""; }
        catch { reply = FRIENDLY_ERR; }
        reply = Array.from(reply).filter(ch => ch.charCodeAt(0) >= 32 || ch === "\n" || ch === "\t").join("").slice(0, 4000);

        const usage = data.usage || {};
        const tot = Number(usage.total_tokens) || Math.max(1, Math.floor(userMsg.length / 4 + reply.length / 4));

        /* ---- comptabilité ---- */
        recordUsage(tot);

        return json({ ok: true, reply, tokens: tot, stats: statsPayload(true) }, 200);

    } catch (err) {
        console.warn("[Groq tutor] exception:", err && err.message);
        return json({ ok: false, e: (err && err.message) || "Erreur interne." }, 500);
    }
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
