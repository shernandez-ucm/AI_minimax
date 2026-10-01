/*
 * Connect 4 engine: board representation, heuristics and minimax with
 * alpha-beta pruning. Works both in the browser (window.C4) and in Node
 * (module.exports), so the same code powers the game UI and the benchmarks.
 *
 * Conventions follow the Kaggle "N-step lookahead" tutorial:
 *   - row 0 is the TOP row, pieces fall towards row 5
 *   - players are marked 1 and 2, empty cells are 0
 *   - an "N-step" agent looks N plies ahead: its own move, the opponent's
 *     reply, ... and scores the resulting leaf with a heuristic.
 */
(function (root, factory) {
  var C4 = factory();
  if (typeof module === 'object' && module.exports) module.exports = C4;
  else root.C4 = C4;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROWS = 6, COLS = 7, INAROW = 4, SIZE = ROWS * COLS;
  var WIN_SCORE = 1e9;
  var CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];
  var LEFT_ORDER = [0, 1, 2, 3, 4, 5, 6];

  // ---------------------------------------------------------------------------
  // Precomputed windows: every group of 4 aligned cells (69 on a 6x7 board)
  // ---------------------------------------------------------------------------
  var windows = [];
  (function () {
    var dirs = [[0, 1], [1, 0], [1, 1], [-1, 1]];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        for (var d = 0; d < dirs.length; d++) {
          var dr = dirs[d][0], dc = dirs[d][1];
          var er = r + dr * (INAROW - 1), ec = c + dc * (INAROW - 1);
          if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
          var w = [];
          for (var k = 0; k < INAROW; k++) w.push((r + dr * k) * COLS + (c + dc * k));
          windows.push(w);
        }
      }
    }
  })();
  var NW = windows.length;
  var WIN_FLAT = new Int8Array(NW * INAROW);
  var CELL_WINDOWS = [];
  for (var i = 0; i < SIZE; i++) CELL_WINDOWS.push([]);
  windows.forEach(function (w, wi) {
    for (var k = 0; k < INAROW; k++) {
      WIN_FLAT[wi * INAROW + k] = w[k];
      CELL_WINDOWS[w[k]].push(wi);
    }
  });

  // ---------------------------------------------------------------------------
  // Board state (mutable, with play/undo for fast search)
  // ---------------------------------------------------------------------------
  function State() {
    this.cells = new Int8Array(SIZE);
    this.heights = new Int8Array(COLS); // pieces already in each column
    this.moves = [];
    this.turn = 1;
  }
  State.prototype.clone = function () {
    var s = new State();
    s.cells.set(this.cells);
    s.heights.set(this.heights);
    s.moves = this.moves.slice();
    s.turn = this.turn;
    return s;
  };
  State.prototype.canPlay = function (c) { return this.heights[c] < ROWS; };
  State.prototype.legalMoves = function () {
    var out = [];
    for (var c = 0; c < COLS; c++) if (this.heights[c] < ROWS) out.push(c);
    return out;
  };
  State.prototype.isFull = function () { return this.moves.length === SIZE; };
  /** Drop a piece for the side to move; returns the cell index it landed on. */
  State.prototype.play = function (c) {
    var idx = (ROWS - 1 - this.heights[c]) * COLS + c;
    this.cells[idx] = this.turn;
    this.heights[c]++;
    this.moves.push(c);
    this.turn = 3 - this.turn;
    return idx;
  };
  State.prototype.undo = function () {
    var c = this.moves.pop();
    this.heights[c]--;
    this.cells[(ROWS - 1 - this.heights[c]) * COLS + c] = 0;
    this.turn = 3 - this.turn;
  };
  /** Does the piece at `idx` complete four in a row? */
  State.prototype.isWinAt = function (idx) {
    var p = this.cells[idx], cells = this.cells, ws = CELL_WINDOWS[idx];
    for (var i = 0; i < ws.length; i++) {
      var o = ws[i] * INAROW;
      if (cells[WIN_FLAT[o]] === p && cells[WIN_FLAT[o + 1]] === p &&
          cells[WIN_FLAT[o + 2]] === p && cells[WIN_FLAT[o + 3]] === p) return true;
    }
    return false;
  };
  /** Cells of every winning line through `idx` (for highlighting). */
  State.prototype.winningCells = function (idx) {
    var p = this.cells[idx], out = [];
    var self = this;
    CELL_WINDOWS[idx].forEach(function (wi) {
      var w = windows[wi];
      if (w.every(function (x) { return self.cells[x] === p; })) out = out.concat(w);
    });
    return out;
  };

  // ---------------------------------------------------------------------------
  // Heuristics: f(cells, me) -> score from `me`'s point of view.
  // Leaves that are wins/losses/draws never reach the heuristic; search scores
  // them directly, so every heuristic shares the same terminal handling.
  // ---------------------------------------------------------------------------

  /**
   * Build a heuristic from a table indexed by (my pieces, opponent pieces)
   * in each of the 69 windows, plus an optional per-cell positional bonus.
   */
  function windowHeuristic(weights, cellBonus) {
    var table = new Float64Array(25);
    Object.keys(weights).forEach(function (k) {
      var m = +k[0], p = +k[1];
      table[m * 5 + p] = weights[k];
    });
    return function (cells, me) {
      var opp = 3 - me, s = 0;
      for (var w = 0, o = 0; w < NW; w++, o += 4) {
        var m = 0, p = 0;
        for (var k = 0; k < 4; k++) {
          var v = cells[WIN_FLAT[o + k]];
          if (v === me) m++; else if (v === opp) p++;
        }
        s += table[m * 5 + p];
      }
      if (cellBonus) {
        for (var i = 0; i < SIZE; i++) {
          var x = cells[i];
          if (x === me) s += cellBonus[i]; else if (x === opp) s -= cellBonus[i];
        }
      }
      return s;
    };
  }

  // Number of 4-windows through each cell (the classic "evaluation table").
  var WINDOWS_PER_CELL = new Float64Array(SIZE);
  for (var ci = 0; ci < SIZE; ci++) WINDOWS_PER_CELL[ci] = CELL_WINDOWS[ci].length;
  var CENTER_COLUMN = new Float64Array(SIZE);
  for (var r0 = 0; r0 < ROWS; r0++) CENTER_COLUMN[r0 * COLS + 3] = 3;

  var HEURISTICS = {
    zero: {
      label: 'Zero (blind)',
      formula: 'h = 0',
      description: 'No positional knowledge. Only sees wins/losses inside the search horizon; ties are broken at random.',
      fn: function () { return 0; }
    },
    cellTable: {
      label: 'Cell table',
      formula: 'h = Σ mine T[cell] − Σ opp T[cell]',
      description: 'Classic positional table: each cell is worth the number of 4-windows that pass through it (3..13). Rewards central control.',
      fn: windowHeuristic({}, WINDOWS_PER_CELL)
    },
    kaggle: {
      label: 'Kaggle N-step',
      formula: 'h = 1e6·F₄ + 1·F₃ − 1e2·O₃ − 1e4·O₄',
      description: 'Heuristic from the Kaggle N-step lookahead tutorial: count windows with 3 of mine + 1 empty (F₃) and 3 of the opponent + 1 empty (O₃). Strongly defensive.',
      fn: windowHeuristic({ '40': 1e6, '30': 1, '03': -1e2, '04': -1e4 })
    },
    symmetric: {
      label: 'Symmetric threes',
      formula: 'h = F₃ − O₃',
      description: 'Same features as Kaggle but with equal weight for own and opponent threats. Tests whether the 100× defensive bias matters.',
      fn: windowHeuristic({ '30': 1, '03': -1 })
    },
    windowsCenter: {
      label: 'Windows + center',
      formula: 'h = 5·F₃ + 2·F₂ − 2·O₂ − 4·O₃ + 3·center',
      description: 'Popular hand-tuned evaluation: also rewards open twos (F₂) and pieces in the center column.',
      fn: windowHeuristic({ '30': 5, '20': 2, '02': -2, '03': -4 }, CENTER_COLUMN)
    }
  };

  // ---------------------------------------------------------------------------
  // Minimax with optional alpha-beta pruning and move ordering
  // ---------------------------------------------------------------------------
  function minimax(st, depth, alpha, beta, maximizing, me, ctx, lastIdx) {
    ctx.nodes++;
    if (st.isWinAt(lastIdx)) {
      // The player who just moved won. Faster wins / slower losses score better.
      return maximizing ? -(WIN_SCORE + depth) : WIN_SCORE + depth;
    }
    if (st.moves.length === SIZE) return 0;
    if (depth === 0) return ctx.h(st.cells, me);

    var order = ctx.order, pruning = ctx.pruning, best, v, c, i;
    if (maximizing) {
      best = -Infinity;
      for (i = 0; i < COLS; i++) {
        c = order[i];
        if (st.heights[c] >= ROWS) continue;
        v = minimax(st, depth - 1, alpha, beta, false, me, ctx, st.play(c));
        st.undo();
        if (v > best) best = v;
        if (pruning) {
          if (best > alpha) alpha = best;
          if (alpha >= beta) { ctx.cutoffs++; break; }
        }
      }
    } else {
      best = Infinity;
      for (i = 0; i < COLS; i++) {
        c = order[i];
        if (st.heights[c] >= ROWS) continue;
        v = minimax(st, depth - 1, alpha, beta, true, me, ctx, st.play(c));
        st.undo();
        if (v < best) best = v;
        if (pruning) {
          if (best < beta) beta = best;
          if (alpha >= beta) { ctx.cutoffs++; break; }
        }
      }
    }
    return best;
  }

  function now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    var t = process.hrtime();
    return t[0] * 1e3 + t[1] / 1e6;
  }

  /** Small deterministic PRNG (mulberry32) so benchmarks are reproducible. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * Pick a move for the side to move.
   * opts: {
   *   heuristic: key of HEURISTICS (default 'kaggle'),
   *   depth:     N plies of lookahead (>= 1),
   *   pruning:   alpha-beta on/off (default true),
   *   ordering:  search center columns first (default true),
   *   exactRoot: search every root move with a full window so all column
   *              scores are exact (used by the UI to display them),
   *   rand:      () => [0,1) used for random tie-breaking
   * }
   * Returns { move, score, scores[7], nodes, cutoffs, ms }.
   */
  function chooseMove(st, opts) {
    var t0 = now();
    var h = HEURISTICS[opts.heuristic || 'kaggle'].fn;
    var depth = Math.max(1, opts.depth | 0);
    var pruning = opts.pruning !== false;
    var ctx = {
      h: h, pruning: pruning, nodes: 0, cutoffs: 0,
      order: opts.ordering === false ? LEFT_ORDER : CENTER_ORDER
    };
    var me = st.turn;
    // Root moves in random order + strict ">" = uniform tie-break among the
    // best moves (also correct with alpha-beta: tied siblings fail low).
    var moves = shuffle(st.legalMoves(), opts.rand || Math.random);
    var scores = [null, null, null, null, null, null, null];
    var best = -Infinity, bestMove = moves[0], alpha = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var c = moves[i];
      var a = pruning && !opts.exactRoot ? alpha : -Infinity;
      var v = minimax(st, depth - 1, a, Infinity, false, me, ctx, st.play(c));
      st.undo();
      scores[c] = v;
      if (v > best) { best = v; bestMove = c; }
      if (v > alpha) alpha = v;
    }
    return {
      move: bestMove, score: best, scores: scores,
      nodes: ctx.nodes, cutoffs: ctx.cutoffs, ms: now() - t0
    };
  }

  // ---------------------------------------------------------------------------
  // Agents and games
  // ---------------------------------------------------------------------------
  /**
   * Agent spec: { heuristic, depth, pruning?, ordering? } or { random: true }.
   * Returns { label, act(state, rand) -> chooseMove-like result }.
   */
  function makeAgent(spec) {
    if (spec.random) {
      return {
        spec: spec, label: spec.label || 'Random',
        act: function (st, rand) {
          var m = st.legalMoves();
          return { move: m[Math.floor(rand() * m.length)], nodes: 0, ms: 0 };
        }
      };
    }
    return {
      spec: spec,
      label: spec.label || (HEURISTICS[spec.heuristic].label + ' N=' + spec.depth),
      act: function (st, rand) {
        return chooseMove(st, {
          heuristic: spec.heuristic, depth: spec.depth,
          pruning: spec.pruning, ordering: spec.ordering, rand: rand
        });
      }
    };
  }

  /** Random opening (list of columns) that does not end the game. */
  function randomOpening(plies, rand) {
    var st = new State(), seq = [];
    for (var i = 0; i < plies; i++) {
      var m = st.legalMoves(), c = m[Math.floor(rand() * m.length)];
      if (st.isWinAt(st.play(c))) { st.undo(); break; }
      seq.push(c);
    }
    return seq;
  }

  /**
   * Play one game. agents[0] moves first (as player 1).
   * Returns { winner: 0 (draw) | 1 | 2, moves, stats[2] }.
   */
  function playGame(first, second, rand, opening) {
    var st = new State(), agents = [first, second];
    var stats = [{ moves: 0, ms: 0, nodes: 0 }, { moves: 0, ms: 0, nodes: 0 }];
    (opening || []).forEach(function (c) { st.play(c); });
    while (true) {
      var p = st.turn - 1;
      var res = agents[p].act(st, rand);
      stats[p].moves++; stats[p].ms += res.ms; stats[p].nodes += res.nodes;
      var idx = st.play(res.move);
      if (st.isWinAt(idx)) return { winner: p + 1, moves: st.moves, stats: stats };
      if (st.isFull()) return { winner: 0, moves: st.moves, stats: stats };
    }
  }

  return {
    ROWS: ROWS, COLS: COLS, SIZE: SIZE, WIN_SCORE: WIN_SCORE,
    State: State, HEURISTICS: HEURISTICS, windows: windows,
    chooseMove: chooseMove, makeAgent: makeAgent, playGame: playGame,
    randomOpening: randomOpening, rng: rng, shuffle: shuffle, now: now
  };
});
