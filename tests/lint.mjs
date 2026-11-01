/* =====================================================================
   tests/lint.mjs — analyse statique des modules js/ avec acorn.
   Détecte : identifiants utilisés mais jamais déclarés/importés
   (ReferenceError en puissance), imports morts, exports manquants.
   Usage : node tests/lint.mjs
   ===================================================================== */
import { parse } from '/tmp/jslibs/acorn.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'js');

const GLOBALS = new Set(`globalThis window document self top parent frames console navigator location history screen localStorage sessionStorage performance crypto devicePixelRatio innerWidth innerHeight outerWidth outerHeight scrollX scrollY pageXOffset pageYOffset visualViewport isSecureContext origin
Math JSON Number String Boolean Object Array Date RegExp Error TypeError RangeError SyntaxError ReferenceError Symbol Promise Map Set WeakMap WeakSet Proxy Reflect Function Intl BigInt ArrayBuffer DataView SharedArrayBuffer
Float32Array Float64Array Int8Array Int16Array Int32Array Uint8Array Uint16Array Uint32Array Uint8ClampedArray BigInt64Array BigUint64Array
parseInt parseFloat isNaN isFinite decodeURI encodeURI decodeURIComponent encodeURIComponent undefined NaN Infinity
fetch URL URLSearchParams Blob File FileReader FormData Headers Request Response TextEncoder TextDecoder AbortController AbortSignal structuredClone queueMicrotask atob btoa
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame addEventListener removeEventListener dispatchEvent getComputedStyle alert confirm prompt open close print postMessage
WebSocket Worker SharedWorker EventSource Image Audio AudioContext webkitAudioContext OfflineAudioContext OscillatorNode GainNode AudioBufferSourceNode AnalyserNode BiquadFilterNode DynamicsCompressorNode WaveShaperNode StereoPannerNode ConvolverNode DelayNode ChannelMergerNode ChannelSplitterNode MediaElementAudioSourceNode PeriodicWave
Event CustomEvent MouseEvent KeyboardEvent PointerEvent WheelEvent InputEvent FocusEvent AnimationEvent TransitionEvent ProgressEvent ErrorEvent MessageEvent StorageEvent PopStateEvent HashChangeEvent BeforeUnloadEvent DragEvent TouchEvent DeviceMotionEvent DeviceOrientationEvent
Path2D ImageData ImageBitmap DOMParser XMLSerializer DOMMatrix CanvasGradient CanvasPattern TextMetrics OffscreenCanvas createImageBitmap
HTMLElement HTMLCanvasElement HTMLImageElement HTMLInputElement HTMLVideoElement HTMLAudioElement Node Element SVGElement ResizeObserver IntersectionObserver MutationObserver PerformanceObserver
require module exports process Buffer global __dirname __filename lucide THREE`.split(/\s+/).filter(Boolean));

/* ---- parcours générique ---- */
function walk(node, visit, parent = null, key = null) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent, key);
    for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach(c => walk(c, visit, node, k));
        else if (v && typeof v.type === 'string') walk(v, visit, node, k);
    }
}

function collectPatternIds(pat, out) {
    if (!pat) return;
    switch (pat.type) {
        case 'Identifier': out.add(pat.name); break;
        case 'ObjectPattern': pat.properties.forEach(p => collectPatternIds(p.type === 'RestElement' ? p.argument : p.value, out)); break;
        case 'ArrayPattern': pat.elements.forEach(e => collectPatternIds(e, out)); break;
        case 'RestElement': collectPatternIds(pat.argument, out); break;
        case 'AssignmentPattern': collectPatternIds(pat.left, out); break;
        case 'Property': collectPatternIds(pat.value, out); break;
    }
}

const results = [];
let problems = 0;

