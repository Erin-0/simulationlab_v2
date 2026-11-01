/* =====================================================================
   js/tutor.js  —  interface de discussion avec OHMIE (robot tuteur)
   =====================================================================
   • Dock compact en bas à gauche (ne gêne pas la vue) + fenêtre agrandie
     centrée pour relire toute la conversation.
   • La question part au SERVEUR (POST /tutor) : c'est lui qui détient la
     clé Groq, valide, limite et compte les jetons.  Le navigateur n'a
     JAMAIS la clé.
   • Contexte envoyé à chaque question : instantané du banc (appareils,
     calibres, câblage, missions, feuille) + doc du sous-niveau + les 3
     derniers échanges (mémoire courte).
   • La réponse s'affiche : dans le dock, dans la bulle 3D d'Ohmie
     (tronquée, éphémère) et, si la voix est active, à l'oral (fr-FR).
   • Le pourcentage du quota quotidien de jetons est affiché ; rouge au-
     delà de 80 %.
   ===================================================================== */
import { S, ctx, $, VOLT_CALS, AMP_CALS } from './state.js';
import { robotSay, robotMood, robotPointDevice, ROBOT_NAME } from './robot.js';
import { sfx } from './audio.js';

const MAX_CLIENT_MSG = 600;            // même garde-fou que le serveur
const HISTORY_MAX = 3;                // trois derniers échanges seulement
const WORD_RE = /[A-Za-z0-9À-ſ]{2,}/;

let history = [];                     // [{role, content}] — mémoire courte
let pending = false;
let voiceOn = true;
let stats = null;

/* =====================================================================
   PARAMÈTRE VOCAL V2 : Nettoyage des symboles & formules pour la voix
   - "false" : La voix reçoit le texte brut sans altération (pour vos tests).
   - "true"  : Traduit les symboles en mots parlés (ohms, delta, etc.).
   ===================================================================== */
export const smart_skip_v2_speech = "false";

// Limite maximale de caractères envoyés au moteur audio TTS (Option 1)
const TTS_AUDIO_MAX_CHARS = 320;
/**
 * Rendu Markdown léger et sécurisé pour les réponses du tuteur.
 * Prend en charge : **gras**, *italique*, `code inline`, listes à puces, et sauts de ligne.
 */
