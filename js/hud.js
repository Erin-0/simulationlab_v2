/* =====================================================================
   js/hud.js  —  interface 2D : toasts, pastilles d'état, objectifs,
                 FEUILLE DE RELEVÉS (modal « papier » à remplir à la main),
                 export CSV, barre de chat et flash rouge des coups.

   La feuille n'est plus un tableau automatique : les cases sont VIDES et
   se remplissent au clavier, avec une police manuscrite, sur un fond de
   papier ligné.
   ===================================================================== */
import { S, $, fr, ME, ctx, VOLT_CALS, AMP_CALS, METER_NDIV } from './state.js';
import { readMeterDiv } from './displays.js';
import { sfx } from './audio.js';
import { missionsDef } from './circuit.js';
import { uncertaintiesTP3 } from './tp3_solver.js';

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */
const TOAST_COLORS = {
    info: 'rgba(34,211,238,.28)', success: 'rgba(52,211,153,.28)',
    warn: 'rgba(251,191,36,.3)', error: 'rgba(248,113,113,.34)'
};
const TOAST_ICONS = { info: 'info', success: 'check-circle-2', warn: 'alert-triangle', error: 'ban' };
const LS_PAPER = 'labo3d_paper_v1';

export const rows = [];
export let paperOpen = false;
let onPaperClose = null, onPaperOpen = null;

const FIELDS = ['lvl', 'montage', 'U', 'I', 'R', 'time', 'obs'];

// Tableaux de mesures spécifiques au TP 2 (un jeu de données par filtre)
export const measurementsTP2 = {
    RC: [],
    CR: [],
    'RC-CR': []
};

/* ---- TP 3 : le compte rendu imprimé du fascicule (table 9, page 16) ----
   Les GRANDEURS sont imprimées (elles font partie du formulaire) ; les colonnes
   Valeur et Incertitude restent VIDES : c'est à l'élève de les écrire.        */
export const TP3_ROWS = [
    { m: 1, key: 'V0',     g: 'V₀ (V) — tension de Thévenin',        unit: 'V' },
    { m: 1, key: 'I0',     g: 'I₀ (A) — courant de Norton',          unit: 'A' },
    { m: 2, key: 'VM',     g: 'V_M (V) — tension de Millman',        unit: 'V' },
    { m: 2, key: 'IRcalc', g: 'I_R = V_M / R (A) — calculé',         unit: 'A', calc: true },
    { m: 2, key: 'IR',     g: 'I mesuré (A) — ampèremètre en série', unit: 'A' },
    { m: 3, key: 'I1',     g: 'I₁ (A) — E₂ court-circuité',          unit: 'A' },
    { m: 3, key: 'I2',     g: 'I₂ (A) — E₁ court-circuité',          unit: 'A' },
    { m: 3, key: 'Itot',   g: 'I_total = I₁ + I₂ (A)',               unit: 'A', calc: true },
    { m: 4, key: 'RTh',    g: 'R_Th (Ω) = V₀ / I₀',                  unit: 'Ω', calc: true },
    { m: 4, key: 'ITh',    g: 'I_Th (A) — courant dans R',           unit: 'A' },
    { m: 5, key: 'RNo',    g: 'R_No (Ω) = R_Th',                     unit: 'Ω', calc: true },
    { m: 5, key: 'INo',    g: 'I_No (A) — courant dans R',           unit: 'A' }
];
export const TP3_TITLES = {
    1: 'Manipulation 1 — Mesures initiales (branche R retirée)',
    2: 'Manipulation 2 — Théorème de Millman',
    3: 'Manipulation 3 — Théorème de superposition',
    4: 'Manipulation 4 — Théorème de Thévenin',
    5: 'Manipulation 5 — Théorème de Norton'
};
export const measurementsTP3 = {};        // key -> { valeur:'', incert:'' }
export const sheetsTP3 = [];              // feuilles TP 3 déjà remplies
TP3_ROWS.forEach(r => { measurementsTP3[r.key] = { valeur: '', incert: '' }; });

export function savePaperState() {
    try {
        localStorage.setItem(LS_PAPER, JSON.stringify({
            rows,
            sheets,
            measurementsTP2,
            measurementsTP3,
            sheetsTP3,
            fName: $('fName')?.value || '',
            fDate: $('fDate')?.value || '',
            fPoste: $('fPoste')?.value || ''
        }));
    } catch (e) { /* private mode */ }
}

export function loadPaperState() {
    try {
        const raw = localStorage.getItem(LS_PAPER);
        if (!raw) return;
        const o = JSON.parse(raw);
        if (Array.isArray(o.rows))   rows.push(...o.rows);
        if (Array.isArray(o.sheets)) sheets.push(...o.sheets);
        if (o.measurementsTP2) {
            measurementsTP2.RC = o.measurementsTP2.RC || [];
            measurementsTP2.CR = o.measurementsTP2.CR || [];
            measurementsTP2['RC-CR'] = o.measurementsTP2['RC-CR'] || [];
        }
        if (o.measurementsTP3) {
            TP3_ROWS.forEach(r => {
                const v = o.measurementsTP3[r.key];
                if (v) measurementsTP3[r.key] = { valeur: v.valeur || '', incert: v.incert || '' };
            });
        }
        if (Array.isArray(o.sheetsTP3)) sheetsTP3.push(...o.sheetsTP3);
        updateTP3ReportFlags();
        if (o.fName  && $('fName'))  $('fName').value  = o.fName;
        if (o.fDate  && $('fDate'))  $('fDate').value  = o.fDate;
        if (o.fPoste && $('fPoste')) $('fPoste').value = o.fPoste;
        refreshPrevSheetButton();
    } catch (e) { }
}

export function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = 'toast glass';
    el.style.border = `1px solid ${TOAST_COLORS[type] || TOAST_COLORS.info}`;
    el.innerHTML = `<i data-lucide="${TOAST_ICONS[type] || 'info'}"></i><span>${msg}</span>`;
    $('toasts').appendChild(el);
    if (window.lucide) lucide.createIcons();

    const kill = () => { el.classList.add('bye'); setTimeout(() => el.remove(), 350); };
    setTimeout(kill, type === 'error' ? 3000 : 2000);   // shorter

    /* 3 max — older ones die silently */
    const all = $('toasts').children;
    while (all.length > 3) all[0].remove();
}

