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
      return 0;
    }
  };
})(typeof module === 'object' && module.exports ? require('./engine.js') : C4);
