/* =====================================================================
   js/lighting.js  —  réglages d'ÉCLAIRAGE de la pièce.

   Un seul petit bouton (icône « soleil ») dans la barre Qualité : il
   ouvre un volet discret avec 4 ambiances + un curseur d'intensité.
   Rien d'autre n'est ajouté à l'écran, le HUD reste épuré.

   Les valeurs de base viennent de environment.js (ctx.lights) ; les
   presets les multiplient, et le curseur ajuste l'ensemble.
   ===================================================================== */
import { LPRESETS, L, ctx } from './state.js';

const KEY = 'labo3d_light';

/** Applique preset + curseur à toutes les lumières de la scène. */
export function applyLighting(quiet = false) {
    const p = LPRESETS[L.preset] || LPRESETS.lab;
    const b = Math.max(.7, Math.min(1.5, L.slider || 1));
    const li = ctx.lights;
    if (li) li.spotBase = p.spot * b;

    if (ctx.renderer) ctx.renderer.toneMappingExposure = p.expo * b;

    if (li) {
        if (li.hemi) li.hemi.intensity = p.hemi * b;
        if (li.spot) { li.spot.intensity = p.spot * b; li.spotBase = p.spot * b; }
        /* lumière de façade : c'est elle qui rend les appareils lisibles */
        if (li.panel) li.panel.intensity = (li.panel.userData.base || 5.5) * (p.panel ?? 1) * b;
        if (li.desk) li.desk.intensity = (li.desk.userData.base || 3.4) * p.desk * b;
        (li.fills || []).forEach((f) => {
            /* intensités d'origine conservées dans f.userData.base */
            f.intensity = (f.userData.base || 5) * p.fill * b;
        });
        /* sérigraphies des faces avant : auto-luminescence adaptée à l'ambiance */
        (li.panelMats || []).forEach((m) => {
            m.emissiveIntensity = (m.userData.silk ?? .26) * (p.silk ?? 1) * b;
        });
        /* brume : plus la salle est éclairée, plus l'air est transparent */
        if (li.fogBase === undefined && ctx.scene && ctx.scene.fog) li.fogBase = ctx.scene.fog.density;
        if (ctx.scene && ctx.scene.fog && li.fogBase !== undefined) {
            ctx.scene.fog.density = li.fogBase * Math.max(.3, 2.05 - b);
        }
        /* néons du plafond : leur « brillance » suit l'ambiance choisie */
        (li.lampMats || []).forEach(m => {
            m.emissiveIntensity = p.lamp * b;
            m.color.setScalar(Math.min(1, .55 + p.lamp * b * .12));
        });
    }

    document.querySelectorAll('.lbtn').forEach(x => x.classList.toggle('sel', x.dataset.l === L.preset));
    const sl = document.getElementById('lightRange');
    if (sl && +sl.value !== Math.round(b * 100)) sl.value = String(Math.round(b * 100));
    const pct = document.getElementById('lightPct');
    if (pct) pct.textContent = Math.round(b * 100) + ' %';

    try { localStorage.setItem(KEY, JSON.stringify({ p: L.preset, s: L.slider })); } catch (e) { }
    if (!quiet && ctx.toast) ctx.toast(`Éclairage : ${p.label} (${Math.round(b * 100)} %)`, 'info');
}

/** Relit le choix mémorisé (sinon : « Atelier », 100 %). */
export function savedLighting() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const o = JSON.parse(raw);
            if (o && LPRESETS[o.p]) L.preset = o.p;
            if (o && Number.isFinite(+o.s)) L.slider = Math.max(.7, Math.min(1.5, +o.s));
        }
    } catch (e) { /* stockage indisponible */ }
    return L;
}

/** Bascule l'affichage du volet « éclairage ». */
export function toggleLightPanel(force) {
    const el = document.getElementById('lightPop');
    if (!el) return false;
    const open = (force === undefined) ? el.classList.contains('hidden') : !!force;
    el.classList.toggle('hidden', !open);
    const btn = document.getElementById('btnLight');
    if (btn) btn.classList.toggle('sel', open);
    return open;
}

/** Câble le bouton, les 4 ambiances et le curseur. */
export function bindLighting(sfxClick) {
    const btn = document.getElementById('btnLight');
    if (btn) btn.onclick = (e) => {
        e.stopPropagation();
        sfxClick && sfxClick();
        toggleLightPanel();
    };
    document.querySelectorAll('.lbtn').forEach(b => {
        b.onclick = (e) => {
            e.stopPropagation();
            L.preset = b.dataset.l;
            sfxClick && sfxClick();
            applyLighting(false);
        };
    });
    const sl = document.getElementById('lightRange');
    if (sl) {
        sl.addEventListener('input', () => { L.slider = (+sl.value || 100) / 100; applyLighting(true); });
        sl.addEventListener('change', () => { sfxClick && sfxClick(); applyLighting(false); });
    }
    /* un clic ailleurs referme le volet (l'écran reste dégagé) */
    document.addEventListener('click', (e) => {
        const pop = document.getElementById('lightPop');
        if (!pop || pop.classList.contains('hidden')) return;
        if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
        toggleLightPanel(false);
    });
}