function renderMarkdown(text) {
    if (!text) return '';
    // 1. Échappement des caractères HTML sensibles
    let out = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 2. Blocs de code ```code```
    out = out.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // 3. Code inline `code`
    out = out.replace(/`([^`]+)`/g, '<code class="tutor-code">$1</code>');

    // 4. Gras **texte** ou __texte__
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 5. Italique *texte* ou _texte_
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/_([^_]+)_/g, '<em>$1</em>');

    // 6. Listes à puces : "- élément" ou "* élément"
    out = out.replace(/(?:^|\n)[ \t]*[-*][ \t]+(.*)/g, '<br>• $1');

    // 7. Sauts de ligne simples
    out = out.replace(/\n/g, '<br>');

    return out;
}
/* ------------------------------------------------------------------ */
/*  Instantané du banc (contexte envoyé au modèle)                    */
/* ------------------------------------------------------------------ */
function wirePairs() {
    return (_wires || []).map(w => [w.a, w.b]);
}
let _wires = null;

function missionsSnapshot() {
    /* états des objectifs du TP courant, sans révéler de théorie */
    const hudMod = hudRef();
    if (!hudMod || !hudMod.missionStates) return [];
    try {
        const key = S.activeTP === 1 ? S.level
            : S.activeTP === 2 ? 'TP2_' + S.tp2Filter
                : 'TP3_' + S.tp3.level;
        const st = hudMod.missionStates(key);
        return (st.states || []).map((ok, i) => ({ ok, t: (st.list[i] || {}).t || ('objectif ' + (i + 1)) }));
    } catch { return []; }
}
let _hud = null;
function hudRef() { return _hud; }

export function buildTutorContext() {
    const t3 = S.tp3 || {};
    const topo = t3.topo || {};
    return {
        tp: S.activeTP,
        niveau: S.activeTP === 1 ? S.level : undefined,
        filtre: S.activeTP === 2 ? S.tp2Filter : undefined,
        manip: S.activeTP === 3 ? t3.level : undefined,
        generateur: S.activeTP === 1 ? { on: S.genOn, consigne_V: S.setV } : undefined,
        multimetres: {
            calibre_V: VOLT_CALS[S.voltCal], calibre_mA: AMP_CALS[S.ammCal],
            aiguille_V_div: ctx.voltPivot ? Math.round(ctx.voltPivot.userData.div * 10) / 10 : null,
            aiguille_mA_div: ctx.ammPivot ? Math.round(ctx.ammPivot.userData.div * 10) / 10 : null,
            surcharge: S.overload
        },
        gbf: S.activeTP === 2 ? { on: S.gbfOn, frequence_Hz: S.gbfFreq, amplitude_Vcc: S.gbfAmp } : undefined,
        oscilloscope: S.activeTP === 2 ? {
            vdiv1: S.osc.ch1VDiv, vdiv2: S.osc.ch2VDiv, tdiv: S.osc.timeDiv,
            sonde_ch1: S.ch1.ok, sonde_ch2: S.ch2.ok
        } : undefined,
        tp3: S.activeTP === 3 ? {
            e1: `E1 ${t3.on1 ? (t3.cc1 ? 'CC ' + (t3.i1 * 1000).toFixed(0) + ' mA' : 'CV ' + t3.E1 + ' V') : 'OFF'}`,
            e2: `E2 ${t3.on2 ? (t3.cc2 ? 'CC ' + (t3.i2 * 1000).toFixed(0) + ' mA' : 'CV ' + t3.E2 + ' V') : 'OFF'}`,
            rheo: t3.rheo,
            topologie: Object.keys(topo).filter(k => topo[k]).join(',') || 'vide'
        } : undefined,
        cablage: wirePairs(),
        missions: missionsSnapshot(),
        feuille: {
            lignes: (hudRef() && hudRef().rows ? hudRef().rows.length : 0),
            cases9: hudRef() && hudRef().measurementsTP3
                ? Object.values(hudRef().measurementsTP3).filter(c => c && c.valeur).length : 0
        }
    };
}

export function tutorDocKey() {
    if (S.activeTP === 1) return S.level === 'B' ? 'tp1_B' : 'tp1_A';
    if (S.activeTP === 2) return S.tp2Filter === 'CR' ? 'tp2_cr'
        : S.tp2Filter === 'RC-CR' ? 'tp2_bande' : 'tp2_rc';
    return 'tp3_' + Math.max(1, Math.min(5, S.tp3.level || 1));
}

/* ------------------------------------------------------------------ */
/*  Garde-fous côté client (feedback immédiat)                        */
/* ------------------------------------------------------------------ */
function clientValidate(msg) {
    const m = String(msg || '').trim();
    if (m.length < 2) return 'Deux caractères minimum : pose-moi une vraie petite question ! ^_^';
    if (m.length > MAX_CLIENT_MSG) return `C'est trop long pour ma petite bulle (${m.length} caractères) : coupe en ${MAX_CLIENT_MSG} max. o_o`;
    if (!WORD_RE.test(m)) return 'Hmm, que des signes bizarres… écris-moi en français ! o_O';
    return null;
}

/* ------------------------------------------------------------------ */
/*  Interface : dock compact + fenêtre agrandie                       */
/* ------------------------------------------------------------------ */
function el(id) { return $(id); }

function renderLatexInElement(element) {
    if (window.renderMathInElement) {
        try {
            window.renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        } catch (e) {
            console.warn('KaTeX render warning:', e);
        }
    }
}

function pushLine(role, text, isErr = false) {
    for (const bodyId of ['tdBody', 'tmBody']) {
        const body = el(bodyId);
        if (!body) continue;
        const d = document.createElement('div');
        d.className = 'msg ' + (role === 'user' ? 'me' : (isErr ? 'bot err' : 'bot'));

        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = role === 'user' ? 'Toi' : ROBOT_NAME;
        d.appendChild(who);

        // Conteneur de contenu avec support Markdown & LaTeX pour Ohmie
        const contentSpan = document.createElement('span');
        contentSpan.className = 'msg-content';
        if (role === 'user') {
            contentSpan.textContent = text;
        } else {
            contentSpan.innerHTML = renderMarkdown(text);
            // Render any LaTeX formulas ($...$ or $$...$$) present in the text
            renderLatexInElement(contentSpan);
        }
        d.appendChild(contentSpan);

        body.appendChild(d);
        body.scrollTop = body.scrollHeight;
    }
}
function renderStats() {
    const e = el('tdStats');
    if (!e) return;
    if (!stats) { e.innerHTML = '<span class="st">Quota : <b>—</b></span>'; e.classList.remove('hot', 'lim'); return; }
    const pt = stats.pct_tokens || 0, pr = stats.pct_requests || 0;
    e.innerHTML =
        `<span class="st">Jetons/jour <b>${Math.round(pt)} %</b> (${stats.day_tokens}/${stats.limits.tpd})</span>` +
        `<span class="st">Requêtes/jour <b>${Math.round(pr)} %</b> (${stats.day_requests}/${stats.limits.rpd})</span>`;
    e.classList.toggle('hot', pt >= 80 || pr >= 80);
    e.classList.toggle('lim', !e.classList.contains('hot') && (stats.min_requests >= stats.limits.rpm || stats.min_tokens >= stats.limits.tpm));
}

