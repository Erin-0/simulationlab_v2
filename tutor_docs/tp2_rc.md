# TP 2 — Filtre RC (passe-bas) : réponse fréquentielle

## Objectif (fascicule p. 10-14, tables 7-8)
Relever la réponse en fréquence du passe-bas RC : gain G = Vs/Ve en dB et
déphasage φ, de 10 Hz à 100 kHz ; trouver la fréquence de coupure fc où
G = −3 dB et φ = −45° ; comparer à la théorie fc = 1/(2π·R1·C1) (SYMBOLIQUE :
ne jamais calculer fc à la place de l'étudiant).

## Banc
- GBF (sortie 50 Ω, sinusoïde) : fréquence affichée, amplitude AVEUGLE.
- Maquette plate « PASSE-BAS RC » : R1 = 2,2 kΩ en série, C1 = 22 nF en
  dérivation ; bornes IN+, IN−, OUT+, OUT− ; rail de masse interne.
- Oscilloscope bic anal : CH1 sur l'entrée (Ue), CH2 sur la sortie (Us).
  Sondes : pointe + masse ; les masses CH1/CH2 sont COMMUNES au scope.

## Câblage obligatoire pour mesurer
- GBF+ → IN+ ; GBF− → IN− (le filtre n'est alimenté que si ces deux fils sont
  posés — sinon « AUCUNE SONDE / signal non raccordé »).
- Sonde CH1 : pointe → IN+, masse → IN− ; sonde CH2 : pointe → OUT+, masse →
  OUT− (ou la masse commune du rail).

## Méthode de relevé (fascicule p. 2 et 14)
1. Régler f au GBF ; caler V/DIV et TIME/DIV pour lire proprement.
2. Ue = N div(CH1) × V/DIV1 ; Us = N div(CH2) × V/DIV2 (crête à crête).
3. G(dB) = 20·log10(Us/Ue) ; φ via Δx entre traces : φ = Δx/T × 360°.
4. « Recopier mesure » reporte f, Ue, Us, G, φ sur la feuille ; le graphe de
   Bode de la feuille trace UNIQUEMENT les points de l'élève.
5. fc : balayer f jusqu'à ce que G ≈ −3 dB (le relevé le dira), vérifier φ ≈ −45°.

## Pièges
- Une seule sonde branchée : pas de comparaison possible (φ impossible).
- Masse de sonde en l'air : voie muette (« sonde non raccordée »).
- Oublier que Ue se mesure (le GBF n'affiche PAS l'amplitude).
- Confondre divisions crête-à-crête et amplitude.

## Missions (statut dans le contexte)
Alimenter le filtre, raccorder les 2 sondes, relever ≥ 4 points, trouver fc.
