# md3d — the quenches behind the Network lab

Four melt–quench runs of LAMMPS with the SHIK potential make the glasses on `/network-lab/`. They are
run once, offline; the site ships only the final atom positions.

1. Build LAMMPS with the authors' pair style: copy `pair_SHIK_wolf_2022.cpp` (renamed
   `pair_SHIK_wolf.cpp`) and `pair_SHIK_wolf.h` from
   [compmatscirpi/SHIK-potential](https://github.com/compmatscirpi/SHIK-potential) into
   `lammps/src`, then `cmake ../lammps/cmake -DBUILD_MPI=no && make lmp` (stable branch, 2026-10-20).
2. `LMP=/path/to/lmp sh runs.sh` runs the four quenches in parallel, one per core, into `out/`
   (about 50 steps/s each for 3,000 atoms on one core: 50 min for a 100 K/ps run, 2.6 h at 10 K/ps).
3. `node scripts/build_glass3d.mjs scripts/md3d/out` writes `src/data/glass3d/*.json` and the
   statistics in `src/data/glass3d.json`.

`out/` is not committed. LAMMPS (GPL-2.0) and the SHIK pair style are not redistributed here.