for (const file of readdirSync(DIR).filter(f => f.endsWith('.js')).sort()) {
    const path = join(DIR, file);
    const src = readFileSync(path, 'utf8');
    let ast;
    try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
    catch (e) { console.log(`✗ ${file} : ERREUR DE SYNTAXE — ${e.message}`); problems++; continue; }

    const declared = new Set();
    const imported = new Map();          // name -> source
    const exportedNames = new Set();
    const importSources = [];

    walk(ast, (n, p, key) => {
        switch (n.type) {
            case 'ImportDeclaration':
                importSources.push(n.source.value);
                n.specifiers.forEach(s => { declared.add(s.local.name); imported.set(s.local.name, n.source.value); });
                break;
            case 'VariableDeclarator': collectPatternIds(n.id, declared); break;
            case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
                if (n.id) declared.add(n.id.name);
                (n.params || []).forEach(pp => collectPatternIds(pp, declared));
                break;
            case 'ClassDeclaration': case 'ClassExpression':
                if (n.id) declared.add(n.id.name);
                break;
            case 'ClassExpression': if (n.id) declared.add(n.id.name); break;
            case 'CatchClause': collectPatternIds(n.param, declared); break;
            case 'ExportNamedDeclaration':
                if (n.declaration) { /* déclaré ci-dessus */ }
                (n.specifiers || []).forEach(s => exportedNames.add(s.exported.name));
                break;
            case 'ExportDefaultDeclaration': exportedNames.add('default'); break;
            case 'ExportAllDeclaration': exportedNames.add('*' + n.source.value); break;
        }
    });
    /* for-of / for-in : la variable de boucle est une déclaration */
    walk(ast, n => { if (n.type === 'ForOfStatement' || n.type === 'ForInStatement') collectPatternIds(n.left, declared); });

    /* ---- références ---- */
    const undef = new Map();
    walk(ast, (n, p, key) => {
        if (n.type !== 'Identifier') return;
        if (p && p.type === 'MemberExpression' && key === 'property' && !p.computed) return;
        if (p && p.type === 'Property' && key === 'key' && !p.computed) return;
        if (p && p.type === 'MethodDefinition' && key === 'key' && !p.computed) return;
        if (p && (p.type === 'ImportSpecifier' || p.type === 'ImportDefaultSpecifier' || p.type === 'ImportNamespaceSpecifier')) return;
        if (p && (p.type === 'ExportSpecifier')) return;
        if (p && p.type === 'LabeledStatement' && key === 'label') return;
        if (p && p.type === 'BreakStatement') return;
        const name = n.name;
        if (declared.has(name) || GLOBALS.has(name)) return;
        if (!undef.has(name)) undef.set(name, n.loc ? n.loc.start.line : 0);
    });

    /* ---- imports non utilisés ---- */
    const usedNames = new Set();
    walk(ast, (n, p, key) => {
        if (n.type !== 'Identifier') return;
        if (p && p.type === 'MemberExpression' && key === 'property' && !p.computed) return;
        if (p && p.type === 'Property' && key === 'key' && !p.computed) return;
        usedNames.add(n.name);
    });
    const deadImports = [...imported.entries()].filter(([k]) => !usedNames.has(k)).map(([k, v]) => `${k} (de ${v})`);

    if (undef.size || deadImports.length) {
        results.push({ file, undef: [...undef.entries()], deadImports });
        problems += undef.size;
    }
}

/* ---- exports/imports croisés entre modules ---- */
const exportMap = new Map();
for (const file of readdirSync(DIR).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(join(DIR, file), 'utf8');
    let ast; try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); }
    catch (e) { continue; }
    const names = new Set();
    walk(ast, n => {
        if (n.type === 'ExportNamedDeclaration') {
            (n.specifiers || []).forEach(s => names.add(s.exported.name));
            if (n.declaration) {
                if (n.declaration.type === 'VariableDeclaration') n.declaration.declarations.forEach(d => collectPatternIds(d.id, names));
                else if (n.declaration.id) names.add(n.declaration.id.name);
            }
        }
        if (n.type === 'ExportDefaultDeclaration') names.add('default');
    });
    exportMap.set('./' + file, names);
}
const broken = [];
for (const file of readdirSync(DIR).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(join(DIR, file), 'utf8');
    let ast; try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); }
    catch (e) { continue; }
    walk(ast, n => {
        if (n.type !== 'ImportDeclaration') return;
        const spec = n.source.value;
        if (!spec.startsWith('.')) return;
        const avail = exportMap.get(spec);
        if (!avail) { broken.push(`${file} : module introuvable ${spec}`); return; }
        n.specifiers.forEach(s => {
            if (s.type === 'ImportNamespaceSpecifier' || s.type === 'ImportDefaultSpecifier') return;
            if (!avail.has(s.imported.name)) broken.push(`${file} : « ${s.imported.name} » n'est pas exporté par ${spec}`);
        });
    });
}

for (const r of results) {
    console.log(`\n${r.file}`);
    if (r.undef.length) console.log('  NON DÉCLARÉ  : ' + r.undef.map(([k, l]) => `${k} (l.${l})`).join(', '));
    if (r.deadImports.length) console.log('  IMPORT MORT  : ' + r.deadImports.join(', '));
}
if (broken.length) { console.log('\nImports/exports cassés :'); broken.forEach(b => console.log('  ✗ ' + b)); }
const n = problems + broken.length;
console.log(n ? `\n✗ ${n} problème(s) détecté(s)` : '\n✓ lint : aucun identifiant non déclaré, aucun import/export cassé');
process.exit(n ? 1 : 0);
