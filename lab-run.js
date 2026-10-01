#!/usr/bin/env node
/*
 * Lab runner: round robin between your heuristic and three built-ins.
 *
 *   node lab-run.js [depth=4] [gamesPerPair=40] [seed=1] [search=alphabeta]
 *
 * search is 'alphabeta' (with center move ordering) or 'minimax' (no pruning,
 * left-to-right order). Both pick the same moves, so the standings match and
 * only the ms/move column changes. Minimax gets slow beyond depth 5 or 6.
 *
 * Each opening is played twice with colours swapped. Use 200+ games and a
 * seed you did not tune on before claiming an improvement.
 */
'use strict';
var C4 = require('./engine.js');
var Bench = require('./bench.js');
require('./my-heuristics.js');

var depth = Number(process.argv[2] || 4), games = Number(process.argv[3] || 40);
var search = process.argv[5] || 'alphabeta';
if (search !== 'alphabeta' && search !== 'minimax') {
  console.error("search must be 'alphabeta' or 'minimax', got '" + search + "'");
  process.exit(1);
}
var pruning = search === 'alphabeta';
Bench.tournament({
  agents: [
    { heuristic: 'mine', depth: depth, pruning: pruning, ordering: pruning },
    { heuristic: 'windowsCenter', depth: depth, pruning: pruning, ordering: pruning },
    { heuristic: 'cellTable', depth: depth, pruning: pruning, ordering: pruning },
    { heuristic: 'kaggle', depth: depth, pruning: pruning, ordering: pruning }
  ],
  gamesPerPair: games, openingPlies: 2, seed: Number(process.argv[4] || 1)
}).then(function (r) {
  console.log('Search: ' + search + ', depth ' + depth + ', ' + games + ' games per pair');
  r.standings.forEach(function (s) {
    console.log(s.label.padEnd(22), (100 * s.score).toFixed(1).padStart(5) + '%',
      'W' + s.w, 'D' + s.d, 'L' + s.l, s.msPerMove.toFixed(2) + ' ms/move');
  });
});
