/* =====================================================================
   js/calculator.js  —  Moteur et interface de la Calculatrice Scientifique
   ===================================================================== */
import { ctx } from './state.js';
import { sfx } from './audio.js';

let isOpen = false;
let expr = '';
let isDegree = true; // Mode Degrés (DEG) par défaut pour l'élec
let memoryAns = 0;

export function isCalcOpen() {
    return isOpen;
}

export function openCalculator(open) {
    isOpen = (open !== undefined) ? open : !isOpen;
    const modal = document.getElementById('calcModal');
    if (!modal) return;

    modal.classList.toggle('hiddenx', !isOpen);

    if (isOpen) {
        if (document.exitPointerLock) document.exitPointerLock();
        updateDisplay();
    } else {
        if (ctx.player && ctx.player.isStarted && ctx.player.isStarted()) {
            // Reprendre le contrôle si aucune autre fenêtre n'est ouverte
            const cahier = document.getElementById('cahier');
            const chat = document.getElementById('chatbar');
            if ((!cahier || cahier.classList.contains('hiddenx')) &&
                (!chat || chat.classList.contains('hidden'))) {
                const dom = ctx.renderer ? ctx.renderer.domElement : document.body;
                dom.requestPointerLock();
            }
        }
    }
}

function updateDisplay(result = null, isError = false) {
    const elExpr = document.getElementById('calcExpr');
    const elRes = document.getElementById('calcResult');
    const elMode = document.getElementById('calcDegRad');

    if (elExpr) elExpr.textContent = expr || '0';
    if (elMode) elMode.textContent = isDegree ? 'DEG' : 'RAD';

    if (elRes) {
        if (isError) {
            elRes.textContent = 'Erreur Syntaxe';
            elRes.style.color = '#7f1d1d'; // Rouge foncé réaliste sur fond LCD
        } else if (result !== null) {
            elRes.textContent = formatCalcNumber(result);
            elRes.style.color = '#0a140a'; // Noir profond pur LCD (au lieu du bleu)
        } else {
            elRes.textContent = '';
        }
    }
}

function formatCalcNumber(n) {
    if (!Number.isFinite(n)) return 'Erreur';
    if (Math.abs(n) < 1e-12) return '0';
    if (Math.abs(n) >= 1e7 || (Math.abs(n) < 1e-4 && Math.abs(n) > 0)) {
        return n.toExponential(4).replace('e', ' · 10^');
    }
    return String(Math.round(n * 1e6) / 1e6).replace('.', ',');
}

export function calcInput(token) {
    sfx.click && sfx.click();

    switch (token) {
        case 'C':
            expr = '';
            updateDisplay(null);
            break;
        case 'DEL':
            expr = expr.slice(0, -1);
            updateDisplay(null);
            break;
        case 'MODE':
            isDegree = !isDegree;
            updateDisplay();
            break;
        case 'ANS':
            expr += memoryAns;
            updateDisplay();
            break;
        case '=':
            calculate();
            break;
        case 'sqrt':
            expr += 'sqrt(';
            updateDisplay();
            break;
        case 'sqr':
            expr += '^2';
            updateDisplay();
            break;
        case 'pow':
            expr += '^';
            updateDisplay();
            break;
        case 'inv':
            expr += '^(-1)';
            updateDisplay();
            break;
        case 'pi':
            expr += 'π';
            updateDisplay();
            break;
        case 'e':
            expr += 'e';
            updateDisplay();
            break;
        case 'log':
            expr += 'log(';
            updateDisplay();
            break;
        case 'ln':
            expr += 'ln(';
            updateDisplay();
            break;
        case 'sin':
        case 'cos':
        case 'tan':
            expr += token + '(';
            updateDisplay();
            break;
        default:
            expr += token;
            updateDisplay();
            break;
    }
}

function calculate() {
    if (!expr.trim()) return;
    try {
        let parsed = expr;

        // Remplacement des constantes
        parsed = parsed.replace(/π/g, `(${Math.PI})`);
        parsed = parsed.replace(/\be\b/g, `(${Math.E})`);

        // Puissance x^y -> x**y
        parsed = parsed.replace(/\^/g, '**');

        // Multiplications implicites (ex: 2π -> 2*π)
        parsed = parsed.replace(/(\d)(\()/g, '$1*$2');
        parsed = parsed.replace(/(\))(\d)/g, '$1*$2');

        // Fonctions trigonométriques avec prise en charge DEG / RAD
        const toRad = isDegree ? `*(Math.PI/180)` : '';
        parsed = parsed.replace(/\bsin\(([^)]+)\)/g, `Math.sin(($1)${toRad})`);
        parsed = parsed.replace(/\bcos\(([^)]+)\)/g, `Math.cos(($1)${toRad})`);
        parsed = parsed.replace(/\btan\(([^)]+)\)/g, `Math.tan(($1)${toRad})`);

        // Racine et Logarithmes
        parsed = parsed.replace(/\bsqrt\(([^)]+)\)/g, 'Math.sqrt($1)');
        parsed = parsed.replace(/\blog\(([^)]+)\)/g, 'Math.log10($1)');
        parsed = parsed.replace(/\bln\(([^)]+)\)/g, 'Math.log($1)');

        // Évaluation sécurisée
        // eslint-disable-next-line no-new-func
        const res = Function(`"use strict"; return (${parsed})`)();

        if (Number.isFinite(res)) {
            memoryAns = res;
            updateDisplay(res);
            sfx.ok && sfx.ok();
        } else {
            updateDisplay(null, true);
            sfx.err && sfx.err();
        }
    } catch (e) {
        updateDisplay(null, true);
        sfx.err && sfx.err();
    }
}

/** Initialisation des écouteurs du modal */
export function initCalculator() {
    const modal = document.getElementById('calcModal');
    if (!modal) return;

    modal.querySelectorAll('[data-val]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            calcInput(btn.dataset.val);
        });
    });

    const btnClose = document.getElementById('calcClose');
    if (btnClose) {
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            openCalculator(false);
        });
    }
}