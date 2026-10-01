# Connect 4 minimax benchmark

Settings: games per pairing = 20, random opening plies = 2, seed = 42

## 1. Minimax vs alpha-beta (avg per move over 30 random positions, Kaggle heuristic)

| N | Minimax nodes | Minimax ms | α-β nodes | α-β ms | α-β+order nodes | α-β+order ms | Node reduction | Same value |
|---|---|---|---|---|---|---|---|---|
| 1 | 7 | 0.12 | 7 | 0.03 | 7 | 0.02 | 1× | yes |
| 2 | 54 | 0.13 | 29 | 0.08 | 26 | 0.07 | 2× | yes |
| 3 | 369 | 0.67 | 134 | 0.29 | 110 | 0.18 | 3.3× | yes |
| 4 | 2,458 | 2.37 | 491 | 0.42 | 385 | 0.31 | 6.4× | yes |
| 5 | 16,413 | 12.87 | 2,108 | 1.41 | 1,529 | 1.05 | 10.7× | yes |
| 6 | 107,736 | 79.3 | 7,922 | 5.14 | 5,518 | 3.61 | 19.5× | yes |
| 7 | – | – | 32,281 | 20.74 | 18,655 | 11.75 | – | yes |

## 2. N-step lookahead: score vs Kaggle one-step agent (win = 1, draw = ½)

| Heuristic | N=1 | N=2 | N=3 | N=4 | N=5 |
|---|---|---|---|---|---|
| Zero (blind) | 10.0% (2/0/18) | 35.0% (6/2/12) | 55.0% (11/0/9) | 70.0% (13/2/5) | 72.5% (13/3/4) |
| Cell table | 5.0% (1/0/19) | 62.5% (12/1/7) | 95.0% (19/0/1) | 100.0% (20/0/0) | 92.5% (18/1/1) |
| Kaggle N-step | 60.0% (12/0/8) | 72.5% (14/1/5) | 87.5% (17/1/2) | 95.0% (19/0/1) | 95.0% (19/0/1) |
| Symmetric threes | 25.0% (5/0/15) | 92.5% (18/1/1) | 80.0% (16/0/4) | 100.0% (20/0/0) | 100.0% (20/0/0) |
| Windows + center | 60.0% (12/0/8) | 90.0% (18/0/2) | 100.0% (20/0/0) | 100.0% (20/0/0) | 95.0% (19/0/1) |

Cells: score (wins/draws/losses).

### Cost per move

| Heuristic | N=1 | N=2 | N=3 | N=4 | N=5 |
|---|---|---|---|---|---|
| Zero (blind) | 0.01 ms / 7 nodes | 0.02 ms / 20 nodes | 0.02 ms / 85 nodes | 0.03 ms / 208 nodes | 0.09 ms / 696 nodes |
| Cell table | 0.03 ms / 7 nodes | 0.05 ms / 26 nodes | 0.21 ms / 100 nodes | 0.29 ms / 295 nodes | 0.82 ms / 923 nodes |
| Kaggle N-step | 0.01 ms / 7 nodes | 0.03 ms / 24 nodes | 0.17 ms / 109 nodes | 0.29 ms / 324 nodes | 1.16 ms / 1,332 nodes |
| Symmetric threes | 0.01 ms / 7 nodes | 0.03 ms / 22 nodes | 0.12 ms / 103 nodes | 0.32 ms / 270 nodes | 1.27 ms / 1,386 nodes |
| Windows + center | 0.01 ms / 7 nodes | 0.04 ms / 27 nodes | 0.2 ms / 103 nodes | 0.43 ms / 337 nodes | 1.38 ms / 1,461 nodes |

## 3. Round robin at N=3

| # | Agent | Score | W | D | L | ms/move | nodes/move |
|---|---|---|---|---|---|---|---|
| 1 | Windows + center N=3 | 81.5% | 80 | 3 | 17 | 0.14 | 101 |
| 2 | Symmetric threes N=3 | 64.5% | 64 | 1 | 35 | 0.15 | 104 |
| 3 | Cell table N=3 | 64.0% | 63 | 2 | 35 | 0.13 | 89 |
| 4 | Kaggle N-step N=3 | 59.0% | 56 | 6 | 38 | 0.15 | 106 |
| 5 | Zero (blind) N=3 | 27.5% | 26 | 3 | 71 | 0.01 | 77 |
| 6 | Random | 3.5% | 3 | 1 | 96 | 0 | 0 |

### Cross table (row agent's score vs column agent)

|  | Zero (blind) N=3 | Cell table N=3 | Kaggle N-step N=3 | Symmetric threes N=3 | Windows + center N=3 | Random |
|---|---|---|---|---|---|---|
| Zero (blind) N=3 | – | 20.0% | 10.0% | 10.0% | 10.0% | 87.5% |
| Cell table N=3 | 80.0% | – | 67.5% | 50.0% | 22.5% | 100.0% |
| Kaggle N-step N=3 | 90.0% | 32.5% | – | 42.5% | 30.0% | 100.0% |
| Symmetric threes N=3 | 90.0% | 50.0% | 57.5% | – | 25.0% | 100.0% |
| Windows + center N=3 | 90.0% | 77.5% | 70.0% | 75.0% | – | 95.0% |
| Random | 12.5% | 0.0% | 0.0% | 0.0% | 5.0% | – |

_Total time: 7.2 s (Node v10.24.1)_
