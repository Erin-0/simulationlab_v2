/* =====================================================================
   js/state.js  —  état global de la simulation, presets graphiques,
                   registres partagés (bornes, objets interactifs) et
                   petits utilitaires.  Aucune dépendance Three.js ici :
                   ce module est importé en tout premier.
   ===================================================================== */

/* ---------- utilitaires ---------- */
export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fr = (n, d = 2) => (Number.isFinite(n) ? n : 0).toFixed(d).replace('.', ',');
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ---------- géométrie du mobilier (partagée : décor + collisions) ---------- */
export const ROOM = 5;                 // demi-largeur de la pièce (10 m × 10 m)
export const TABLE_R = 1.02;           // rayon de la paillasse circulaire
export const TABLE_H = 0.95;           // hauteur du plateau
export const DESK = { x: 3.0, z: 0.55, w: 1.15, d: 0.72, h: 0.78 };  // bureau « relevés »
export const DESK_ROT = -0.26;   // rad : le bureau pivote légèrement vers la pièce
                                 // (assez pour être esthétique, trop peu pour que la
                                 //  feuille et le stylo quittent le plateau)
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.17;

/* ---------- taille des appareils ----------
   Tous les instruments sont construits à leur taille réelle (mètres) puis
   multipliés par INSTR_SCALE : ils sont un peu plus gros qu'en vrai pour
   rester lisibles sur la paillasse, mais leurs PROPORTIONS demeurent celles
   d'un vrai laboratoire (même rapport entre l'appareil et la table).      */
export const INSTR_SCALE = 1.18;

/* ---------- presets de qualité graphique ---------- */
export const QPRESETS = {
    low: { label: 'Basse', pr: .7, shadows: false, shadowSize: 512, dust: false, dustN: 0, aniso: 1, tubeSeg: 14, tubeRad: 5, fog: .018, lcdFps: 12 },
    med: { label: 'Moyenne', pr: 1, shadows: true, shadowSize: 1024, dust: true, dustN: 90, aniso: 4, tubeSeg: 22, tubeRad: 6, fog: .024, lcdFps: 24 },
    high: { label: 'Haute', pr: 0, shadows: true, shadowSize: 2048, dust: true, dustN: 170, aniso: 8, tubeSeg: 30, tubeRad: 8, fog: .026, lcdFps: 60 }
};
export const Q = Object.assign({ level: 'low' }, QPRESETS.low);

/* ---------- presets d'éclairage (réglables en jeu, voir js/lighting.js) ---------- */
/* `panel` pilote la lumière de façade (lisibilité des appareils) et `silk`
   l'auto-luminescence des sérigraphies : plus la pièce est claire, moins les
   légendes ont besoin de briller par elles-mêmes.                       */
export const LPRESETS = {
    dim:      { label: 'Veillée',    expo: .80,  hemi: .55, spot: 62,  panel: .50, fill: .50, desk: .55, lamp: 1.15, silk: 1.50 },
    lab:      { label: 'Atelier',    expo: 1.08, hemi: .92, spot: 96,  panel: 1.00, fill: 1.00, desk: 1.00, lamp: 2.20, silk: 1.00 },
    bright:   { label: 'Lumineux',   expo: 1.22, hemi: 1.20, spot: 118, panel: 1.28, fill: 1.40, desk: 1.35, lamp: 2.75, silk: .74 },
    daylight: { label: 'Plein jour', expo: 1.34, hemi: 1.50, spot: 138, panel: 1.55, fill: 1.95, desk: 1.70, lamp: 3.10, silk: .52 }
};
xport const L = { preset: 'bright', slider: 0.85 };   // slider : 0,7 … 1,5
export const allTextures = [];         // toutes les textures procédurales (anisotropie)

/* ---------- état de la simulation ---------- */
/*  Trois travaux pratiques cohabitent :
      TP 1 — Mesure de résistances (loi d'Ohm + pont de Wheatstone)
      TP 2 — Réponse fréquentielle des circuits (GBF + oscilloscope)
      TP 3 — Vérification des théorèmes électrocinétiques            */
/* -------------- APPAREILS À AIGUILLE (voltmètre / ampèremètre) --------------
   Comme au vrai labo : ce sont des instruments ANALOGIQUES à calibres.
   Le cadran comporte METER_NDIV divisions ; on LIT l'aiguille puis on
   applique la méthode du fascicule (p. 2) :
       g  = N_div × calibre / 100          (valeur mesurée)
       Δg = classe × calibre / 100         (incertitude absolue)
   Aucun écran n'affiche la valeur : la mesure redevient un geste.        */
