/*
 * Lab starter: your own Connect 4 evaluation function (see README, "Lab").
 *
 * Registers C4.HEURISTICS.mine, so it can be used anywhere a built-in
 * heuristic can: lab-run.js in Node, or the browser UI after adding
 *   <script src="my-heuristics.js"></script>
 * to index.html between engine.js and app.js.
 *
 * Rules: h(cells, me) must be pure and deterministic, and |h| must stay far
 * below 1e8 (wins and losses are scored as +/-1e9 by the search).
 */
(function (C4) {
  'use strict';
  var W = C4.windows; // 69 windows, each an array of 4 cell indices

  /** F[k] / O[k]: windows holding k of my / the opponent's pieces and nothing else. */
  function features(cells, me) {
    var opp = 3 - me, F = [0, 0, 0, 0, 0], O = [0, 0, 0, 0, 0];
    for (var w = 0; w < W.length; w++) {
      var m = 0, p = 0;
      for (var k = 0; k < 4; k++) {
        var v = cells[W[w][k]];
        if (v === me) m++; else if (v === opp) p++;
      }
      if (p === 0) F[m]++;
      if (m === 0) O[p]++;
    }
    return { F: F, O: O };
  }
  C4.features = features;

  C4.HEURISTICS.mine = {
    label: 'My heuristic',
    formula: 'h = 3·F₃ + F₂ − 3·O₃ − O₂',
    description: 'Lab starter: replace with your own evaluation.',
    fn: function (cells, me) {
      var f = features(cells, me);
      // TODO: return the formula above using f.F[k] and f.O[k].
      return f.F[3] * 3 + f.F[2] - f.O[3] * 3 - f.O[2];
    }
  };

  /*
   * Probabilistic evaluation (noisy-OR over windows).
   * Each window holding pieces of only one player is a chance for that player
   * to win. Model the chance that it gets completed as
   *   p = Π over its empty cells of 0.5 · γ^d
   * where 0.5 is the chance that the player (not the opponent) fills the
   * cell, and d is the number of empty cells below it, each a ply that may
   * let the opponent interfere (γ = 0.85). A three whose gap is playable
   * right now, for the side to move, is a near-certain win (p = 0.999).
   * Treating windows as independent, P(player completes none) = Π (1 − p),
   * so −ln P(none) = Σ −ln(1 − p) and
   *   h = 100 · (Σ_mine −ln(1 − p) − Σ_opp −ln(1 − p))
   * is the log-odds-like gap between the two players' chances.
   */
  var GAMMA = 0.85, P_MAX = 0.999;

  C4.HEURISTICS.bayesian = {
    label: 'Probabilistic',
    formula: 'h = 100·(Σ_mine −ln(1−p_w) − Σ_opp −ln(1−p_w)),  p_w = Π_empty 0.5·γ^d',
    description: 'Each one-player window is completed with probability p_w = Π 0.5·γ^(cells below); combines windows as independent chances (noisy-OR) in log space.',
    fn: function (cells, me) {
      var opp = 3 - me, COLS = C4.COLS, ROWS = C4.ROWS;
      // lowest[c]: row of the lowest empty cell in column c (-1 if full).
      var lowest = [], pieces = 0, c, r, i;
      for (c = 0; c < COLS; c++) {
        r = 0;
        while (r < ROWS && cells[r * COLS + c] === 0) r++;
        lowest.push(r - 1);
      }
      for (i = 0; i < cells.length; i++) if (cells[i] !== 0) pieces++;
      var toMove = pieces % 2 === 0 ? 1 : 2;

      var score = [0, 0, 0];
      for (var w = 0; w < W.length; w++) {
        var m = 0, o = 0, k, x;
        for (k = 0; k < 4; k++) {
          x = cells[W[w][k]];
          if (x === me) m++; else if (x === opp) o++;
        }
        if ((m > 0) === (o > 0)) continue; // mixed or empty window
        var who = m > 0 ? me : opp, p = 1, empty = 0, d = 0;
        for (k = 0; k < 4; k++) {
          x = W[w][k];
          if (cells[x] !== 0) continue;
          d = lowest[x % COLS] - Math.floor(x / COLS);
          empty++;
          p *= 0.5 * Math.pow(GAMMA, d);
        }
        if (empty === 1 && d === 0 && who === toMove) p = P_MAX;
        score[who] -= Math.log(1 - Math.min(p, P_MAX));
      }
      return 100 * (score[me] - score[opp]);
    }
  };
})(typeof module === 'object' && module.exports ? require('./engine.js') : C4);
