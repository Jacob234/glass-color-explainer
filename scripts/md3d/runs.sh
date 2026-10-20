#!/bin/sh
# runs.sh — the four quenches behind /glass-3d/: silica and soda silica (Na2O·3SiO2, the 25 mol%
# composition SHIK was checked against), each at a fast and a slower cooling rate. 3,000 atoms each.
# Usage: LMP=/path/to/lmp sh runs.sh   (each run is serial; they go in parallel, one per core)
set -e
LMP=${LMP:-lmp}
cd "$(dirname "$0")/out" 2>/dev/null || { mkdir -p "$(dirname "$0")/out"; cd "$(dirname "$0")/out"; }
# silica: 1000 Si, 2000 O; qO = −qSi/2. Box started at 2.0 g/cm³.
# soda silica: 750 Si, 1750 O, 500 Na; qO from charge neutrality = −(750·1.7755 + 500·0.6018)/1750.
run() { $LMP -in ../quench.in -log "$1.log" -screen none -var name "$1" -var nsi "$2" -var nna "$3" -var L "$4" -var qo "$5" -var rate "$6" -var seed "$7" & }
run silica-fast 1000 0   36.8 -0.88775   "${FAST:-100}" 4127
run silica-slow 1000 0   36.8 -0.88775   "${SLOW:-10}"  4127
run soda-fast   750  500 36.9 -0.9328714 "${FAST:-100}" 5231
run soda-slow   750  500 36.9 -0.9328714 "${SLOW:-10}"  5231
wait