/* ------------------------------------------------------------------ */
/*  Pastilles d'état                                                   */
/* ------------------------------------------------------------------ */
export function refreshStatus() {
    const tp = S.activeTP;

    /* visibilité des rangées selon le TP actif */
    $('chipRowA').classList.toggle('hidden', tp !== 1 || S.level !== 'A');
    $('chipRowB').classList.toggle('hidden', tp !== 1 || S.level !== 'B');
    $('chipRowTP2').classList.toggle('hidden', tp !== 2);
    const row3 = $('chipRowTP3');
    if (row3) row3.classList.toggle('hidden', tp !== 3);
    /* les pastilles du générateur continu n'ont de sens que dans le TP 1 */
    const chipGen = $('chipGen');
    const rowGen = chipGen && chipGen.closest ? chipGen.closest('.chiprow') : null;
    if (rowGen) rowGen.classList.toggle('hidden', tp !== 1);

    if (tp === 3) {
        const t3 = S.tp3;
        const led = (id, on) => { const e = $(id); if (e) e.className = 'dotline ' + (on ? 'led-on' : 'led-off'); };
        led('chipE1Dot', t3.on1); led('chipE2Dot', t3.on2);
        $('chipE1').textContent = 'E1 · ' + (t3.on1 ? (t3.cc1 ? 'CC' : 'CV') : 'OFF');
        $('chipE2').textContent = 'E2 · ' + (t3.on2 ? (t3.cc2 ? 'CC' : 'CV') : 'OFF');
        $('chipRheo').textContent = fr(t3.rheo, 1) + ' Ω';
        /* aucune valeur mesurée dans le HUD : le calibre choisi seulement —
           la lecture se fait sur l'aiguille de l'appareil */
        $('chipTp3V').textContent = 'calibre ' + String(VOLT_CALS[S.voltCal]).replace('.', ',') + ' V';
        $('chipTp3I').textContent = 'calibre ' + AMP_CALS[S.ammCal] + ' mA';
        return;
    }

    if (tp === 1) {
        $('chipGenDot').className = 'dotline ' + (S.genOn ? 'led-on' : 'led-off');
        $('chipGen').textContent = 'GEN · ' + (S.genOn ? 'ON' : 'OFF');
        $('chipU').textContent = 'U réglée = ' + fr(S.genOn ? S.setV : 0, 1) + ' V';
        $('chipMontage').textContent = 'Montage : ' + (S.montage === '—' ? '—' : S.montage.toUpperCase());
        $('chipRv').textContent = S.Rv + ' Ω';
        $('chipVg').textContent = '→ regarder l\u2019aiguille';
        const bal = $('chipBalDot');
        bal.style.background = S.balanced ? '#34d399' : '#64748b';
        bal.style.boxShadow = S.balanced ? '0 0 8px #34d399' : 'none';
        $('chipBal').textContent = S.balanced ? 'Équilibré' : 'Équilibre';
    } else {
        // TP 2
        const freqText = S.gbfFreq >= 1000 ? (S.gbfFreq / 1000).toFixed(2) + ' kHz' : S.gbfFreq + ' Hz';
        $('chipGbfFreq').textContent = freqText;
        /* Ue et G ne sont JAMAIS affichés : ils se mesurent à l'oscilloscope
           (divisions) puis se calculent — c'est l'exercice du fascicule.   */
        $('chipUe').textContent = S.gbfOn ? 'à mesurer (CH1)' : 'GBF éteint';
        $('chipGain').textContent = S.gbfOn ? 'à calculer (Vs/Ve)' : '—';
    }
}

export function setTargetChip(text) {
    const el = $('chipTarget');
    if (el && el.textContent !== text) el.textContent = text;
}

export function applySoloUI(solo) {
    ['chipNet', 'chipPlayers'].forEach(id => { const e = $(id); if (e) e.classList.toggle('hidden', !!solo); });
    const chat = $('btnChat'); if (chat) chat.classList.toggle('hidden', !!solo);
    const badge = document.querySelector('#start .badge');
    if (badge) badge.textContent = solo
        ? 'TP Virtuel · Physique · Mode solo (sans personnage)'
        : 'TP Virtuel · Physique · Multijoueur local';
}

export function refreshNetChip() {
    const dot = $('chipNetDot'), txt = $('chipNetTxt');
    if (!dot) return;
    if (ME.online) {
        dot.className = 'dotline ' + (ME.transport === 'ws' ? 'led-on' : 'led-warn');
        txt.textContent = (ME.transport === 'ws' ? 'EN LIGNE' : 'SECOURS') + ' · ' + ME.room;
    } else {
        dot.className = 'dotline led-off';
        txt.textContent = 'SOLO';
    }
}

export function refreshPlayersChip(n) {
    const el = $('chipPlayersTxt');
    if (el) el.textContent = String(Math.max(1, n));
}

/* ------------------------------------------------------------------ */
/*  Objectifs du TP                                                    */
/* ------------------------------------------------------------------ */
const prevDone = {
    A: new Set(), B: new Set(),
    TP2_RC: new Set(), TP2_CR: new Set(), 'TP2_RC-CR': new Set(),
    TP3_1: new Set(), TP3_2: new Set(), TP3_3: new Set(), TP3_4: new Set(), TP3_5: new Set()
};

/** Clé du jeu d'objectifs en cours (niveau, filtre ou manipulation). */
function missionKey() {
    return (S.activeTP === 1) ? S.level
        : (S.activeTP === 2) ? ('TP2_' + S.tp2Filter)
            : ('TP3_' + S.tp3.level);
}

/**
 * État des objectifs du jeu courant.
 *
 * Un objectif validé reste ACQUIS : certains gestes sont forcément transitoires
 * (au TP 3, « E₁ seul, E₂ remplacé par un fil » puis « E₂ seul, E₁ remplacé par
 * un fil » ne peuvent pas être vrais en même temps). Sans cet état collant, la
 * liste repasserait au gris et l'élève croirait avoir perdu ce qu'il a fait.
 */
export function missionStates(key = missionKey()) {
    const list = missionsDef[key] || [];
    const done = prevDone[key] || (prevDone[key] = new Set());
    const fresh = [];
    const states = list.map(m => {
        if (m.test()) { if (!done.has(m.id)) fresh.push(m); done.add(m.id); }
        return done.has(m.id);
    });
    return { list, states, fresh };
}

export function refreshMissions() {
    const { list, states, fresh } = missionStates();

    for (const m of fresh) {
        sfx.ok();
        toast(`Objectif validé ✓ — ${m.t}`, 'success');
    }

    $('missionList').innerHTML = list.map((m, i) => {
        const ok = states[i];
        return `<div class="mission ${ok ? 'done' : ''}">
      <i data-lucide="${ok ? 'check-circle-2' : 'circle'}" class="${ok ? 'text-done' : ''}"
         style="color:${ok ? '#34d399' : '#64748b'}"></i>
      <span class="txt">${m.t}</span></div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

/* ------------------------------------------------------------------ */
/*  FEUILLE DE RELEVÉS — saisie MANUELLE                               */
/* ------------------------------------------------------------------ */
export function setPaperHooks(open, close) { onPaperOpen = open; onPaperClose = close; }

export function refreshLiveLine() {
    const el = $('liveVals');
    if (!el) return;

    if (S.activeTP === 1) {
        if (S.level === 'A') {
            /* La ligne d'état ne donne AUCUNE valeur mesurée : U et I se
               lisent sur les aiguilles, puis R = U/I se calcule au papier. */
            el.innerHTML = `Niveau A · Montage : <b>${S.montage === '—' ? 'non détecté' : S.montage.toUpperCase()}</b>`
                + ` &nbsp;·&nbsp; boucle : <b>${S.loopOk ? 'complète' : 'ouverte'}</b>`
                + ` &nbsp;·&nbsp; calibres : <b>${String(VOLT_CALS[S.voltCal]).replace('.', ',')} V</b> / <b>${AMP_CALS[S.ammCal]} mA</b>`
                + ` &nbsp;·&nbsp; U et I se LISENT sur les aiguilles : g = N div × C/100`
                + (S.genOn ? '' : ' &nbsp;·&nbsp; <span class="warn">générateur éteint</span>');
        } else {
            el.innerHTML = `Niveau B · Pont de Wheatstone — R1 = R2 = <b>1000 Ω</b> &nbsp;·&nbsp; Rv = <b>${S.Rv} Ω</b> (décades)`
                + ` &nbsp;·&nbsp; nullité : <b>aiguille du galvanomètre</b>`
                + ` &nbsp;·&nbsp; à l'équilibre, Rx = Rv·R2/R1 — <b>à calculer sur le papier</b>`
                + (S.genOn ? '' : ' &nbsp;·&nbsp; <span class="warn">générateur éteint</span>');
        }
    } else if (S.activeTP === 2) {
        // En direct TP 2 : réglages seulement — les grandeurs se mesurent à l'écran du scope
        const fText = S.gbfFreq >= 1000 ? (S.gbfFreq / 1000).toFixed(2) + ' kHz' : S.gbfFreq + ' Hz';
        el.innerHTML = `TP 2 · Filtre <b>${S.tp2Filter}</b> · GBF : <b>${fText}</b>`
            + (S.loopOk ? '' : ' · <span class="warn">signal non raccordé</span>')
            + ` · Ue (CH1) et Us (CH2) : <b>compter les divisions</b> — U = N div × V/DIV, G = 20·log(Us/Ue)`
            + (S.gbfOn ? '' : ' · <span class="warn">GBF éteint</span>');
    } else {
        el.innerHTML = tp3LiveLine();
    }
}

