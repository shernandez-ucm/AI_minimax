/*
 * Benchmarks shared by the browser page and the Node CLI (bench-cli.js).
 * All runners are async and yield regularly so the browser UI stays
 * responsive; pass a `signal` object ({ cancelled: bool }) to stop early.
 */
(function (root, factory) {
  var C4 = typeof module === 'object' && module.exports ? require('./engine.js') : root.C4;
  var Bench = factory(C4);
  if (typeof module === 'object' && module.exports) module.exports = Bench;
  else root.Bench = Bench;
})(typeof self !== 'undefined' ? self : this, function (C4) {
  'use strict';

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function checkCancel(signal) {
    if (signal && signal.cancelled) throw new Error('cancelled');
  }

  /** Random mid-game positions (non-terminal) for search benchmarks. */
  function samplePositions(count, minPlies, maxPlies, rand) {
    var out = [];
    while (out.length < count) {
      var plies = minPlies + Math.floor(rand() * (maxPlies - minPlies + 1));
      var seq = C4.randomOpening(plies, rand);
      if (seq.length !== plies) continue; // opening hit a win: resample
      var st = new C4.State();
      seq.forEach(function (c) { st.play(c); });
      out.push(st);
    }
    return out;
  }

  var SEARCH_VARIANTS = [
    { key: 'minimax', label: 'Minimax', pruning: false, ordering: false },
    { key: 'alphabeta', label: 'Alpha-beta', pruning: true, ordering: false },
    { key: 'alphabetaOrdered', label: 'Alpha-beta + center ordering', pruning: true, ordering: true }
  ];

  /**
   * Nodes / time per move for plain minimax vs alpha-beta (with and without
   * move ordering) on the same random positions, checking that all variants
   * agree on the root value.
   * opts: { depths[], positions, heuristic, maxMinimaxDepth, seed, signal, onProgress }
   */
  async function searchBenchmark(opts) {
    var rand = C4.rng(opts.seed || 1);
    var positions = samplePositions(opts.positions || 20, 4, 14, rand);
    var rows = [];
    var total = opts.depths.length * SEARCH_VARIANTS.length * positions.length, done = 0;
    for (var di = 0; di < opts.depths.length; di++) {
      var depth = opts.depths[di];
      var row = { depth: depth, variants: {}, agree: true };
      var reference = null;
      for (var vi = 0; vi < SEARCH_VARIANTS.length; vi++) {
        var variant = SEARCH_VARIANTS[vi];
        if (!variant.pruning && depth > (opts.maxMinimaxDepth || 6)) {
          done += positions.length;
          row.variants[variant.key] = null;
          continue;
        }
        var nodes = 0, ms = 0, cutoffs = 0, values = [];
        for (var pi = 0; pi < positions.length; pi++) {
          checkCancel(opts.signal);
          var r = C4.chooseMove(positions[pi], {
            heuristic: opts.heuristic || 'kaggle', depth: depth,
            pruning: variant.pruning, ordering: variant.ordering, rand: C4.rng(pi)
          });
          nodes += r.nodes; ms += r.ms; cutoffs += r.cutoffs;
          values.push(r.score);
          done++;
          if (opts.onProgress && done % 5 === 0) { opts.onProgress(done / total); await tick(); }
        }
        if (reference) {
          for (var k = 0; k < values.length; k++) if (values[k] !== reference[k]) row.agree = false;
        } else reference = values;
        row.variants[variant.key] = {
          nodes: nodes / positions.length, ms: ms / positions.length,
          cutoffs: cutoffs / positions.length
        };
      }
      rows.push(row);
    }
    if (opts.onProgress) opts.onProgress(1);
    return { positions: positions.length, variants: SEARCH_VARIANTS, rows: rows };
  }

  /**
   * Play matches between agent pairs. Each pairing plays `gamesPerPair`
   * games from paired random openings: every opening is played twice with
   * colors swapped, so neither agent benefits from moving first.
   * opts: { agents[spec], pairs[[i,j]] (default: round robin), gamesPerPair,
   *         openingPlies, seed, signal, onProgress }
   */
  async function tournament(opts) {
    var agents = opts.agents.map(C4.makeAgent);
    var n = agents.length;
    var pairs = opts.pairs;
    if (!pairs) {
      pairs = [];
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) pairs.push([i, j]);
    }
    var games = Math.max(2, opts.gamesPerPair || 10);
    var rand = C4.rng(opts.seed || 1);
    var matrix = [];
    for (var a = 0; a < n; a++) {
      matrix.push([]);
      for (var b = 0; b < n; b++) matrix[a].push(null);
    }
    var totals = agents.map(function (ag) {
      return { label: ag.label, spec: ag.spec, w: 0, l: 0, d: 0, games: 0, moves: 0, ms: 0, nodes: 0, firstWins: 0 };
    });
    var totalGames = pairs.length * games, played = 0;

    function record(idx, oppIdx, outcome, stat) {
      var cell = matrix[idx][oppIdx] || (matrix[idx][oppIdx] = { w: 0, l: 0, d: 0 });
      cell[outcome]++;
      var t = totals[idx];
      t[outcome]++; t.games++;
      t.moves += stat.moves; t.ms += stat.ms; t.nodes += stat.nodes;
    }

    for (var pi = 0; pi < pairs.length; pi++) {
      var A = pairs[pi][0], B = pairs[pi][1], opening = null;
      for (var g = 0; g < games; g++) {
        checkCancel(opts.signal);
        if (g % 2 === 0) opening = C4.randomOpening(opts.openingPlies || 0, rand);
        var first = g % 2 === 0 ? A : B, second = g % 2 === 0 ? B : A;
        var res = C4.playGame(agents[first], agents[second], rand, opening);
        var o1 = res.winner === 0 ? 'd' : res.winner === 1 ? 'w' : 'l';
        var o2 = o1 === 'd' ? 'd' : o1 === 'w' ? 'l' : 'w';
        record(first, second, o1, res.stats[0]);
        record(second, first, o2, res.stats[1]);
        if (res.winner === 1) totals[first].firstWins++;
        played++;
        if (opts.onProgress) opts.onProgress(played / totalGames, totals[first].label + ' vs ' + totals[second].label);
        await tick();
      }
    }

    totals.forEach(function (t) {
      t.points = t.w + t.d / 2;
      t.score = t.games ? t.points / t.games : 0;
      t.msPerMove = t.moves ? t.ms / t.moves : 0;
      t.nodesPerMove = t.moves ? t.nodes / t.moves : 0;
    });
    var standings = totals.map(function (t, i) { return Object.assign({ index: i }, t); })
      .filter(function (t) { return t.games > 0; })
      .sort(function (x, y) { return y.score - x.score || x.msPerMove - y.msPerMove; });
    return { agents: totals, matrix: matrix, standings: standings, gamesPerPair: games };
  }

  /** Every agent plays the reference agent (appended as the last agent). */
  function gauntlet(opts) {
    var agents = opts.agents.concat([opts.reference]);
    var ref = agents.length - 1;
    var pairs = opts.agents.map(function (_, i) { return [i, ref]; });
    return tournament(Object.assign({}, opts, { agents: agents, pairs: pairs }));
  }

  return {
    searchBenchmark: searchBenchmark, tournament: tournament, gauntlet: gauntlet,
    samplePositions: samplePositions, SEARCH_VARIANTS: SEARCH_VARIANTS
  };
});
