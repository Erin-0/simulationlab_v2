/* =====================================================================
   js/textures.js  —  textures procédurales (canvas 2D) : sol, murs, bois,
                      tableau noir, affiche, panneaux d'appareils, écrans
                      LCD dynamiques et sprites texte (noms / bulles).
   ===================================================================== */
import * as THREE from 'three';
import { Q, allTextures, ctx } from './state.js';

export function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c, ctx: c.getContext('2d') };
}

export function toTex(c, rx = 1, ry = 1) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = Q.aniso;
    allTextures.push(t);
    return t;
}

/** Rectangle arrondi (chemin, sans remplissage). */
export function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* ------------------------------------------------------------------ */
/*  Décor de la pièce                                                  */
/* ------------------------------------------------------------------ */
export function floorTexture() {
    const { c, ctx } = makeCanvas(1024, 1024), n = 4, s = 1024 / n;
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = (14 + Math.random() * 10) | 0;
        ctx.fillStyle = `rgb(${v + 4},${v + 6},${v + 14})`;
        ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        const g = ctx.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
        g.addColorStop(0, 'rgba(255,255,255,.055)');
        g.addColorStop(.5, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(0,0,0,.22)');
        ctx.fillStyle = g; ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        for (let k = 0; k < 40; k++) {
            ctx.fillStyle = `rgba(255,255,255,${Math.random() * .03})`;
            ctx.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2);
        }
    }
    return toTex(c, 3, 3);
}

export function wallTexture() {
    const { c, ctx } = makeCanvas(1024, 512);
    ctx.fillStyle = '#21232d'; ctx.fillRect(0, 0, 1024, 512);
    for (let x = 0; x < 1024; x += 128) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, 0, 3, 512);
        const g = ctx.createLinearGradient(x, 0, x + 128, 0);
        g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x, 0, 128, 512);
    }
    for (let i = 0; i < 1800; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * .02})`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 472, 1024, 40);
    return toTex(c, 2, 1);
}

export function woodTexture(tint = '#5d4630') {
    const { c, ctx } = makeCanvas(1024, 512);
    ctx.fillStyle = tint; ctx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = `rgba(${(30 + Math.random() * 40) | 0},${(20 + Math.random() * 26) | 0},${(10 + Math.random() * 14) | 0},${.18 + Math.random() * .25})`;
        ctx.lineWidth = 1 + Math.random() * 3; ctx.beginPath();
        const y = Math.random() * 512; ctx.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x * .01 + i) * 6 + (Math.random() - .5) * 4);
        ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(255,240,210,.07)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
    return toTex(c, 1, 1);
}

export function chalkTexture() {
    const { c, ctx } = makeCanvas(1280, 640);
    ctx.fillStyle = '#1e2b26'; ctx.fillRect(0, 0, 1280, 640);
    for (let i = 0; i < 2200; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * .028})`;
        ctx.fillRect(Math.random() * 1280, Math.random() * 640, 2, 2);
    }
    ctx.strokeStyle = 'rgba(200,220,210,.08)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 1280, Math.random() * 640);
        ctx.lineTo(Math.random() * 1280, Math.random() * 640);
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(240,248,244,.92)'; ctx.textBaseline = 'middle';
    const F = (s) => `${s}px Caveat, cursive`;
    ctx.font = F(64); ctx.fillText('TP — Mesure de Résistances', 60, 80);
    ctx.strokeStyle = 'rgba(240,248,244,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(60, 125); ctx.lineTo(760, 122); ctx.stroke();
    ctx.font = F(46);
    ctx.fillText("Loi d'Ohm :  U = R · I", 80, 200);
    ctx.fillText('Montage amont :  R(mes) = R + rA  →  sur-estimation', 80, 280);
    ctx.fillText('Montage aval   :  R(mes) = R · rV / (R + rV)  →  sous-estimation', 80, 355);
    ctx.fillStyle = 'rgba(253,224,150,.95)';
    ctx.fillText('Pont de Wheatstone :  Rx = (R2 / R1) · Rv', 80, 465);
    ctx.fillText("Équilibre du pont  ⇔  Vg = 0", 80, 545);
    ctx.strokeStyle = 'rgba(240,248,244,.85)'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(1030, 170); ctx.lineTo(1180, 170); ctx.lineTo(1105, 300); ctx.closePath(); ctx.stroke();
    ctx.font = F(48); ctx.fillText('U', 1085, 215); ctx.fillText('R·I', 1060, 290);
    return toTex(c, 1, 1);
}