/** L'état du câblage du TP 3 — jamais les valeurs mesurées : celles-ci se
 *  lisent sur les aiguilles des multimètres (calibre choisi + divisions).  */
function tp3LiveLine() {
    const t3 = S.tp3, topo = t3.topo || {};
    const gen = (n, on, cc) => `E${n} : <b>${on ? (cc ? 'CC' : 'CV') : 'OFF'}</b>`;
    let s = `TP 3 · ${TP3_TITLES[t3.level] || ''}<br>`
        + `${gen(1, t3.on1, t3.cc1)} · ${gen(2, t3.on2, t3.cc2)} · Rhéostat : <b>${fr(t3.rheo, 1)} Ω</b><br>`
        + `Voltmètre : calibre <b>${String(VOLT_CALS[S.voltCal]).replace('.', ',')} V</b>`
        + ` · Ampèremètre : calibre <b>${AMP_CALS[S.ammCal]} mA</b>`
        + (S.overload ? ' · <span class="warn">O L — surcharge, montez de calibre</span>' : '')
        + ` · lecture : g = N div × C/100`;

    const notes = [];
    if (topo.Rin) notes.push('branche R en place');
    else notes.push('branche R retirée');
    if (topo.vAB) notes.push('voltmètre entre A et B');
    else if (topo.vR) notes.push('voltmètre aux bornes de R');
    if (topo.aAB) notes.push('ampèremètre entre A et B');
    if (topo.e1Short) notes.push('E1 remplacé par un fil');
    if (topo.e2Short) notes.push('E2 remplacé par un fil');
    if (topo.rheoParallel) notes.push('rhéostat raccordé');
    if (topo.rheoSeries) notes.push('rhéostat en série avec R');
    if (S.abShort) notes.push('<span class="warn">A et B court-circuités</span>');
    if (S.faultShort) notes.push('<span class="warn">court-circuit générateur</span>');
    if (S.tp3Saturated) notes.push('<span class="warn">tension de conformité dépassée</span>');
    if (S.rheoOver) notes.push('<span class="warn">rhéostat en surintensité</span>');
    if (notes.length) s += `<br><span class="dim">${notes.join(' · ')}</span>`;
    if (!t3.on1 && !t3.on2) s += ' · <span class="warn">alimentations éteintes</span>';
    return s;
}

// persist header fields whenever they change
['fName', 'fDate', 'fPoste'].forEach(id => {
    const el = $(id);
    if (el && !el.dataset.persist) {
        el.dataset.persist = '1';
        el.addEventListener('input', savePaperState);
        el.addEventListener('change', savePaperState);
    }
});

/* Textes de la feuille selon le TP ouvert */
const PAPER_SUB = {
    1: 'TP 1 · Mesure de résistances — à remplir au stylo, case par case.',
    2: 'TP 2 · Réponse fréquentielle — relevez f, Ve, Vs, puis calculez le gain.',
    3: 'TP 3 · Théorèmes électrocinétiques — Table 9 : valeurs et incertitudes à écrire au stylo.'
};
const PAPER_FOOT = {
    1: 'Rappel : R = U / I · Pont équilibré ⇒ Rx = (R2 / R1) · Rv',
    2: 'Rappel : G(dB) = 20 · log(Vs / Ve) · coupure à −3 dB',
    3: 'Rappel : R_Th = V₀ / I₀ · I_Th = E_Th / (R_Th + R) · Δg = Σ |∂g/∂p| · Δp'
};