async function fetchStats() {
    try {
        const r = await fetch('/tutor/stats');
        const j = await r.json();
        if (j && j.ok) { stats = j; renderStats(); }
    } catch { /* silencieux : le tuteur reste muet, pas le jeu */ }
}

/**
 * Nettoie le texte pour la synthèse vocale :
 * Élimine le LaTeX brut, le Markdown, les kaomojis et les symboles bizarres
 * pour ne prononcer que des phrases fluides en français naturel.
 */
/**
 * Prépare le texte pour la génération vocale :
 * Respecte le drapeau smart_skip_v2_speech et tronque proprement à la fin
 * de la dernière phrase complète pour ne pas saturer le moteur TTS.
 */
function prepareTextForTTS(rawText) {
    if (!rawText) return '';
    let text = String(rawText).trim();

    // 1. Si le mode de nettoyage est activé, on filtre les symboles
    if (smart_skip_v2_speech === "true") {
        text = text.replace(/[\^o\*\-_•=><~]{1,3}[_\.oO][\^o\*\-_•=><~]{1,3}/g, '');
        text = text.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 sur $2');
        text = text.replace(/\\Omega|Ω/g, ' ohms ');
        text = text.replace(/\\Delta|Δ/g, ' delta ');
        text = text.replace(/\\approx|≈/g, ' environ ');
        text = text.replace(/\\times|\\cdot|×|·/g, ' fois ');
        text = text.replace(/\\to|→/g, ' vers ');
        text = text.replace(/\$\$[\s\S]*?\$\$/g, ' ');
        text = text.replace(/\$[^$]*\$/g, ' ');
        text = text.replace(/\\[a-zA-Z]+/g, ' ');
    }

    // Nettoyage Markdown minimal indispensable pour l'écoute
    text = text.replace(/```[\s\S]*?```/g, ' ');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/[*#_~]/g, '');
    text = text.replace(/\s+/g, ' ').trim();

    // 2. Troncature intelligente pour l'audio sans couper un mot au milieu
    if (text.length > TTS_AUDIO_MAX_CHARS) {
        const sliced = text.slice(0, TTS_AUDIO_MAX_CHARS);
        const lastPunct = Math.max(sliced.lastIndexOf('.'), sliced.lastIndexOf('!'), sliced.lastIndexOf('?'), sliced.lastIndexOf(','));
        text = (lastPunct > 120) ? sliced.slice(0, lastPunct + 1) : sliced.slice(0, sliced.lastIndexOf(' ')) + '...';
    }

    return text;
}

/**
 * Option 1 : Moteur Audio Cloud Haute Qualité (FreeTTS / Neural AI)
 * Récupère un flux MP3. En cas d'échec, renvoie null pour passer au repli.
 */
async function fetchOnlineTTS(spokenText) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000); // 20s max

        const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: spokenText }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        // Si l'API échoue ou signale un repli (fallback: true), renvoyer null pour déclencher l'Option 2
        if (!res.ok) {
            console.info("Basculement automatique sur la voix de secours locale.");
            return null;
        }

        const blob = await res.blob();
        if (blob && blob.size > 800) {
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.preload = 'auto';
            return audio;
        }
    } catch (e) {
        // Timeout ou pas de réseau -> Option 2
    }
    return null;
}
/**
 * Option 2 (Repli) : Synthèse vocale native du navigateur (Web Speech API)
 */
function speakBrowserFallback(spokenText) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const u = new window.SpeechSynthesisUtterance(spokenText.slice(0, 400));
        u.lang = 'fr-FR';
        u.rate = 1.04;
        u.pitch = 1.2;
        u.volume = 0.92;
        const voices = window.speechSynthesis.getVoices();
        const frVoice = voices.find(v => (v.lang || '').startsWith('fr'));
        if (frVoice) u.voice = frVoice;
        window.speechSynthesis.speak(u);
    } catch (e) { }
}

/**
 * Diffuse l'audio généré (Option 1 en priorité, sinon Option 2)
 */
