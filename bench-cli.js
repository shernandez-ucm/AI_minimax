#!/usr/bin/env node
/*
 * Run the benchmarks from the command line and print Markdown tables.
 *
 *   node bench-cli.js            # full run
 *   node bench-cli.js --quick    # smaller sample, finishes in seconds
 *   node bench-cli.js --games 40 --opening 2 --rr-depth 4 --seed 7
 */
'use strict';
var C4 = require('./engine.js');
var Bench = require('./bench.js');

var args = process.argv.slice(2);
function arg(name, def) {
  var i = args.indexOf('--' + name);
  return i >= 0 ? Number(args[i + 1]) : def;
}
var quick = args.indexOf('--quick') >= 0;
var GAMES = arg('games', quick ? 6 : 20);
var OPENING = arg('opening', 2);
var SEED = arg('seed', 42);
var MAX_DEPTH = arg('max-depth', quick ? 4 : 5);
var RR_DEPTH = arg('rr-depth', 3);
var HEURISTIC_KEYS = Object.keys(C4.HEURISTICS);

function fmt(x, d) { return Number(x).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }); }
function pct(x) { return (100 * x).toFixed(1) + '%'; }
function table(header, rows) {
  var out = '| ' + header.join(' | ') + ' |\n|' + header.map(function () { return '---'; }).join('|') + '|\n';
  rows.forEach(function (r) { out += '| ' + r.join(' | ') + ' |\n'; });
  return out;
}
function progress(label) {
  return function (f) { process.stderr.write('\r' + label + ' ' + (100 * f).toFixed(0) + '%   '); };
}

async function main() {
  var t0 = Date.now();
  console.log('# Connect 4 minimax benchmark\n');
  console.log('Settings: games per pairing = ' + GAMES + ', random opening plies = ' + OPENING + ', seed = ' + SEED + '\n');

  // 1. Search efficiency --------------------------------------------------
  var depths = [];
  for (var d = 1; d <= (quick ? 5 : 7); d++) depths.push(d);
  var sb = await Bench.searchBenchmark({
    depths: depths, positions: quick ? 10 : 30, heuristic: 'kaggle',
    maxMinimaxDepth: quick ? 5 : 6, seed: SEED, onProgress: progress('search')
  });
  process.stderr.write('\n');
  console.log('## 1. Minimax vs alpha-beta (avg per move over ' + sb.positions + ' random positions, Kaggle heuristic)\n');
  console.log(table(
    ['N', 'Minimax nodes', 'Minimax ms', 'α-β nodes', 'α-β ms', 'α-β+order nodes', 'α-β+order ms', 'Node reduction', 'Same value'],
    sb.rows.map(function (r) {
      var m = r.variants.minimax, a = r.variants.alphabeta, o = r.variants.alphabetaOrdered;
      return [r.depth, m ? fmt(m.nodes, 0) : '–', m ? fmt(m.ms, 2) : '–',
        fmt(a.nodes, 0), fmt(a.ms, 2), fmt(o.nodes, 0), fmt(o.ms, 2),
        m ? fmt(m.nodes / o.nodes, 1) + '×' : '–', r.agree ? 'yes' : 'NO'];
    })
  ));

  // 2. Depth sweep: each heuristic at N = 1..MAX vs the one-step Kaggle agent --
  var agents = [];
  HEURISTIC_KEYS.forEach(function (h) {
    for (var n = 1; n <= MAX_DEPTH; n++) agents.push({ heuristic: h, depth: n });
  });
  var reference = { heuristic: 'kaggle', depth: 1, label: 'Kaggle 1-step' };
  var sweep = await Bench.gauntlet({
    agents: agents, reference: reference, gamesPerPair: GAMES,
    openingPlies: OPENING, seed: SEED, onProgress: progress('depth sweep')
  });
  process.stderr.write('\n');
  console.log('## 2. N-step lookahead: score vs Kaggle one-step agent (win = 1, draw = ½)\n');
  var header = ['Heuristic'];
  for (var n = 1; n <= MAX_DEPTH; n++) header.push('N=' + n);
  var ref = sweep.agents.length - 1;
  console.log(table(header, HEURISTIC_KEYS.map(function (h, hi) {
    var row = [C4.HEURISTICS[h].label];
    for (var n = 1; n <= MAX_DEPTH; n++) {
      var i = hi * MAX_DEPTH + (n - 1), c = sweep.matrix[i][ref];
      row.push(pct((c.w + c.d / 2) / (c.w + c.l + c.d)) + ' (' + c.w + '/' + c.d + '/' + c.l + ')');
    }
    return row;
  })));
  console.log('Cells: score (wins/draws/losses).\n');
  console.log('### Cost per move\n');
  console.log(table(['Heuristic'].concat(header.slice(1)), HEURISTIC_KEYS.map(function (h, hi) {
    var row = [C4.HEURISTICS[h].label];
    for (var n = 1; n <= MAX_DEPTH; n++) {
      var a = sweep.agents[hi * MAX_DEPTH + (n - 1)];
      row.push(fmt(a.msPerMove, 2) + ' ms / ' + fmt(a.nodesPerMove, 0) + ' nodes');
    }
    return row;
  })));

  // 3. Round robin between heuristics at a fixed depth ----------------------
  var rrAgents = HEURISTIC_KEYS.map(function (h) { return { heuristic: h, depth: RR_DEPTH }; });
  rrAgents.push({ random: true, label: 'Random' });
  var rr = await Bench.tournament({
    agents: rrAgents, gamesPerPair: GAMES, openingPlies: OPENING, seed: SEED,
    onProgress: progress('round robin')
  });
  process.stderr.write('\n');
  console.log('## 3. Round robin at N=' + RR_DEPTH + '\n');
  console.log(table(['#', 'Agent', 'Score', 'W', 'D', 'L', 'ms/move', 'nodes/move'],
    rr.standings.map(function (s, i) {
      return [i + 1, s.label, pct(s.score), s.w, s.d, s.l, fmt(s.msPerMove, 2), fmt(s.nodesPerMove, 0)];
    })));
  console.log('### Cross table (row agent\'s score vs column agent)\n');
  console.log(table(['', ].concat(rr.agents.map(function (a) { return a.label; })),
    rr.agents.map(function (a, i) {
      return [a.label].concat(rr.agents.map(function (_, j) {
        var c = rr.matrix[i][j];
        return c ? pct((c.w + c.d / 2) / (c.w + c.l + c.d)) : '–';
      }));
    })));

  console.log('_Total time: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s (Node ' + process.version + ')_');
}

main().catch(function (e) { console.error(e); process.exit(1); });