export function renderTable() {
    const head = $('cahierHead');
    const body = $('cahierBody');
    const bodeSec = $('bodeSection');
    const tp3Sec = $('tp3Section');
    if (!body || !head) return;

    /* sections annexes : papier semi-log pour le TP 2, aide-mémoire pour le TP 3 */
    if (bodeSec) bodeSec.classList.toggle('hidden', S.activeTP !== 2);
    if (tp3Sec) tp3Sec.classList.toggle('hidden', S.activeTP !== 3);

    /* en-tête et pied de page adaptés au TP actif */
    const sub = $('paperSub'), foot = $('paperFoot');
    if (sub) sub.textContent = PAPER_SUB[S.activeTP] || PAPER_SUB[1];
    if (foot) foot.textContent = PAPER_FOOT[S.activeTP] || PAPER_FOOT[1];

    /* la table 9 est imprimée : on n'y ajoute pas de ligne */
    const bRow = $('btnRow');
    if (bRow) { bRow.classList.toggle('hidden', S.activeTP === 3); bRow.disabled = S.activeTP === 3; }

    if (S.activeTP === 1) {
        // --- TP 1 : Tableau existant (Loi d'Ohm & Wheatstone) ---
        head.innerHTML = `
        <tr>
            <th style="width:34px">n°</th>
            <th style="width:96px">Niveau</th>
            <th style="width:130px">Montage / Pont</th>
            <th style="width:78px">U (V)</th>
            <th style="width:82px">I (mA)</th>
            <th style="width:96px">R / Rx (Ω)</th>
            <th style="width:66px">Heure</th>
            <th>Observations</th>
            <th style="width:34px"></th>
        </tr>`;

        $('cahierEmpty').style.display = rows.length ? 'none' : 'block';
        body.innerHTML = rows.map((r, i) => `
        <tr>
            <td class="num">${i + 1}</td>
            <td><input class="cellin" data-i="${i}" data-f="lvl" value="${r.lvl || ''}"></td>
            <td><input class="cellin" data-i="${i}" data-f="montage" value="${r.montage || ''}"></td>
            <td><input class="cellin" data-i="${i}" data-f="U" value="${r.U || ''}"></td>
            <td><input class="cellin" data-i="${i}" data-f="I" value="${r.I || ''}"></td>
            <td><input class="cellin" data-i="${i}" data-f="R" value="${r.R || ''}"></td>
            <td><input class="cellin" data-i="${i}" data-f="time" value="${r.time || ''}"></td>
            <td><input class="cellin" data-i="${i}" data-f="obs" value="${r.obs || ''}"></td>
            <td><button class="rowdel" data-i="${i}"><i data-lucide="trash-2"></i></button></td>
        </tr>`).join('');
    } else if (S.activeTP === 2) {
        // --- TP 2 : Tables 6, 7 et 8 du Fascicule ---
        const fList = measurementsTP2[S.tp2Filter] || [];

        head.innerHTML = `
        <tr>
            <th style="width:34px">Point</th>
            <th style="width:110px">Fréquence f (Hz)</th>
            <th style="width:90px">Ve (V)</th>
            <th style="width:90px">Vs (V)</th>
            <th style="width:90px">Vs / Ve</th>
            <th style="width:100px">Gain G (dB)</th>
            <th style="width:90px">Déphasage φ</th>
            <th>Remarques</th>
            <th style="width:34px"></th>
        </tr>`;

        $('cahierEmpty').style.display = fList.length ? 'none' : 'block';
        body.innerHTML = fList.map((r, i) => `
        <tr>
            <td class="num">f${i + 1}${r.isFc ? ' (fc)' : ''}</td>
            <td><input class="cellin" data-i="${i}" data-f="f" value="${r.f}"></td>
            <td><input class="cellin" data-i="${i}" data-f="Ve" value="${r.Ve}"></td>
            <td><input class="cellin" data-i="${i}" data-f="Vs" value="${r.Vs}"></td>
            <td><input class="cellin" data-i="${i}" data-f="gainLin" value="${r.gainLin}"></td>
            <td><input class="cellin" data-i="${i}" data-f="gainDb" value="${r.gainDb}"></td>
            <td><input class="cellin" data-i="${i}" data-f="phi" value="${r.phi}"></td>
            <td><input class="cellin" data-i="${i}" data-f="obs" value="${r.obs || ''}"></td>
            <td><button class="rowdel" data-i="${i}"><i data-lucide="trash-2"></i></button></td>
        </tr>`).join('');

        // Mise à jour de l'indice de la fréquence de coupure
        const fcHint = $('fcHint');
        if (fcHint) {
            fcHint.textContent = (S.tp2Filter === 'RC-CR')
                ? 'Théorie : fc1 ≈ 329 Hz  ·  fc2 ≈ 3288 Hz'
                : 'Théorie : fc = 1/(2π·R1·C1) ≈ 3288 Hz';
        }

        // Actualisation du tracé semi-logarithmique
        drawBodeDiagram();
    } else {
        // --- TP 3 : Table 9 du fascicule (imprimée, à compléter au stylo) ---
        renderTP3Table(head, body);
    }

    if (window.lucide) lucide.createIcons();

    // Gestion des événements input et suppression de ligne
    body.querySelectorAll('.cellin').forEach(inp => {
        inp.addEventListener('input', () => {
            if (S.activeTP === 3) {
                const cell = measurementsTP3[inp.dataset.k];
                if (!cell) return;
                cell[inp.dataset.f] = inp.value;
                updateTP3ReportFlags();
                refreshMissions();
            } else if (S.activeTP === 1) {
                const r = rows[+inp.dataset.i];
                if (!r) return;
                r[inp.dataset.f] = inp.value;
                if (inp.dataset.f === 'U' || inp.dataset.f === 'I') autoR(r, inp);
                markRecorded(r);
            } else {
                const r = measurementsTP2[S.tp2Filter][+inp.dataset.i];
                if (!r) return;
                r[inp.dataset.f] = inp.value;
                drawBodeDiagram();
            }
            savePaperState();
        });
        inp.addEventListener('focus', () => sfx.scribble());
    });

    body.querySelectorAll('.rowdel').forEach(b => {
        b.onclick = () => {
            if (S.activeTP === 1) rows.splice(+b.dataset.i, 1);
            else measurementsTP2[S.tp2Filter].splice(+b.dataset.i, 1);
            sfx.click();
            renderTable();
            savePaperState();
        };
    });
}

/**
 * Table 9 du fascicule : les grandeurs sont IMPRIMÉES, les cases Valeur et
 * Incertitude restent vides.  Rien n'est jamais rempli automatiquement :
 * l'élève écrit au stylo ce qu'il a lu (ou « Recopier mesure » pour les
 * grandeurs directement lues par les appareils).
 */
function renderTP3Table(head, body) {
    const lvl = S.tp3.level;
    head.innerHTML = `
        <tr>
            <th style="width:46px">Manip.</th>
            <th style="width:300px">Grandeur mesurée</th>
            <th style="width:118px">Valeur</th>
            <th style="width:118px">Incertitude</th>
            <th>À obtenir avec</th>
        </tr>`;
    $('cahierEmpty').style.display = 'none';

    const AIDE = {
        V: 'le voltmètre', A: "l'ampèremètre", 'Ω': 'le calcul V₀ / I₀'
    };
    let lastM = 0, html = '';
    for (const r of TP3_ROWS) {
        if (r.m !== lastM) {
            lastM = r.m;
            html += `<tr class="manip-head"><td colspan="5">${TP3_TITLES[r.m]}`
                + (r.m === lvl ? ' &nbsp;·&nbsp; ← manipulation en cours' : '') + '</td></tr>';
        }
        const c = measurementsTP3[r.key] || {};
        html += `
        <tr class="${r.m === lvl ? 'nowrow' : ''}${r.calc ? ' calcrow' : ''}">
            <td class="num">${r.m}</td>
            <td class="grandeur">${r.g}${r.calc ? ' <span class="dim">(à calculer)</span>' : ''}</td>
            <td><input class="cellin" data-k="${r.key}" data-f="valeur" value="${esc(c.valeur)}" placeholder="…"></td>
            <td><input class="cellin" data-k="${r.key}" data-f="incert" value="${esc(c.incert)}" placeholder="Δ"></td>
            <td class="num">${AIDE[r.unit] || ''}</td>
        </tr>`;
    }
    body.innerHTML = html;
}

const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Lignes dont la saisie valide l'objectif « reporter sur la feuille ». */
const TP3_REPORT = {
    recV0: ['V0'], recI0: ['I0'],
    recVM: ['VM', 'IRcalc', 'IR'],
    recSup: ['I1', 'I2', 'Itot'],
    recTh: ['RTh', 'ITh'],
    recNo: ['RNo', 'INo']
};
/* V₀ et I₀ doivent être écrits AVEC leur incertitude (énoncé de la manip 1) */
const TP3_NEEDS_INCERT = ['V0', 'I0'];

export function updateTP3ReportFlags() {
    for (const flag of Object.keys(TP3_REPORT)) {
        S.tp3[flag] = TP3_REPORT[flag].every(k => {
            const c = measurementsTP3[k];
            if (!c || !String(c.valeur).trim()) return false;
            return TP3_NEEDS_INCERT.includes(k) ? !!String(c.incert).trim() : true;
        });
    }
}

/** Remet la table 9 à blanc (« Tout effacer »). */
export function clearTP3Table() {
    TP3_ROWS.forEach(r => { measurementsTP3[r.key] = { valeur: '', incert: '' }; });
    updateTP3ReportFlags();
}

/** Calcule automatiquement R = U / I dès que l'élève modifie U ou I (avec I en mA) */
function autoR(r, inp) {
    const u = parseFloat(String(r.U).replace(',', '.'));
    const imA = parseFloat(String(r.I).replace(',', '.'));

    if (Number.isFinite(u) && Number.isFinite(imA) && Math.abs(imA) > 1e-9) {
        const row = inp.closest('tr');
        const rIn = row.querySelector('[data-f="R"]');
        if (rIn) {
            // Conversion mA -> A : R = U / (I / 1000) = (U * 1000) / I
            const rCalc = (u * 1000) / imA;
            rIn.value = rCalc.toFixed(2).replace('.', ',');
            r.R = rIn.value;
            rIn.animate([{ background: 'rgba(56,189,248,.4)' }, { background: 'transparent' }], { duration: 700 });
        }
    }
}

function markRecorded(r) {
    const filled = ['U', 'I', 'R', 'montage'].filter(f => String(r[f] || '').trim()).length;
    const lvl = String(r.lvl || '').trim().toUpperCase();
    if (filled >= 2) {
        if (lvl.startsWith('B') || S.level === 'B') S.recordedB = true;
        else S.recordedA = true;
        refreshMissions();
    }
}