export function posterTexture() {
    const { c, ctx } = makeCanvas(340, 460);
    ctx.fillStyle = '#ece5d4'; ctx.fillRect(0, 0, 340, 460);
    ctx.strokeStyle = '#b3862d'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 320, 440);
    ctx.fillStyle = '#31405c'; ctx.textAlign = 'center';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    ctx.fillText('CONSIGNES', 170, 70); ctx.fillText('DE TP', 170, 108);
    ctx.font = '500 19px "Space Grotesk", sans-serif'; ctx.fillStyle = '#42506b';
    ['Vérifier le circuit', 'avant la mise sous tension', '',
     'Ne jamais court-circuiter', 'le générateur', '',
     'Équilibrer le pont', 'doucement, décade', 'par décade', '',
     'Consigner chaque mesure', 'sur la feuille de relevés'].forEach((t, i) => ctx.fillText(t, 170, 170 + i * 24));
    return toTex(c, 1, 1);
}

/* ------------------------------------------------------------------ */
/*  Feuille de relevés (bureau) — texture du papier ligné 3D           */
/* ------------------------------------------------------------------ */
export function paperTexture() {
    const { c, ctx } = makeCanvas(512, 660);
    ctx.fillStyle = '#f7f3e6'; ctx.fillRect(0, 0, 512, 660);
    /* fibres */
    for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = `rgba(120,110,90,${Math.random() * .05})`;
        ctx.fillRect(Math.random() * 512, Math.random() * 660, 2, 2);
    }
    /* lignes */
    ctx.strokeStyle = 'rgba(90,140,190,.35)'; ctx.lineWidth = 1.6;
    for (let y = 128; y < 640; y += 30) {
        ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(488, y); ctx.stroke();
    }
    /* marge rouge */
    ctx.strokeStyle = 'rgba(200,70,70,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(64, 16); ctx.lineTo(64, 644); ctx.stroke();
    /* titre manuscrit */
    ctx.fillStyle = '#2b3350'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 44px Caveat, cursive';
    ctx.fillText('Relevés de laboratoire', 84, 78);
    ctx.strokeStyle = 'rgba(43,51,80,.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(84, 90); ctx.lineTo(440, 88); ctx.stroke();
    ctx.font = '500 26px Caveat, cursive'; ctx.fillStyle = '#5a6480';
    ctx.fillText('TP · Mesure de résistances', 84, 118);
    /* petit tableau déjà tracé, à remplir à la main */
    ctx.strokeStyle = 'rgba(43,51,80,.35)'; ctx.lineWidth = 1.6;
    const cols = [84, 150, 236, 306, 376, 446];
    for (let r = 0; r < 12; r++) {
        const y = 170 + r * 34;
        ctx.beginPath(); ctx.moveTo(78, y); ctx.lineTo(470, y); ctx.stroke();
    }
    cols.forEach(x => { ctx.beginPath(); ctx.moveTo(x, 170); ctx.lineTo(x, 578); ctx.stroke(); });
    ctx.font = '600 22px Caveat, cursive'; ctx.fillStyle = '#39415e';
    ['n°', 'U (V)', 'I (mA)', 'R (Ω)', 'montage'].forEach((t, i) => ctx.fillText(t, cols[i] + 6, 164));
    /* stylo-griffonnage décoratif */
    ctx.font = '500 24px Caveat, cursive'; ctx.fillStyle = 'rgba(90,100,128,.55)';
    ctx.fillText('… à compléter au stylo noir', 84, 616);
    return toTex(c, 1, 1);
}

/* ------------------------------------------------------------------ */
/*  Bandeau de résistance (code couleur 100 Ω ±5 %)                    */
/* ------------------------------------------------------------------ */
export function resistorBandTexture() {
    const { c, ctx } = makeCanvas(256, 64);
    ctx.fillStyle = '#d9c49a'; ctx.fillRect(0, 0, 256, 64);
    [[60, '#6b4226'], [95, '#1a1a1a'], [130, '#6b4226'], [205, '#c9a227']]
        .forEach(([x, col]) => { ctx.fillStyle = col; ctx.fillRect(x, 0, 18, 64); });
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,.35)');
    g.addColorStop(.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.3)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 64);
    return toTex(c, 1, 1);
}