function playRobotAudio(audioElement, spokenText) {
    if (!voiceOn) return;
    if (audioElement) {
        try {
            audioElement.play().catch(() => speakBrowserFallback(spokenText));
        } catch {
            speakBrowserFallback(spokenText);
        }
    } else {
        speakBrowserFallback(spokenText);
    }
}
/* ------------------------------------------------------------------ */
/*  Envoi d'une question                                              */
/* ------------------------------------------------------------------ */
export async function tutorAsk(raw) {
    if (pending) return;
    const msg = String(raw || '').trim();
    const bad = clientValidate(msg);
    if (bad) { pushLine('oh', bad); robotSay(bad); robotMood('o_O'); return; }

    pending = true;
    const send = el('tdSend');
    if (send) send.disabled = true;
    pushLine('user', msg);
    robotMood('o_O', 2500);

    /* ── PHASE DE RÉFLEXION ANIMÉE ──
       Simule les étapes jusqu'à ce que le texte ET l'audio soient prêts */
    const thinkingSteps = [
        "En train de réfléchir...",
        "En cours de traitement...",
        "Presque prêt..."
    ];
    let stepIdx = 0;
    const td = el('tdBody');
    const typing = td ? document.createElement('div') : null;
    if (typing) {
        typing.className = 'typing';
        typing.textContent = `🤖 ${thinkingSteps[0]}`;
        td.appendChild(typing);
        td.scrollTop = td.scrollHeight;
    }

    const thinkInterval = setInterval(() => {
        stepIdx = (stepIdx + 1) % thinkingSteps.length;
        if (typing) typing.textContent = `🤖 ${thinkingSteps[stepIdx]}`;
        robotSay(thinkingSteps[stepIdx]);
    }, 1400);

    let reply = null, err = null;
    try {
        const r = await fetch('/tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: msg,
                doc: tutorDocKey(),
                ctx: buildTutorContext(),
                history
            })
        });

        if (r.status === 429) {
            err = "Ohmie reçoit un grand nombre de questions en ce moment ! ⏳ Le quota temporaire de requêtes est atteint. Merci de patienter une petite minute avant de reposer ta question. Tes appareils et tes mesures restent 100 % opérationnels ! ^_^";
        } else if (r.status === 404) {
            err = getStaticFallbackAnswer(msg);
        } else {
            const j = await r.json().catch(() => null);
            if (j && j.ok && typeof j.reply === 'string') {
                reply = j.reply;
                if (j.stats) { stats = j.stats; renderStats(); }
            } else {
                const rawErr = String((j && j.e) || '').toLowerCase();
                if (rawErr.includes('rate') || rawErr.includes('limit') || rawErr.includes('quota')) {
                    err = "Ohmie fait face à une forte affluence en ce moment ! Le quota temporaire est saturé. Attends environ 30 à 60 secondes, puis repose ta question. ^_^";
                } else {
                    err = (j && j.e) || "Oups ! Je n'ai pas réussi à formuler la réponse. Réessaie dans quelques instants ! >_<";
                }
                if (j && j.stats) { stats = j.stats; renderStats(); }
            }
        }
    } catch {
        err = getStaticFallbackAnswer(msg);
    }

    /* ── GÉNÉRATION DE L'AUDIO (Option 1 avec basculement Option 2) ──
       Le texte ne s'affiche pas tant que l'audio n'est pas prêt */
    let audioReadyElem = null;
    let spokenPortion = '';

    if (reply && voiceOn) {
        if (typing) typing.textContent = "🤖 Synthèse vocale en cours...";
        spokenPortion = prepareTextForTTS(reply);
        // Tente l'Option 1 (Voix neuronale)
        audioReadyElem = await fetchOnlineTTS(spokenPortion);
    }

    // Fin de la phase d'attente
    clearInterval(thinkInterval);
    if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
    pending = false;
    if (send) send.disabled = false;

    // Dévoilement simultané du texte et de l'audio
    if (reply) {
        pushLine('oh', reply);
        robotSay(reply);
        robotMood('^o^', 3200);
        robotPointDevice(reply, msg);
        playRobotAudio(audioReadyElem, spokenPortion);

        history.push({ role: 'user', content: msg }, { role: 'assistant', content: reply });
        while (history.length > HISTORY_MAX * 2) history.shift();
        sfx.ok && sfx.ok();
    } else {
        pushLine('oh', err, true);
        robotSay(err);
        robotMood('>_<', 3200);
        sfx.err && sfx.err();
    }

    const inp = el('tdInput');
    if (inp) { inp.value = ''; inp.focus(); }
}
/* ------------------------------------------------------------------ */
/*  Ouverture / fermeture                                             */
/* ------------------------------------------------------------------ */
export function tutorToggle(force) {
    const dock = el('tutorDock'), fab = el('tutorFab');
    if (!dock) return;
    const show = force !== undefined ? force : dock.classList.contains('hiddenx');
    dock.classList.toggle('hiddenx', !show);
    if (fab) fab.classList.toggle('hiddenx', show);
    if (show) {
        fetchStats();
        const inp = el('tdInput');
        if (inp) inp.focus();
        if (!dock.dataset.hello) {
            dock.dataset.hello = '1';
            const hello = `Bonjour ! Moi c'est ${ROBOT_NAME}, ton robot tuteur. ^_^ `
                + 'Pose-moi une question sur le banc, le câblage ou la méthode — '
                + 'je guide, mais je ne fais pas les mesures à ta place !';
            pushLine('oh', hello);
            robotSay(hello);
        }
    }
}