export function addBlankRow(focus = true) {
    if (S.activeTP === 3) {
        sfx.err();
        toast('Table 9 : le formulaire est déjà imprimé — complétez les cases Valeur et Incertitude.', 'warn');
        return;
    }
    if (S.activeTP === 1) {
        const now = new Date();
        rows.push({
            lvl: '', montage: '', U: '', I: '', R: '', obs: '',
            time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        });
        sfx.scribble();
        renderTable();
        savePaperState();
        if (focus) {
            const inputs = $('cahierBody').querySelectorAll(`[data-i="${rows.length - 1}"]`);
            if (inputs[1]) inputs[1].focus();
        }
    } else {
        measurementsTP2[S.tp2Filter].push({
            f: '', Ve: '', Vs: '', gainLin: '', gainDb: '', phi: '', obs: '', isFc: false
        });
        sfx.scribble();
        renderTable();
        savePaperState();
        if (focus) {
            const inputs = $('cahierBody').querySelectorAll(`[data-i="${measurementsTP2[S.tp2Filter].length - 1}"]`);
            if (inputs[0]) inputs[0].focus();
        }
    }
}

/** Recopie ce qu'affichent les appareils dans une nouvelle ligne… à corriger à la main. */
export function addReadingFromInstruments() {
    if (S.activeTP === 3) { tp3Recopy(); return; }
    if (S.activeTP === 1) {
        if (!S.genOn) { sfx.err(); toast("Générateur éteint : allumez-le avant de relever.", 'error'); return; }
        if (S.montage === '—' || !S.loopOk) { sfx.err(); toast('Circuit incomplet : câblez le montage avant de relever.', 'error'); return; }
        if (S.overload) { sfx.err(); toast(`Ampèremètre en surcharge (calibre ${AMP_CALS[S.ammCal]} mA dépassé) : montez de calibre.`, 'error'); return; }

        /* On recopie la LECTURE DE L'AIGUILLE (à la demi-division près),
           jamais la vérité du solveur : g = N div × calibre / 100.
           L'erreur de lecture fait partie de l'exercice (Δg du fascicule). */
        const cV = VOLT_CALS[S.voltCal], cA = AMP_CALS[S.ammCal];
        if (S.UV > cV) { sfx.err(); toast(`Voltmètre en surcharge : ${String(cV).replace('.', ',')} V de calibre ne suffisent pas — montez de calibre.`, 'error'); return; }
        const dV = readMeterDiv('V'), dA = readMeterDiv('A');
        if (dV == null || dA == null) { sfx.err(); toast('Appareils indisponibles.', 'error'); return; }
        const tgtV = Math.max(0, Math.min(S.UV / cV * METER_NDIV, METER_NDIV * 1.06));
        const tgtA = Math.max(0, Math.min(S.IA * 1000 / cA * METER_NDIV, METER_NDIV * 1.06));
        if (Math.abs(dV - tgtV) > 1.5 || Math.abs(dA - tgtA) > 1.5) {
            sfx.err(); toast("L'aiguille bouge encore : attendez la stabilisation avant de recopier.", 'warn'); return;
        }
        const U = Math.round(dV * 2) / 2 * cV / METER_NDIV;      // lecture à la demi-division
        const ImA = Math.round(dA * 2) / 2 * cA / METER_NDIV;
        rows.push({
            lvl: 'A', montage: S.montage.toUpperCase(), U: fr(U, 2), I: fr(ImA, 1),
            R: ImA > 1e-6 ? fr(U / (ImA / 1000), 2) : '—', time: nowHM(), obs: '', _auto: true
        });
        S.recordedA = true;
        toast(`Lecture recopiée : U = ${fr(U, 2)} V (calibre ${String(cV).replace('.', ',')} V) · `
            + `I = ${fr(ImA, 1)} mA (calibre ${cA} mA) — c'est ce que montre l'aiguille.`, 'success');
        sfx.ok(); renderTable(); refreshMissions(); savePaperState();
    } else {
        if (!S.gbfOn) { sfx.err(); toast("Le GBF est éteint : allumez-le avant de recopier la mesure.", 'error'); return; }
        if (!S.loopOk) { sfx.err(); toast("Le circuit du filtre n'est pas alimenté ou mal relié.", 'error'); return; }

        const fList = measurementsTP2[S.tp2Filter];
        const isFc = Math.abs(S.gainDb - (-3.01)) < 0.6;

        /* Lecture QUANTIFIÉE à l'écran du scope, comme à la main :
           Ve sur CH1 et Vs sur CH2 à 0,2 div près, Δφ relevé par le
           décalage Δx entre les deux traces à 0,1 div près.             */
        if (!S.ch1.ok || !S.ch2.ok) {
            sfx.err();
            toast(`Mesure impossible : ${(!S.ch1.ok ? S.ch1.why : S.ch2.why).replace(/^CH\d : /, '')} — raccordez les deux sondes.`, 'error');
            return;
        }
        const qv = (v, vdiv) => Math.round(v / vdiv * 5) / 5 * vdiv;
        const Ve = qv(S.Ve, S.osc.ch1VDiv), Vs = qv(S.Vs, S.osc.ch2VDiv);
        const gl = Ve > 1e-9 ? Vs / Ve : 0;
        const gdb = gl > 1e-9 ? 20 * Math.log10(gl) : -99;
        let phaseDeg = '—';
        if (S.phaseMeas != null && S.gbfFreq > 0 && S.osc.timeDiv > 0) {
            const tDiv = (1 / S.gbfFreq) / S.osc.timeDiv;        // période, en divisions
            const dx = Math.round(S.phaseMeas / (2 * Math.PI) * tDiv * 10) / 10;   // Δx lu, à 0,1 div
            phaseDeg = ((dx / tDiv) * 360).toFixed(0) + '°';
        }

        fList.push({
            f: S.gbfFreq,
            Ve: fr(Ve, 2),
            Vs: fr(Vs, 2),
            gainLin: fr(gl, 3),
            gainDb: fr(gdb, 2),
            phi: phaseDeg,
            isFc,
            obs: isFc ? 'Fréquence de coupure fc (-3 dB)' : ''
        });

        if (S.tp2Filter === 'RC') S.recordedTP2_RC = (fList.length >= 4);
        if (S.tp2Filter === 'CR') S.recordedTP2_CR = (fList.length >= 4);
        if (S.tp2Filter === 'RC-CR') S.recordedTP2_Band = (fList.length >= 4);

        sfx.ok();
        toast(`Mesure recopiée depuis l'écran : f = ${S.gbfFreq} Hz, G = ${fr(gdb, 1)} dB (lecture en divisions) — point reporté sur le graphe de Bode.`, 'success');
        renderTable();
        refreshMissions();
        savePaperState();
    }
}
/* TP 3 : « Recopier mesure » écrit UNIQUEMENT la grandeur que les appareils
   lisent à l'instant, dans sa ligne de la table 9.  Les lignes de calcul
   (I_R = V_M/R, I_total, R_Th, R_No) ne sont jamais remplies à votre place. */