/* ------------------------------------------------------------------ */
/*  Panneau d'appareil statique + écran LCD dynamique                  */
/* ------------------------------------------------------------------ */
/**
 * Panneau sérigraphié (face avant d'appareil, plaque de garde, carte de TP).
 * La sérigraphie reçoit une très légère auto-luminescence (`silk`) : comme sur
 * du matériel réel, les légendes restent lisibles même quand l'appareil est
 * dans l'ombre ou quand la pièce est peu éclairée.  Ces matériaux sont
 * enregistrés dans ctx.lights.panelMats pour que le réglage d'éclairage les
 * pilote (js/lighting.js).
 */
export function panelPlane(w, h, pw, ph, drawFn, silk = .26) {
    const { c, ctx: c2 } = makeCanvas(pw, ph);
    drawFn(c2, pw, ph);
    const tex = toTex(c, 1, 1);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: .62, metalness: .04,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: silk
    });
    mat.userData.silk = silk;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    if (ctx.lights && ctx.lights.panelMats) ctx.lights.panelMats.push(mat);
    return { mesh: m, canvas: c, ctx: c2, tex };
}

/* =====================================================================
   AIDES « MAQUETTE DE LABORATOIRE » (cartes de TP)

   Une vraie carte de TP est un PANNEAU PLAT : pas de composants en
   relief, uniquement des points de connexion (douilles banane) et la
   sérigraphie du schéma.  Les symboles sont donc DESSINÉS, et le dessin
   est calculé avec les MÊMES cotes que les douilles posées en 3D : le
   cercle sérigraphié tombe exactement sous la douille.

   Repère : la carte est un plan tourné de −π/2 autour de X, donc
     • canvas +x  ↔  monde +x   (vers la droite de l'élève)
     • canvas +y  ↔  monde +z   (vers l'élève) : le bord LOINTAIN de la
       carte (z < 0) est le HAUT du dessin → le schéma se lit à l'endroit.
   ===================================================================== */

export const SILK = {
    ink: '#23262c',        // encre principale
    soft: '#6a7080',       // encre secondaire
    copper: '#a4813c',     // barrettes / pistes
    laminate: '#e9e5d9'    // stratifié clair des maquettes
};

/** Conversion cotes carte (m, origine au centre) → pixels sérigraphie. */
export function boardMapper(Wprint, Dprint, Wp, Hp) {
    return {
        px: (x) => (x / Wprint + .5) * Wp,
        py: (z) => (z / Dprint + .5) * Hp,
        sx: (m) => m * Wp / Wprint,          // une longueur en m → px
        sy: (m) => m * Hp / Dprint
    };
}

/** Fond stratifié clair + grain discret + cadre, comme une vraie maquette. */
export function silkPanel(c2, Wp, Hp, tint = SILK.laminate) {
    c2.fillStyle = tint; c2.fillRect(0, 0, Wp, Hp);
    c2.strokeStyle = 'rgba(60,60,55,.06)'; c2.lineWidth = 1;
    for (let y = 5; y < Hp; y += 8) { c2.beginPath(); c2.moveTo(0, y); c2.lineTo(Wp, y); c2.stroke(); }
    c2.strokeStyle = 'rgba(35,38,44,.5)'; c2.lineWidth = 5;
    c2.strokeRect(3, 3, Wp - 6, Hp - 6);
}

/** Douille banane 4 mm vue de dessus : anneau couleur + trou central. */
export function silkSocket(c2, px, py, color, r = 20) {
    c2.beginPath(); c2.arc(px, py, r + 5, 0, 7);
    c2.fillStyle = 'rgba(35,38,44,.16)'; c2.fill();
    c2.beginPath(); c2.arc(px, py, r, 0, 7);
    c2.fillStyle = color; c2.fill();
    c2.lineWidth = 3; c2.strokeStyle = 'rgba(35,38,44,.7)'; c2.stroke();
    c2.beginPath(); c2.arc(px, py, r * .36, 0, 7);
    c2.fillStyle = '#15171c'; c2.fill();
}