export const METER_NDIV = 100;                       // divisions du cadran
export const METER_CLASS = 1.5;                      // classe de précision
export const VOLT_CALS = [0.3, 1, 3, 10, 30];        // calibres volts
export const AMP_CALS = [1, 10, 30, 100, 300];       // calibres milliampères

export const S = {
    activeTP: 1,           // 1 | 2 | 3
    level: 'A',            // TP1 : 'A' (loi d'Ohm) ou 'B' (Wheatstone)

    /* ---- TP 1 : mesure de résistances ---- */
    /*  Le générateur démarre TOUJOURS éteint et à 0 V : c'est à l'élève de le
        mettre sous tension en premier (rien n'est « déjà prêt »).            */
    genOn: false, setV: 0,
    R: 100, rA: 1, rV: 1e7,                    // résistance R (Ω), résistances internes des appareils
    R1: 1000, R2: 1000, Rg: 1000,              // pont de Wheatstone (Ω)
    digits: [0, 0, 0, 0], Rv: 0,               // boîte à décades
    Rx: 1200 + Math.floor(Math.random() * 3600),   // résistance inconnue
    faultShort: false, overload: false,
    loopOk: false, montage: '—', IA: 0, UV: 0,
    voltCal: 4, ammCal: 4,     // indices de calibre — on commence au PLUS GRAND
    powered: false, boxIn: false, galvoConn: false, Vg: 0, balanced: false,
    recordedA: false, recordedB: false,

    /* ---- TP 2 : réponse fréquentielle (fascicule p. 10, 11, 14, 15) ---- */
    tp2Filter: 'RC',       // 'RC' (passe-bas) | 'CR' (passe-haut) | 'RC-CR' (passe-bande)
    gbfOn: false,
    gbfFreq: 1000,         // Hz (10 Hz … 100 kHz)
    gbfAmp: 6.0,           // tension crête-à-crête Ue = 6 V (fascicule p. 14)
    gbfWaveform: 'sine',
    /* composants normalisés de la maquette */
    tp2_R1: 2200, tp2_R2: 2200,               // 2,2 kΩ
    tp2_C1: 22e-9, tp2_C2: 220e-9,            // 22 nF et 220 nF = 10 × C1
    /* grandeurs du filtre (théorie + mesure) */
    Ve: 6.0,               // V crête-à-crête appliqué à l'entrée du filtre
    Vs: 0.0,               // V crête-à-crête en sortie de filtre
    gainLin: 0.0,          // |H| = Vs / Ve
    gainDb: -99.0,         // 20·log10|H|  (théorique, filtre alimenté)
    gainDbMeas: null,      // gain MESURÉ à l'oscilloscope (null si sondes absentes)
    phaseRad: 0.0,         // déphasage vs/ve
    /* ce que voit réellement chaque voie de l'oscilloscope : rien n'est affiché
       tant que la sonde (pointe + masse) n'est pas raccordée au circuit.     */
    ch1: { vpp: 0, phase: 0, ok: false, why: 'Sonde CH1 non raccordée' },
    ch2: { vpp: 0, phase: 0, ok: false, why: 'Sonde CH2 non raccordée' },
    trig: { ok: false, offset: 0, src: 'CH1' },
    recordedTP2_RC: false, recordedTP2_CR: false, recordedTP2_Band: false,

    /* ---- TP 3 : drapeaux partagés avec l'affichage ---- */
    abShort: false,        // les points A et B sont reliés par un fil
    tp3Saturated: false,   // générateur CC en dépassement de tension de conformité
    rheoOver: false,       // rhéostat en surintensité (> 1,5 A)

    /* ---- Oscilloscope bicanal (réglages de l'appareil) ---- */
    osc: {
        timeDiv: 1e-4,      // base de temps (s/div)
        ch1VDiv: 1.0,       // sensibilité voie 1 (V/div)
        ch2VDiv: 1.0,       // sensibilité voie 2 (V/div)
        ch1Pos: 0,          // décalage vertical (divisions)
        ch2Pos: 0,
        triggerLevel: 0.0,  // niveau de déclenchement (V)
        triggerSrc: 'CH1',
        autoScale: false
    },

    /* ---- TP 3 : théorèmes électrocinétiques (fascicule p. 7–9, 16) ---- */
    tp3: {
        level: 1,                    // 1 … 5 (les cinq manipulations)
        /* données du fascicule */
        E1: 12, E2: 6,               // tensions des générateurs (V)
        R1: 290, R2: 180, RL: 150,   // résistances de la maquette (Ω)
        rheoMax: 230, rheoCur: 1.5,  // caractéristiques du rhéostat
        rheo: 0,                     // valeur réglée (Ω) — wiper ↔ borne A
        relE: 0.03, relR: 0.05,      // incertitudes relatives données
        /* état des appareils */
        on1: false, on2: false,      // les deux générateurs sont livrés ÉTEINTS
        cc1: false, cc2: false,      // mode courant (CC) au lieu de tension (CV)
        i1: 0.075, i2: 0.075,        // consigne de courant en mode CC (A)
        /* détections topologiques (remplies par le solveur) */
        Rin: false,                  // branche R en place entre A et B
        e1Short: false, e2Short: false,   // générateur remplacé par un court-circuit
        vAB: false, vR: false,       // voltmètre entre A/B ou aux bornes de R
        aAB: false, aSeries: false,  // ampèremètre entre A/B ou en série avec R
        theoLoop: false, nortonOk: false,
        /* grandeurs mesurées par l'élève (mémorisées à la validation) */
        meas: {
            V0: null, I0: null, VM: null, IR: null,
            I1: null, I2: null, Itot: null,
            RTh: null, ITh: null, RNo: null, INo: null
        },
        IRref: null,                 // courant dans R du circuit réel (référence M2)
        /* grandeurs lues / calculées par le solveur */
        topo: null, IR: 0, Irheo: 0, VAB: 0, IE1: 0, IE2: 0, VE1: 0, VE2: 0,
        theory: null, autoCC: null,
        /* cases du compte rendu renseignées par l'élève (feuille de relevés) */
        recV0: false, recI0: false, recVM: false, recSup: false, recTh: false, recNo: false
    }
};