function tp3Recopy() {
    const t3 = S.tp3, topo = t3.topo || {};
    if (!t3.on1 && !t3.on2) {
        sfx.err(); toast('Les deux alimentations sont éteintes : allumez E1 et/ou E2 avant de relever.', 'error'); return;
    }
    if (S.faultShort) {
        sfx.err(); toast('Court-circuit détecté : coupez les alimentations et corrigez le câblage.', 'error'); return;
    }
    if (S.overload) {
        sfx.err(); toast("Ampèremètre en surcharge : impossible de recopier une mesure fausse.", 'error'); return;
    }
    if (!S.loopOk) {
        sfx.err(); toast('Circuit incomplet : aucun courant ne circule, vérifiez vos fils.', 'error'); return;
    }

    const EPS = 2e-5;
    const seriesWithR = topo.Rin && Math.abs(S.IA) > EPS && Math.abs(t3.IR) > EPS
        && Math.abs(Math.abs(S.IA) - Math.abs(t3.IR)) < 0.01 * Math.abs(t3.IR);

    let key = null, val = 0, unit = '';
    if (topo.Rout && topo.vAB && Math.abs(S.UV) > 0.05) { key = 'V0'; val = S.UV; unit = 'V'; }
    else if (topo.Rout && topo.aAB && Math.abs(S.IA) > EPS) { key = 'I0'; val = S.IA; unit = 'A'; }
    else if (topo.Rin && (topo.vR || topo.vAB) && Math.abs(S.UV) > 0.05) { key = 'VM'; val = S.UV; unit = 'V'; }
    else if (seriesWithR) {
        unit = 'A'; val = S.IA;
        if (t3.level === 3) {
            key = (t3.on1 && !t3.on2 && topo.e2Short) ? 'I1'
                : (t3.on2 && !t3.on1 && topo.e1Short) ? 'I2'
                    : (t3.on1 && t3.on2) ? 'Itot' : null;
        } else if (t3.level === 4) key = 'ITh';
        else if (t3.level === 5) key = 'INo';
        else key = 'IR';
    }
    if (!key) {
        sfx.err();
        toast("Aucune grandeur lisible : placez le voltmètre aux bornes voulues, ou l'ampèremètre en série dans la branche R.", 'warn');
        return;
    }

    /* On recopie la LECTURE DE L'AIGUILLE (demi-division), pas la valeur du
       solveur : g = N div × calibre / 100 — l'erreur de lecture fait partie
       de l'exercice (elle alimente les Δg de la table 9).                  */
    const isV = unit === 'V';
    const raw = isV ? S.UV : S.IA;
    if (raw < 0) {
        sfx.err();
        toast("L'aiguille reste à zéro : les bornes de l'appareil sont inversées par rapport au sens conventionnel — retournez les fils.", 'warn');
        return;
    }
    const cal = isV ? VOLT_CALS[S.voltCal] : AMP_CALS[S.ammCal];
    if (isV && raw > cal) {
        sfx.err();
        toast(`Voltmètre en surcharge : le calibre ${String(cal).replace('.', ',')} V est trop petit — montez de calibre avant de lire.`, 'warn');
        return;
    }
    const dN = readMeterDiv(isV ? 'V' : 'A');
    if (dN == null) { sfx.err(); toast('Appareil indisponible.', 'error'); return; }
    const divExact = Math.min((isV ? raw : raw * 1000) / cal * METER_NDIV, METER_NDIV * 1.06);
    if (Math.abs(dN - divExact) > 1.5) {
        sfx.err(); toast("L'aiguille bouge encore : attendez la stabilisation avant de recopier.", 'warn'); return;
    }
    val = Math.round(dN * 2) / 2 * cal / METER_NDIV * (isV ? 1 : 0.001);

    const cell = measurementsTP3[key];
    if (!cell) return;
    cell.valeur = unit === 'V' ? fr(val, 2) : fr(val, 4);
    const row = TP3_ROWS.find(r => r.key === key);
    updateTP3ReportFlags();
    sfx.ok();
    toast(`${row ? row.g : key} = ${cell.valeur} ${unit} — recopié sur la feuille. `
        + `Écrivez maintenant son incertitude.`, 'success');
    renderTable();
    refreshMissions();
    savePaperState();
}

const nowHM = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Ouvre / referme la feuille de relevés. */
export function openPaper(o) {
    paperOpen = o;
    $('cahier').classList.toggle('hiddenx', !o);
    if (o) {
        refreshLiveLine(); renderTable();
        if (!$('fName').value) $('fName').value = ME.solo ? '' : (ME.name || '');
        onPaperOpen && onPaperOpen();
    } else {
        onPaperClose && onPaperClose();
        savePaperState();
    }
    updateHintVisibility && updateHintVisibility();
}

/**
 * Clic sur le papier (ou le stylo) : on prend une NOUVELLE feuille vierge.
 * Les relevés déjà écrits restent consultables via « Feuille précédente ».
 */
/** Copie de la table 9 courante (+ indicateur « non vierge »). */
function snapshotTP3() {
    const data = {};
    let filled = false;
    for (const r of TP3_ROWS) {
        const c = measurementsTP3[r.key] || {};
        data[r.key] = { valeur: c.valeur || '', incert: c.incert || '' };
        if (String(c.valeur || '').trim() || String(c.incert || '').trim()) filled = true;
    }
    return { data, filled };
}

export function newSheet() {
    if (S.activeTP === 3) {
        const snap = snapshotTP3();
        if (snap.filled) sheetsTP3.push(snap.data);
        clearTP3Table();
        ['fDate', 'fPoste'].forEach(id => { const e = $(id); if (e) e.value = ''; });
        const d = $('fDate'); if (d) d.value = new Date().toLocaleDateString('fr-FR');
        openPaper(true);
        turnPage();
        toast(snap.filled
            ? 'Nouvelle feuille vierge — la table 9 précédente est conservée (bouton « Feuille précédente »).'
            : 'Nouvelle feuille : complétez la table 9 au stylo.', 'info');
        refreshPrevSheetButton();
        savePaperState();
        return;
    }
    const had = rows.length;
    if (had) sheets.push(rows.splice(0, rows.length));
    ['fDate', 'fPoste'].forEach(id => { const e = $(id); if (e) e.value = ''; });
    const d = $('fDate'); if (d) d.value = new Date().toLocaleDateString('fr-FR');
    openPaper(true);
    turnPage();
    toast(had
        ? `Nouvelle feuille vierge — les ${had} relevé(s) précédent(s) sont conservés (bouton « Feuille précédente »).`
        : 'Nouvelle feuille : remplissez les cases au stylo.', 'info');
    refreshPrevSheetButton();
    savePaperState();
}

/** Animation « on tourne la page ». */
function turnPage() {
    const sheet = $('cahier');
    if (sheet) { sheet.classList.remove('turn'); void sheet.offsetWidth; sheet.classList.add('turn'); }
}

/** Pile des feuilles déjà utilisées. */
export const sheets = [];

/** Revient à la feuille précédente (si l'actuelle est vierge, elle est jetée). */
export function prevSheet() {
    if (S.activeTP === 3) {
        if (!sheetsTP3.length) { sfx.err(); toast('Aucune feuille précédente.', 'warn'); return; }
        const cur = snapshotTP3();
        if (cur.filled) sheetsTP3.push(cur.data);
        const back = sheetsTP3.pop();
        TP3_ROWS.forEach(r => {
            const c = back && back[r.key];
            measurementsTP3[r.key] = { valeur: c ? c.valeur || '' : '', incert: c ? c.incert || '' : '' };
        });
        updateTP3ReportFlags();
        sfx.scribble(); renderTable(); refreshMissions(); refreshPrevSheetButton(); savePaperState();
        toast('Feuille précédente rechargée.', 'info');
        return;
    }
    if (!sheets.length) { sfx.err(); toast('Aucune feuille précédente.', 'warn'); return; }
    const cur = rows.splice(0, rows.length);
    if (cur.some(r => ['U', 'I', 'R', 'montage', 'obs'].some(f => String(r[f] || '').trim()))) sheets.push(cur);
    rows.push(...sheets.pop());
    sfx.scribble(); renderTable(); refreshPrevSheetButton(); savePaperState();
    toast('Feuille précédente rechargée.', 'info');
}

