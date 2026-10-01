#!/usr/bin/env node
/*
 * Lab runner: round robin between your heuristic and three built-ins.
 *
 *   node lab-run.js [depth=4] [gamesPerPair=40] [seed=1]
 *
 * Each opening is played twice with colours swapped. Use 200+ games and a
 * seed you did not tune on before claiming an improvement.
 */
'use strict';
var C4 = require('./engine.js');
var Bench = require('./bench.js');
require('./my-heuristics.js');

var depth = Number(process.argv[2] || 4), games = Number(process.argv[3] || 40);
Bench.tournament({
  agents: [
    { heuristic: 'mine', depth: depth },
    { heuristic: 'windowsCenter', depth: depth },
    { heuristic: 'cellTable', depth: depth },
    { heuristic: 'kaggle', depth: depth }
  ],
  gamesPerPair: games, openingPlies: 2, seed: Number(process.argv[4] || 1)
}).then(function (r) {
  r.standings.forEach(function (s) {
    console.log(s.label.padEnd(22), (100 * s.score).toFixed(1).padStart(5) + '%',
      'W' + s.w, 'D' + s.d, 'L' + s.l, s.msPerMove.toFixed(2) + ' ms/move');
  });
});