/* ---------- registres 3D partagés ---------- */
export const terminals = {};           // id -> {group, ringMat, axis, label, owner}
export const allTermIds = [];
export const interactives = [];        // racines raycastables
export const draggables = [];          // {obj, label, termIds, baseOffset, yOff}
export const wires = [];               // {a, b, color, group}

/* ---------- contexte runtime (rempli par main.js) ---------- */
export const ctx = {
    scene: null, camera: null, renderer: null,
    yawObj: null, pitchObj: null,
    spot: null, dust: null,
    lights: null,          /* {hemi, spot, fills[], desk, lampMats[], expo0} */
    digitWins: [],         /* fenêtres des tambours chiffrés de la boîte à décades */
    meterSel: [],          /* sélecteurs rotatifs des multimètres (décor) */
    levelA: null, levelB: null,
    genGroup: null, genLCD: null, voltKnob: null, switchPivot: null, genLEDmat: null,
    voltPivot: null, ammPivot: null,       // aiguilles des appareils analogiques
    voltOL: null, ammOL: null,             // matériaux des voyants de surcharge
    voltSel: null, ammSel: null,           // sélecteurs de calibre (rotatifs)
    digitLCDs: [], dialKnobs: [],
    galvoPivot: null, paperObj: null, penObj: null,
    groupTP2: null, groupTP3: null, metersGroup: null,
    gbfLCD: null, oscCanvas: null, oscCtx: null, oscTexture: null,
    e1LCD: null, e2LCD: null, e1Knob: null, e2Knob: null,
    e1Pivot: null, e2Pivot: null, e1LED: null, e2LED: null,
    rheoKnob: null, rheoSlider: null, rheoLCD: null, tp3BoardTex: null,
    /* callbacks (évite les imports circulaires) */
    evaluate: () => { },
    toast: () => { },
    openPaper: () => { },
    sfx: null
};

/* ---------- palette de fils ---------- */
export const PALETTE = [
    ['Rouge',  0xd93a3a], ['Noir',   0x232733],
    ['Bleu',   0x2f7de1], ['Vert',   0x2fbf71],
    ['Jaune',  0xf2c14e], ['Blanc',  0xe8e8ee],
    ['Orange', 0xf97316], ['Violet', 0xa855f7]
];
export const wireColor = { current: 0xd93a3a };

/* ---------- identité du joueur local (multijoueur) ---------- */
export const ME = {
    solo: false,      /* mode solo : ni personnage, ni serveur, ni amis */
    id: null,
    name: 'Élève',
    color: '#22d3ee',
    online: false,
    transport: '—',
    room: '—'
};