export function refreshPrevSheetButton() {
    const b = $('btnPrevSheet');
    if (!b) return;
    const n = (S.activeTP === 3 ? sheetsTP3 : sheets).length;
    b.classList.toggle('hidden', n === 0);
    b.title = n ? `Revenir à la feuille précédente (${n} en réserve)` : '';
}

export function exportCSV() {
    if (S.activeTP === 3) {
        const filled = TP3_ROWS.some(r => String((measurementsTP3[r.key] || {}).valeur || '').trim());
        if (!filled) { toast('La table 9 est vierge : rien à exporter.', 'warn'); return; }
        const name = ($('fName').value || ME.name || '').replace(/;/g, ',');
        const head = 'Nom;Manip.;Grandeur mesurée;Valeur;Incertitude\n';
        const body = TP3_ROWS.map(r => {
            const c = measurementsTP3[r.key] || {};
            return [name, r.m, r.g.replace(/;/g, ','), c.valeur || '', c.incert || ''].join(';');
        }).join('\n');
        const blob = new Blob(['\uFEFF' + head + body], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'releves_TP3_theoremes.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Export CSV TP3 téléchargé.', 'success');
        return;
    }
    if (S.activeTP === 1) {
        if (!rows.length) { toast('La feuille TP1 est vierge.', 'warn'); return; }
        const head = 'N°;Nom;Niveau;Montage / Pont;U (V);I (mA);R / Rx (Ω);Heure;Observations\n';
        const name = ($('fName').value || ME.name || '').replace(/;/g, ',');
        const body = rows.map((r, i) => [
            i + 1, name, r.lvl || '', r.montage || '', r.U || '', r.I || '', r.R || '', r.time || '', (r.obs || '').replace(/\n/g, ' ')
        ].join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + head + body], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'releves_TP1.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Export CSV TP1 téléchargé.', 'success');
    } else {
        const fList = measurementsTP2[S.tp2Filter] || [];
        if (!fList.length) { toast('La feuille TP2 est vierge.', 'warn'); return; }
        const head = 'Point;Fréquence f (Hz);Ve (V);Vs (V);Vs / Ve;Gain G (dB);Déphasage φ;Remarques\n';
        const name = ($('fName').value || ME.name || '').replace(/;/g, ',');
        const body = fList.map((r, i) => [
            `f${i+1}${r.isFc ? '(fc)' : ''}`, r.f || '', r.Ve || '', r.Vs || '', r.gainLin || '', r.gainDb || '', r.phi || '', (r.obs || '').replace(/\n/g, ' ')
        ].join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + head + body], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `releves_TP2_${S.tp2Filter}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Export CSV TP2 téléchargé.', 'success');
    }
}

/* ------------------------------------------------------------------ */
/*  2. Tracé du Diagramme de Bode (Papier semi-logarithmique)          */
/* ------------------------------------------------------------------ */
export function drawBodeDiagram() {
    const canvas = $('bodeCanvas');
    if (!canvas) return;
    const ctx2 = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Fond blanc cassé type papier millimétré
    ctx2.fillStyle = '#fcfbf7';
    ctx2.fillRect(0, 0, W, H);

    const padL = 50, padR = 24, padT = 24, padB = 40;
    const pw = W - padL - padR;
    const ph = H - padT - padB;

    // Plage d'abscisse : 4 décades (10 Hz = 10^1 à 100 kHz = 10^5)
    const logMin = 1; // 10 Hz
    const logMax = 5; // 100 000 Hz

    // Plage d'ordonnée : -40 dB à +5 dB
    const dbMin = -40;
    const dbMax = 5;

    const getX = (f) => padL + ((Math.log10(Math.max(10, f)) - logMin) / (logMax - logMin)) * pw;
    const getY = (db) => padT + ((dbMax - Math.max(dbMin, Math.min(dbMax, db))) / (dbMax - dbMin)) * ph;

    // 1. Tracé de la grille logarithmique
    ctx2.lineWidth = 1;
    for (let dec = logMin; dec < logMax; dec++) {
        for (let sub = 1; sub <= 9; sub++) {
            const freq = sub * Math.pow(10, dec);
            const x = getX(freq);
            ctx2.strokeStyle = (sub === 1) ? 'rgba(70, 120, 190, 0.45)' : 'rgba(70, 120, 190, 0.16)';
            ctx2.beginPath();
            ctx2.moveTo(x, padT);
            ctx2.lineTo(x, padT + ph);
            ctx2.stroke();
        }
    }
    // Ligne limite 100 kHz
    ctx2.strokeStyle = 'rgba(70, 120, 190, 0.45)';
    ctx2.beginPath();
    ctx2.moveTo(padL + pw, padT); ctx2.lineTo(padL + pw, padT + ph);
    ctx2.stroke();

    // 2. Grille horizontale (dB)
    for (let db = dbMin; db <= dbMax; db += 5) {
        const y = getY(db);
        ctx2.strokeStyle = (db === 0 || db === -3) ? 'rgba(220, 60, 60, 0.38)' : 'rgba(70, 120, 190, 0.18)';
        ctx2.beginPath();
        ctx2.moveTo(padL, y);
        ctx2.lineTo(padL + pw, y);
        ctx2.stroke();

        // Texte des ordonnées
        ctx2.fillStyle = (db === 0 || db === -3) ? '#b91c1c' : '#64748b';
        ctx2.font = '600 11px "JetBrains Mono", monospace';
        ctx2.textAlign = 'right';
        ctx2.fillText(`${db} dB`, padL - 6, y + 4);
    }

    // Graduations des fréquences (10 Hz, 100 Hz, 1 kHz, 10 kHz, 100 kHz)
    ctx2.textAlign = 'center';
    ctx2.fillStyle = '#334155';
    ctx2.font = '600 12px "JetBrains Mono", monospace';
    const labels = ['10 Hz', '100 Hz', '1 kHz', '10 kHz', '100 kHz'];
    for (let dec = logMin; dec <= logMax; dec++) {
        const x = getX(Math.pow(10, dec));
        ctx2.fillText(labels[dec - logMin], x, H - padB + 18);
    }

    // 3. Courbe de l'ÉLÈVE uniquement : ses points mesurés, reliés dans
    //    l'ordre des fréquences.  La feuille n'imprime JAMAIS la courbe
    //    théorique ni les asymptotes : elles révéleraient fc et f₀, que
    //    l'élève doit justement déterminer par la mesure (fascicule p. 14-15).
    const pts = measurementsTP2[S.tp2Filter] || [];
    const plotted = pts.map(p => {
        const fVal = parseFloat(String(p.f).replace(',', '.'));
        const gVal = parseFloat(String(p.gainDb).replace(',', '.'));
        return (Number.isFinite(fVal) && Number.isFinite(gVal)) ? { f: fVal, g: gVal } : null;
    }).filter(Boolean).sort((a, b) => a.f - b.f);

    if (plotted.length > 1) {
        ctx2.strokeStyle = '#b45309';
        ctx2.lineWidth = 1.6;
        ctx2.beginPath();
        plotted.forEach((p, i) => {
            const x = getX(p.f), y = getY(p.g);
            if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
        });
        ctx2.stroke();
    }

    // 4. Croix de mesure sur chaque point recopié
    plotted.forEach(p => {
        const x = getX(p.f), y = getY(p.g);
        ctx2.strokeStyle = '#d97706';
        ctx2.lineWidth = 2.4;
        const sz = 5;
        ctx2.beginPath();
        ctx2.moveTo(x - sz, y - sz); ctx2.lineTo(x + sz, y + sz);
        ctx2.moveTo(x - sz, y + sz); ctx2.lineTo(x + sz, y - sz);
        ctx2.stroke();

        ctx2.fillStyle = '#d97706';
        ctx2.beginPath();
        ctx2.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx2.fill();
    });

    // légende : la méthode, jamais la réponse
    ctx2.fillStyle = '#64748b';
    ctx2.font = '500 11px "JetBrains Mono", monospace';
    ctx2.textAlign = 'left';
    ctx2.fillText('Vos points mesurés — la coupure se lit là où la courbe passe à −3 dB.', padL + 6, padT + 14);
}

/* ------------------------------------------------------------------ */
/*  Chat + coups                                                       */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  TP 3 : contrôle des calculs de l'élève                             */
/*                                                                     */
/*  Règle absolue : on ne compare JAMAIS aux valeurs théoriques des     */
/*  manipulations.  R_Th est contrôlé avec LES MESURES de l'élève       */
/*  (V₀ et I₀ qu'il a écrits lui-même) ; seule la propagation des       */
/*  incertitudes est vérifiée, et seulement par un verdict.             */
/* ------------------------------------------------------------------ */
const toNum = (v) => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

function setVerdict(id, ok, txt) {
    const el = $(id);
    if (!el) return;
    el.className = 'mono ' + (ok ? 'ok' : 'ko');
    el.textContent = txt;
}

/** R_Th = V₀ / I₀, à partir des valeurs que l'élève a écrites sur sa feuille. */
export function checkRthCalc() {
    const typed = toNum($('inpRthCalc') ? $('inpRthCalc').value : '');
    if (typed === null || typed <= 0) {
        setVerdict('rthVerdict', false, 'Écrivez d\'abord votre résultat (en Ω, positif).'); sfx.err(); return;
    }
    const v0 = toNum((measurementsTP3.V0 || {}).valeur);
    const i0 = toNum((measurementsTP3.I0 || {}).valeur);
    if (v0 === null || i0 === null || Math.abs(i0) < 1e-9) {
        setVerdict('rthVerdict', false, 'Il faut d\'abord mesurer V₀ et I₀ (manipulation 1) et les écrire dans la table 9.');
        sfx.err(); return;
    }
    const ref = Math.abs(v0 / i0);
    const ecart = Math.abs(typed - ref) / ref;
    if (ecart <= 0.02) {
        setVerdict('rthVerdict', true, `Exact : V₀ / I₀ = ${fr(ref, 1)} Ω (avec vos mesures).`);
        sfx.ok();
        const cell = measurementsTP3.RTh;
        if (cell && !String(cell.valeur).trim()) cell.valeur = fr(ref, 1);
        renderTable(); savePaperState();
    } else if (Math.abs(typed * 1000 - ref) / ref <= 0.02 || Math.abs(typed / 1000 - ref) / ref <= 0.02) {
        setVerdict('rthVerdict', false, 'Division juste, mais unités : I₀ doit être en AMPÈRES (pas en mA).');
        sfx.err();
    } else {
        setVerdict('rthVerdict', false,
            `Votre résultat s'écarte de ${Math.round(ecart * 100)} % de V₀ / I₀ : refaites la division avec les valeurs de votre feuille.`);
        sfx.err();
    }
}

