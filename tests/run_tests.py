#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
 LaboPhysique 3D — batterie de tests « headless » (sans navigateur)
================================================================================
 Vérifie, sans ouvrir de navigateur :
   1. test_circuit.mjs : le solveur (loi d'Ohm, amont/aval, court-circuit,
      surcharge, pont de Wheatstone, générateur éteint) — 30 assertions ;
   2. test_env.mjs     : la géométrie des surfaces d'appui (table ronde,
      bureau tourné, sol) — 7 assertions ;
   3. test_scene.mjs   : graphe de scène et disposition du poste de travail
      (appareils en couronne face au centre, carte du pont à plat, bureau à
      droite, générateur éteint) ;
   4. test_boot.mjs    : le VRAI js/main.js s'exécute de bout en bout sur un
      DOM/Three.js factice (registres des trois TP, feuille de relevés
      manuelle, mode solo imposé, déplacement d'un appareil sans chute,
      évaluation du circuit, bascule vers le TP 3) ;
   5. test_ac_solver.mjs   : calculs harmoniques du TP 2 (fréquences de
      coupure, gains et phases des filtres RC, CR et RC-CR, courbe de Bode) ;
   6. test_oscilloscope.mjs: rendu de l'écran bicanal — et surtout : SONDES
      EN L'AIR ⇒ aucun signal affiché (le défaut signalé doit rester corrigé) ;
   7. test_tp2_probes.mjs  : le TP 2 câblé de bout en bout (GBF, maquette,
      oscilloscope) — ce que chaque voie mesure VRAIMENT selon le câblage ;
   8. test_tp3_solver.mjs  : le TP 3 complet — solveur continu (MNA), valeurs
      théoriques, les CINQ manipulations rejouées avec les vrais boutons,
      garde-fous physiques (court-circuit, surcharge, conformité, rhéostat)
      et table 9 du compte rendu.

 Prérequis : Node.js (18+). Aucune dépendance npm à installer : le module
 `three` est remplacé par un stub minimal situé dans tests/three-stub.

 USAGE
 -----
     python3 tests/run_tests.py
     (ou :  node tests/test_circuit.mjs   après avoir copié le stub,
      mais le script Python s'occupe de tout)
================================================================================
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # …/labo3d/tests
ROOT = HERE.parent                              # …/labo3d
STUB_SRC = HERE / "three-stub" / "three"
STUB_DST = ROOT / "node_modules" / "three"      # là où Node le trouvera depuis js/
TESTS = ["test_circuit.mjs", "test_env.mjs", "test_scene.mjs", "test_boot.mjs",
         "test_ac_solver.mjs", "test_oscilloscope.mjs", "test_tp2_probes.mjs",
         "test_tp3_solver.mjs"]


def install_stub() -> None:
    """Installe le faux module `three` là où Node ira le chercher."""
    if STUB_DST.exists():
        shutil.rmtree(STUB_DST)
    STUB_DST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(STUB_SRC, STUB_DST)


def cleanup() -> None:
    nm = ROOT / "node_modules"
    if nm.exists():
        shutil.rmtree(nm, ignore_errors=True)


def main() -> int:
    if shutil.which("node") is None:
        print("[ERREUR] Node.js est introuvable : installez-le pour lancer les tests.")
        return 2

    install_stub()
    total_ok = total_ko = 0
    failed_files = []
    try:
        for name in TESTS:
            path = HERE / name
            print("\n" + "=" * 74)
            print(f"  {name}")
            print("=" * 74)
            proc = subprocess.run(
                ["node", "--no-warnings", str(path)],
                cwd=str(HERE), capture_output=True, text=True, timeout=180
            )
            out = proc.stdout
            err = "\n".join(l for l in proc.stderr.splitlines()
                            if "Warning" not in l and "trace-warnings" not in l)
            print(out.rstrip())
            if err.strip():
                print("[stderr]", err.strip())
            m = re.search(r"(\d+) réussi\(s\), (\d+) échec\(s\)", out)
            if m:
                total_ok += int(m.group(1))
                total_ko += int(m.group(2))
            if proc.returncode != 0:
                failed_files.append(name)
    except subprocess.TimeoutExpired:
        print("[ERREUR] un test a dépassé le temps imparti")
        failed_files.append("timeout")
    finally:
        cleanup()

    print("\n" + "=" * 74)
    print(f"  TOTAL : {total_ok} assertion(s) validée(s), {total_ko} échec(s)")
    if failed_files:
        print(f"  Fichiers en échec : {', '.join(failed_files)}")
    else:
        print("  Tous les tests passent ✓")
    print("=" * 74)
    return 1 if (failed_files or total_ko) else 0


if __name__ == "__main__":
    sys.exit(main())