export function tutorModal(open) {
    const m = el('tutorModal');
    if (!m) return;
    m.classList.toggle('hiddenx', !open);
    if (open) { const b = el('tmBody'); if (b) b.scrollTop = b.scrollHeight; }
}

export const isTutorTypingTarget = () => {
    const a = document.activeElement;
    return !!a && (a.id === 'tdInput');
};

/** Branchement DOM + références croisées (appelé une fois par main.js). */
export function initTutor(hudMod, wiresArray) {
    _hud = hudMod; _wires = wiresArray;
    const send = () => tutorAsk(el('tdInput') ? el('tdInput').value : '');
    const on = (id, ev, fn) => { const e = el(id); if (e) e.addEventListener(ev, fn); };
    on('tutorFab', 'click', () => { sfx.click(); tutorToggle(true); });
    on('tdClose', 'click', () => { sfx.click(); tutorToggle(false); });
    on('tdExpand', 'click', () => { sfx.click(); tutorModal(true); });
    on('tmClose', 'click', () => { sfx.click(); tutorModal(false); });
    on('tdSend', 'click', send);
    on('tdInput', 'keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    on('tdVoice', 'click', () => {
        voiceOn = !voiceOn;
        const b = el('tdVoice');
        if (b) b.textContent = voiceOn ? '🔊' : '🔇';
        if (!voiceOn && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        sfx.click();
    });
    fetchStats();
}
/**
 * Réponse intelligente intégrée au navigateur lorsque le site est hébergé
 * de manière purement statique (ex: GitHub Pages) sans serveur Python actif.
 */
function getStaticFallbackAnswer(question) {
    const q = String(question || '').toLowerCase();

    if (q.includes('ohm') || q.includes('loi') || q.includes('u =') || q.includes('r =')) {
        return "Rappel pour le **TP 1 (Loi d'Ohm)** : La tension $U$ et le courant $I$ se lisent sur les aiguilles des appareils. Applique ensuite $R = \\frac{U}{I}$ avec $I$ converti en ampères ($1\\text{ mA} = 0{,}001\\text{ A}$).";
    }
    if (q.includes('pont') || q.includes('wheatstone') || q.includes('rx')) {
        return "Rappel pour le **Pont de Wheatstone** : À l'équilibre, l'aiguille du galvanomètre est centrée sur le zéro ($V_g = 0\\text{ V}$). La formule est $R_x = \\frac{R_2}{R_1} \\cdot R_v$. Avec $R_1 = R_2 = 1000\\,\\Omega$, on a simplement $R_x = R_v$ !";
    }
    if (q.includes('filtre') || q.includes('coupure') || q.includes('fc') || q.includes('bode')) {
        return "Rappel pour le **TP 2 (Filtres)** : La fréquence de coupure théorique est $f_c = \\frac{1}{2\\pi R C}$. À cette fréquence, le gain mesuré chute de $-3\\text{ dB}$ (soit $V_s \\approx 0{,}707 \\cdot V_e$). Compte bien les divisions à l'oscilloscope !";
    }
    if (q.includes('thevenin') || q.includes('thévenin') || q.includes('rth') || q.includes('eth')) {
        return "Rappel pour le **Théorème de Thévenin** : $E_{Th} = V_0$ (tension à vide mesurée sans la branche $R$) et $R_{Th} = \\frac{V_0}{I_0}$ où $I_0$ est le courant de court-circuit entre A et B.";
    }
    if (q.includes('millman')) {
        return "Rappel pour le **Théorème de Millman** : Le potentiel au nœud A vaut $V_M = \\frac{\\sum E_k \\cdot G_k}{\\sum G_k}$ avec $G_k = \\frac{1}{R_k}$. Le courant dans $R$ est alors $I_R = \\frac{V_M}{R}$.";
    }

    return "Je suis en mode guide autonome de paillasse ! Vérifie ton câblage, choisis le plus grand calibre sur tes multimètres avant d'allumer les générateurs, et consigne tes valeurs sur la feuille de relevés à droite.";
}