/**
 * Contrôle de l'incertitude propagée sur V₀ (méthode du fascicule p. 3 :
 * Δg = Σ |∂g/∂p|·Δp avec ΔE/E = 0,03 et ΔR/R = 0,05).
 * Le verdict ne donne la valeur de référence QUE si l'élève est déjà dedans :
 * hors tolérance, on indique seulement le sens de l'erreur.
 */
export function checkIncCalc() {
    const typed = toNum($('inpIncCalc') ? $('inpIncCalc').value : '');
    if (typed === null || typed <= 0) {
        setVerdict('incVerdict', false, 'Écrivez votre ΔV₀ en volts (ex. 0,28).'); sfx.err(); return;
    }
    let ref;
    try { ref = uncertaintiesTP3().dV0; } catch (e) { ref = null; }
    if (!(ref > 0)) { setVerdict('incVerdict', false, 'Contrôle indisponible pour l\'instant.'); sfx.err(); return; }
    const ecart = Math.abs(typed - ref) / ref;
    if (ecart <= 0.25) {
        setVerdict('incVerdict', true, `Cohérent : ΔV₀ ≈ ${fr(ref, 2)} V (±25 % acceptés).`);
        sfx.ok();
        const cell = measurementsTP3.V0;
        if (cell && !String(cell.incert).trim()) cell.incert = fr(ref, 2);
        updateTP3ReportFlags(); renderTable(); refreshMissions(); savePaperState();
    } else {
        setVerdict('incVerdict', false, typed < ref
            ? 'Trop petite : n\'oubliez pas TOUTES les sources (ΔE sur E₁ ET E₂, ΔR sur R₁ ET R₂).'
            : 'Trop grande : Δg = Σ|∂g/∂p|·Δp — ce ne sont pas des écarts relatifs qu\'il faut additionner bruts.');
        sfx.err();
    }
}

/* écouteurs des deux contrôleurs (ils vivent dans la feuille du TP 3) */
[['btnCheckRth', 'inpRthCalc', checkRthCalc], ['btnCheckInc', 'inpIncCalc', checkIncCalc]]
    .forEach(([btn, inp, fn]) => {
        const b = $(btn);
        if (b) b.onclick = () => { sfx.click(); fn(); };
        const e = $(inp);
        if (e) e.addEventListener('keydown', ev => {
            ev.stopPropagation();
            if (ev.code === 'Enter') { ev.preventDefault(); fn(); }
        });
    });

let chatOpen = false, onChatOpen = null, onChatClose = null, onChatSend = null;
export function setChatHooks(open, close, send) { onChatOpen = open; onChatClose = close; onChatSend = send; }
export const isChatOpen = () => chatOpen;
export const isPaperOpen = () => paperOpen;

export function openChat(o) {
    chatOpen = o;
    $('chatbar').classList.toggle('hidden', !o);
    if (o) {
        $('chatInput').value = '';
        onChatOpen && onChatOpen();
        setTimeout(() => $('chatInput').focus(), 30);
    } else {
        onChatClose && onChatClose();
    }
    updateHintVisibility && updateHintVisibility();
}

export function sendChat() {
    const txt = $('chatInput').value.trim();
    openChat(false);
    if (!txt) return;
    if (ME.solo) { toast('Mode solo : il n\'y a personne à qui écrire.', 'info'); return; }
    if (!ME.online) { toast('Aucun serveur : jouez via  python3 server.py  pour discuter à deux.', 'warn'); return; }
    onChatSend && onChatSend(txt);
    sfx.click();
}

export function hurtFlash() {
    const el = $('hurtfx');
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 70);
}

/* ------------------------------------------------------------------ */
/*  Visibilité de l'invite « cliquez pour reprendre le contrôle »       */
/* ------------------------------------------------------------------ */
let updateHintVisibility = null;
export function setHintUpdater(fn) { updateHintVisibility = fn; }
