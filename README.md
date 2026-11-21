# csv-reader-speed-01-run-20261121-entry

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/KimLyNamHa/csv-reader-speed-01-run-20261121-entry/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/KimLyNamHa/csv-reader-speed-01-run-20261121-entry/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` reads broken CSV files exactly the way csv-reader does — same `{columns, rows, errors}` for every input — but about 3.6× faster on the kit's practice sets (median ~120 ms vs ~447 ms for the house baseline over the six practice cases, ~10 MB of CSV).

How it stays fast while the reference stays plain: one tight left-to-right pass with `charCodeAt` (never per-character string indexing), fields cut out with `slice` instead of built a character at a time, quoted fields that jump to the next quote with `indexOf` (only the segments holding a newline or a doubled quote pay for a transform), and no per-field function calls — the whole reader is one inlined loop. The policy is matched exactly: BOM dropped, CRLF and lone CRs inside quotes read as LF, stray CRs dropped with `stray_cr`, `""` inside quotes is one quote, junk after a closing quote is `quote_junk`, a quote that never closes is a literal with `unterminated_quote`, short rows padded (`short_row`) and long rows cut (`long_row`), every error carrying the line its record starts on and the record's index in rows.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` is the standard house driver: it reads every case from `/input/cases.json`, answers each with `run` from `solve.js`, and writes `/output/answers.json`. It runs V8 with incremental marking off, as the baseline does.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qmq06e6v&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