/** Texte sérigraphié, avec halo clair pour rester lisible sur une piste. */
export function silkText(c2, txt, px, py, opt = {}) {
    c2.font = opt.font || '700 22px "Space Grotesk",sans-serif';
    c2.textAlign = opt.align || 'center';
    c2.textBaseline = opt.baseline || 'middle';
    if (opt.halo !== false) {
        c2.lineWidth = opt.haloWidth || 5;
        c2.strokeStyle = opt.haloColor || 'rgba(238,235,224,.92)';
        c2.strokeText(txt, px, py);
    }
    c2.fillStyle = opt.color || SILK.ink;
    c2.fillText(txt, px, py);
}

/** Piste / fil sérigraphié entre deux points. */
export function silkWire(c2, x1, y1, x2, y2, opt = {}) {
    c2.save();
    c2.strokeStyle = opt.color || SILK.ink;
    c2.lineWidth = opt.lw || 5;
    c2.lineCap = 'round';
    if (opt.dash) c2.setLineDash(opt.dash);
    c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke();
    c2.restore();
}

/**
 * Symbole normalisé d'un dipôle entre deux points (orientation quelconque).
 * @param {'R'|'C'|'L'} kind  rectangle (résistance), deux plaques (condensateur)
 */
export function silkDipole(c2, x1, y1, x2, y2, kind = 'R', opt = {}) {
    const dx = x2 - x1, dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx);
    const body = opt.body !== undefined ? opt.body : L * .52;
    const w = opt.width || 26, lw = opt.lw || 5;
    c2.save();
    c2.translate(x1, y1); c2.rotate(a);
    c2.strokeStyle = opt.ink || SILK.ink; c2.lineWidth = lw; c2.lineCap = 'round';
    c2.beginPath(); c2.moveTo(0, 0); c2.lineTo((L - body) / 2, 0); c2.stroke();
    c2.beginPath(); c2.moveTo((L + body) / 2, 0); c2.lineTo(L, 0); c2.stroke();
    if (kind === 'C') {
        c2.strokeStyle = opt.ink || '#1f5f8b'; c2.lineWidth = lw + 2;
        c2.beginPath(); c2.moveTo(L / 2 - 5, -w / 2); c2.lineTo(L / 2 - 5, w / 2); c2.stroke();
        c2.beginPath(); c2.moveTo(L / 2 + 5, -w / 2); c2.lineTo(L / 2 + 5, w / 2); c2.stroke();
    } else {
        c2.fillStyle = opt.fill || '#f7f4ec';
        c2.strokeStyle = opt.ink || '#8c3a12';
        c2.lineWidth = lw;
        c2.beginPath(); c2.rect((L - body) / 2, -w / 2, body, w); c2.fill(); c2.stroke();
    }
    c2.restore();
}

/** Symbole normalisé d'un générateur de tension continue (E). */
export function silkGenerator(c2, px, py, opt = {}) {
    const r = opt.r || 17;
    c2.save();
    c2.strokeStyle = opt.ink || SILK.ink; c2.lineWidth = opt.lw || 4;
    c2.beginPath(); c2.arc(px, py, r, 0, 7); c2.stroke();
    /* trait long = +, trait court = − */
    c2.beginPath(); c2.moveTo(px - r * .55, py - r * .3); c2.lineTo(px + r * .55, py - r * .3); c2.stroke();
    c2.lineWidth = (opt.lw || 4) * .7;
    c2.beginPath(); c2.moveTo(px - r * .28, py + r * .35); c2.lineTo(px + r * .28, py + r * .35); c2.stroke();
    c2.restore();
}

/** Matériau du panneau stratifié des maquettes (clair, mat, sans reflet). */
export function laminateMat(tint = 0xe9e5d9) {
    return new THREE.MeshStandardMaterial({ color: tint, roughness: .8, metalness: .02 });
}

export function makeLCD(pxW, pxH) {
    const { c, ctx } = makeCanvas(pxW, pxH);
    const tex = toTex(c, 1, 1);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { c, ctx, tex };
}

/** Texture « molette crantée » : cannelures radiales d'un vrai bouton de réglage. */
export function knurlTexture(base = '#3a4152', groove = '#202634') {
    const { c, ctx } = makeCanvas(256, 64);
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 64);
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 32; i++) {
        ctx.fillStyle = (i % 2) ? groove : 'rgba(255,255,255,.07)';
        ctx.fillRect(i * 8, 0, 4, 64);
    }
    return toTex(c, 1, 1);
}

export function drawLCD(lcd, main, sub = '', color = '#7dffd8') {
    const { ctx, tex } = lcd, W = ctx.canvas.width, H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#02100c'); g.addColorStop(1, '#052019');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(125,255,216,.14)'; ctx.lineWidth = 2;
    for (let y = 8; y < H; y += 9) { ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(W - 6, y); ctx.stroke(); }
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.font = `700 ${(H * .5) | 0}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(main, W - 12, H * .56);
    if (sub) {
        ctx.shadowBlur = 6;
        ctx.font = `600 ${(H * .2) | 0}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(160,255,225,.75)';
        ctx.fillText(sub, 12, H * .24);
    }
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/*  Sprites texte : plaque de nom + bulle de chat (multijoueur)        */
/* ------------------------------------------------------------------ */
function roundRectPath(ctx, x, y, w, h, r) { rr(ctx, x, y, w, h, r); }

export function makeNameSprite(text, bg = 'rgba(8,14,22,.82)', fg = '#dff6ff', accent = '#22d3ee') {
    const pad = 22, fs = 40;
    const { c: meas } = makeCanvas(8, 8);
    const mctx = meas.getContext('2d');
    mctx.font = `700 ${fs}px "Space Grotesk", sans-serif`;
    const tw = Math.ceil(mctx.measureText(text).width);
    const W = tw + pad * 2 + 16, H = fs + pad;
    const { c, ctx } = makeCanvas(W, H);
    ctx.font = `700 ${fs}px "Space Grotesk", sans-serif`;
    ctx.textBaseline = 'middle';
    roundRectPath(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(pad * .6, H / 2, 6, 0, 7); ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(text, pad + 10, H / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const k = 0.0026;
    spr.scale.set(W * k, H * k, 1);
    spr.renderOrder = 12;
    return spr;
}

/** Bulle de dialogue façon « Roblox » : texte manuscrit sur papier + queue. */
export function makeBubbleSprite(text, maxChars = 34) {
    const fs = 40, lh = 50, pad = 24;
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    const { c: meas } = makeCanvas(8, 8);
    const mctx = meas.getContext('2d');
    mctx.font = `600 ${fs}px Caveat, cursive`;
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (mctx.measureText(test).width > maxChars * fs * .5 || test.length > maxChars) {
            if (cur) lines.push(cur);
            cur = w.length > maxChars ? w.slice(0, maxChars) : w;
        } else cur = test;
    }
    if (cur) lines.push(cur);
    const widest = lines.reduce((m, l) => Math.max(m, mctx.measureText(l).width), 40);
    const W = Math.ceil(widest) + pad * 2, H = lines.length * lh + pad * 1.2, tail = 26;
    const { c, ctx } = makeCanvas(W, H + tail);
    ctx.font = `600 ${fs}px Caveat, cursive`;
    /* ombre portée douce */
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    roundRectPath(ctx, 4, 4, W - 8, H - 8, 22);
    ctx.fillStyle = '#fbf7ea'; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    /* queue */
    ctx.beginPath();
    ctx.moveTo(W * .5 - 20, H - 6); ctx.lineTo(W * .5 + 4, H + tail - 4); ctx.lineTo(W * .5 + 20, H - 6);
    ctx.closePath(); ctx.fillStyle = '#fbf7ea'; ctx.fill();
    /* liseré */
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(60,70,100,.5)';
    roundRectPath(ctx, 4, 4, W - 8, H - 8, 22); ctx.stroke();
    /* texte */
    ctx.fillStyle = '#2c3450'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, pad, pad * .7 + i * lh + lh / 2));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const k = 0.0022;
    spr.scale.set(W * k, (H + tail) * k, 1);
    spr.renderOrder = 13;
    return spr;
}
