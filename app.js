/* Connect 4 UI: game board, AI players and the benchmark page. */
(function () {
  'use strict';

  var ROWS = C4.ROWS, COLS = C4.COLS, H = C4.HEURISTICS;
  var HKEYS = Object.keys(H);
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function fmtInt(x) { return Math.round(x).toLocaleString('en-US'); }
  function fmtMs(x) { return x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : fmtInt(x); }
  function pct(x) { return (100 * x).toFixed(0) + '%'; }

  // ---------------------------------------------------------------- tabs
  $$('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('.tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
      $$('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab); });
    });
  });

  // ------------------------------------------------------------- tooltip
  var tooltip = $('#tooltip');
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tooltip.hidden = true; return; }
    tooltip.innerHTML = t.getAttribute('data-tip');
    tooltip.hidden = false;
  });
  document.addEventListener('mousemove', function (e) {
    if (tooltip.hidden) return;
    var x = e.clientX + 14, y = e.clientY + 14, r = tooltip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  });

  // ================================================================ PLAY
  var boardEl = $('#board'), statusEl = $('#status'), scoresEl = $('#scores'), analysisEl = $('#analysis');
  var game, aiTimer = null, hover = null, ghost = null;

  // Heuristic selects
  $$('.ctl-heur').forEach(function (sel, i) {
    HKEYS.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = H[k].label;
      sel.appendChild(o);
    });
    sel.value = i === 0 ? 'kaggle' : 'windowsCenter';
  });

  function playerCfg(p) {
    var el = $('.player-cfg[data-player="' + p + '"]');
    return {
      ai: $('.ctl-type', el).value === 'ai',
      heuristic: $('.ctl-heur', el).value,
      depth: +$('.ctl-depth', el).value,
      pruning: $('.ctl-ab', el).checked
    };
  }

  function cellLeft(c) { return 'calc(10px + var(--cell) * ' + (c + 0.09) + ')'; }
  function cellTop(r) { return 'calc(10px + var(--cell) * ' + (r + 0.09) + ')'; }

  function buildBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var d = document.createElement('div');
        d.className = 'cell';
        d.dataset.col = c;
        boardEl.appendChild(d);
      }
    }
    hover = document.createElement('div');
    hover.className = 'col-hover';
    hover.hidden = true;
    boardEl.appendChild(hover);
    ghost = document.createElement('div');
    ghost.className = 'piece ghost';
    ghost.hidden = true;
    boardEl.appendChild(ghost);
  }

  function newGame() {
    clearTimeout(aiTimer);
    game = { st: new C4.State(), over: false, pieces: [], token: {} };
    $$('.piece:not(.ghost)', boardEl).forEach(function (p) { p.remove(); });
    scoresEl.innerHTML = '';
    analysisEl.textContent = '';
    update();
  }

  function humanTurn() { return !game.over && !playerCfg(game.st.turn).ai; }

  function update() {
    var st = game.st;
    if (game.over) {
      statusEl.innerHTML = game.winner
        ? '<span class="disc p' + game.winner + '"></span> Player ' + game.winner + ' wins!'
        : 'Draw: the board is full.';
    } else {
      var p = st.turn, cfg = playerCfg(p);
      statusEl.innerHTML = '<span class="disc p' + p + '"></span> Player ' + p +
        (cfg.ai ? ' <span class="thinking">is thinking</span>' : ' to move');
    }
    boardEl.classList.toggle('locked', !humanTurn());
    var c1 = playerCfg(1), c2 = playerCfg(2);
    $('#btn-undo').disabled = !st.moves.length || (c1.ai && c2.ai);
    $('#btn-hint').disabled = !humanTurn();
    $$('.player-cfg[data-player]').forEach(function (el) {
      el.classList.toggle('human', $('.ctl-type', el).value === 'human');
    });
    $('#heur-desc').innerHTML = [1, 2].filter(function (p) { return playerCfg(p).ai; }).map(function (p) {
      var h = H[playerCfg(p).heuristic];
      return '<p><b>P' + p + ' · ' + esc(h.label) + '</b>: <code>' + esc(h.formula) + '</code><br>' + esc(h.description) + '</p>';
    }).join('');
    if (!humanTurn()) hideGhost();
    scheduleAI();
  }

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (game.over || !playerCfg(game.st.turn).ai) return;
    var token = game.token;
    aiTimer = setTimeout(function () {
      if (token !== game.token || game.over) return;
      var cfg = playerCfg(game.st.turn);
      var res = C4.chooseMove(game.st, {
        heuristic: cfg.heuristic, depth: cfg.depth, pruning: cfg.pruning,
        exactRoot: $('#ctl-show-scores').checked
      });
      showAnalysis(res, game.st.turn, H[cfg.heuristic].label + ' N=' + cfg.depth + (cfg.pruning ? ' α-β' : ' minimax'), cfg.depth);
      doMove(res.move);
    }, Math.max(30, +$('#ctl-delay').value));
  }

  function formatScore(v, depth) {
    if (v == null) return '';
    if (v >= C4.WIN_SCORE) return 'win<br>' + (depth - (v - C4.WIN_SCORE)) + ' ply';
    if (v <= -C4.WIN_SCORE) return 'loss<br>' + (depth + (v + C4.WIN_SCORE)) + ' ply';
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(Math.round(v * 10) / 10);
  }

  function showAnalysis(res, player, label, depth) {
    if ($('#ctl-show-scores').checked) {
      scoresEl.innerHTML = res.scores.map(function (v, c) {
        var cls = [];
        if (c === res.move) cls.push('best');
        if (v != null && v >= C4.WIN_SCORE) cls.push('win');
        if (v != null && v <= -C4.WIN_SCORE) cls.push('loss');
        return '<div class="' + cls.join(' ') + '">' + formatScore(v, depth) + '</div>';
      }).join('');
    } else scoresEl.innerHTML = '';
    analysisEl.innerHTML = 'P' + player + ' · ' + esc(label) + ' → column ' + (res.move + 1) + ' · ' +
      fmtInt(res.nodes) + ' nodes · ' + fmtInt(res.cutoffs) + ' cutoffs · ' + fmtMs(res.ms) + ' ms';
  }

  function doMove(c) {
    var st = game.st;
    if (game.over || !st.canPlay(c)) return;
    var player = st.turn;
    var row = ROWS - 1 - st.heights[c];
    var idx = st.play(c);

    $$('.piece.last', boardEl).forEach(function (p) { p.classList.remove('last'); });
    var piece = document.createElement('div');
    piece.className = 'piece p' + player + ' last';
    piece.style.left = cellLeft(c);
    piece.style.top = cellTop(row);
    piece.style.transform = 'translateY(calc(var(--cell) * ' + -(row + 1.2) + '))';
    piece.style.transition = 'none';
    boardEl.appendChild(piece);
    game.pieces.push(piece);
    piece.getBoundingClientRect(); // flush so the drop animates
    piece.style.transition = '';
    piece.style.transform = 'translateY(0)';

    if (st.isWinAt(idx)) {
      game.over = true; game.winner = player;
      var win = st.winningCells(idx);
      game.pieces.forEach(function (p, i) {
        var m = st.moves[i], r = 0, h = 0;
        // recompute each piece's cell from the move list
        for (var k = 0; k <= i; k++) if (st.moves[k] === m) h++;
        r = ROWS - h;
        if (win.indexOf(r * COLS + m) >= 0) setTimeout(function () { p.classList.add('win'); }, 380);
      });
    } else if (st.isFull()) {
      game.over = true; game.winner = 0;
    }
    update();
    if (hover && !hover.hidden) showGhost(+hover.dataset.col);
  }

  function undo() {
    clearTimeout(aiTimer);
    var st = game.st;
    if (!st.moves.length) return;
    game.token = {};
    game.over = false;
    do {
      st.undo();
      game.pieces.pop().remove();
    } while (st.moves.length && playerCfg(st.turn).ai);
    $$('.piece.win', boardEl).forEach(function (p) { p.classList.remove('win'); });
    if (game.pieces.length) game.pieces[game.pieces.length - 1].classList.add('last');
    scoresEl.innerHTML = '';
    analysisEl.textContent = '';
    update();
  }

  function showGhost(c) {
    hover.hidden = false;
    hover.dataset.col = c;
    hover.style.left = 'calc(10px + var(--cell) * ' + c + ')';
    if (!humanTurn() || !game.st.canPlay(c)) { ghost.hidden = true; return; }
    ghost.hidden = false;
    ghost.className = 'piece ghost p' + game.st.turn;
    ghost.style.left = cellLeft(c);
    ghost.style.top = cellTop(ROWS - 1 - game.st.heights[c]);
  }
  function hideGhost() { if (hover) { hover.hidden = true; ghost.hidden = true; } }

  buildBoard();
  boardEl.addEventListener('mousemove', function (e) {
    var cell = e.target.closest('.cell');
    if (cell) showGhost(+cell.dataset.col);
  });
  boardEl.addEventListener('mouseleave', hideGhost);
  boardEl.addEventListener('click', function (e) {
    var cell = e.target.closest('.cell');
    if (cell && humanTurn()) {
      game.token = {};
      doMove(+cell.dataset.col);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!$('#tab-play').classList.contains('active')) return;
    var n = +e.key;
    if (n >= 1 && n <= 7 && humanTurn()) doMove(n - 1);
  });

  $('#btn-new').addEventListener('click', newGame);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-hint').addEventListener('click', function () {
    if (!humanTurn()) return;
    var res = C4.chooseMove(game.st, { heuristic: 'windowsCenter', depth: 7, exactRoot: true });
    showAnalysis(res, game.st.turn, 'Hint: Windows + center N=7', 7);
  });
  $$('.player-cfg').forEach(function (el) {
    el.addEventListener('input', function () {
      var d = $('.ctl-depth', el), out = $('.depth-out', el);
      if (d && out) out.textContent = d.value;
      $('#delay-out').textContent = $('#ctl-delay').value;
      update();
    });
  });
  newGame();

  // =========================================================== BENCHMARK
  function heurChecks(container, checked) {
    container.innerHTML = HKEYS.map(function (k) {
      return '<label><input type="checkbox" value="' + k + '"' + (checked.indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(H[k].label) + '</label>';
    }).join('');
  }
  function selectedHeurs(card) {
    return $$('.heur-checks input:checked', card).map(function (i) { return i.value; });
  }
  function num(card, sel) { return +$(sel, card).value; }

  /** Wire Run/Stop/progress for a benchmark card. run(card, signal, onProgress) -> Promise<html> */
  function setupCard(id, run) {
    var card = $('#' + id), runBtn = $('.run', card), stopBtn = $('.stop', card);
    var bar = $('.progress', card), out = $('.out', card), signal = null;
    runBtn.addEventListener('click', function () {
      signal = { cancelled: false };
      runBtn.disabled = true; stopBtn.disabled = false;
      bar.classList.add('on'); bar.firstElementChild.style.width = '0';
      out.innerHTML = '<p class="note progress-label">Running…</p>';
      var label = $('.progress-label', out);
      var t0 = performance.now();
      run(card, signal, function (f, text) {
        bar.firstElementChild.style.width = (100 * f).toFixed(1) + '%';
        if (text) label.textContent = text;
      }).then(function (html) {
        out.innerHTML = html + '<p class="note">Finished in ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s.</p>';
      }, function (err) {
        out.innerHTML = '<p class="note">' + (err.message === 'cancelled' ? 'Stopped.' : esc(err.stack || err)) + '</p>';
      }).then(function () {
        runBtn.disabled = false; stopBtn.disabled = true; bar.classList.remove('on');
      });
    });
    stopBtn.addEventListener('click', function () { if (signal) signal.cancelled = true; });
  }

  function heatCell(c, tipPrefix) {
    if (!c) return '<td>–</td>';
    var n = c.w + c.d + c.l, s = (c.w + c.d / 2) / n, t = Math.abs(s - 0.5) * 2;
    var pole = s >= 0.5 ? 'var(--div-pos)' : 'var(--div-neg)';
    var bg = 'color-mix(in oklab, ' + pole + ' ' + (t * 100).toFixed(0) + '%, var(--div-mid))';
    var ink = t > 0.55 ? '#fff' : 'var(--text)';
    var tip = esc(tipPrefix) + '<br>' + c.w + ' wins · ' + c.d + ' draws · ' + c.l + ' losses';
    return '<td class="heat" style="background:' + bg + ';color:' + ink + '" data-tip="' + esc(tip) + '">' +
      pct(s) + '<small>' + c.w + '/' + c.d + '/' + c.l + '</small></td>';
  }

  // ---- 1. search efficiency: log-scale line chart + table
  function lineChart(rows, variants) {
    var W = 720, Hh = 300, m = { l: 64, r: 190, t: 14, b: 40 };
    var depths = rows.map(function (r) { return r.depth; });
    var maxV = 1;
    rows.forEach(function (r) { variants.forEach(function (v) { var x = r.variants[v.key]; if (x) maxV = Math.max(maxV, x.nodes); }); });
    var yMax = Math.ceil(Math.log10(maxV));
    var x = function (d) { return m.l + (depths.length === 1 ? 0 : (d - depths[0]) / (depths[depths.length - 1] - depths[0])) * (W - m.l - m.r); };
    var y = function (v) { return m.t + (1 - Math.log10(Math.max(1, v)) / yMax) * (Hh - m.t - m.b); };
    var colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Nodes per move by lookahead depth, log scale">';
    for (var e = 0; e <= yMax; e++) {
      svg += '<line class="gridline" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(Math.pow(10, e)) + '" y2="' + y(Math.pow(10, e)) + '"/>';
      svg += '<text x="' + (m.l - 8) + '" y="' + (y(Math.pow(10, e)) + 4) + '" text-anchor="end">' + (e < 4 ? fmtInt(Math.pow(10, e)) : '10<tspan dy="-6" font-size="10">' + e + '</tspan>') + '</text>';
    }
    depths.forEach(function (d) {
      svg += '<text x="' + x(d) + '" y="' + (Hh - m.b + 18) + '" text-anchor="middle">' + d + '</text>';
    });
    svg += '<text x="' + ((m.l + W - m.r) / 2) + '" y="' + (Hh - 4) + '" text-anchor="middle">Lookahead N (plies)</text>';
    svg += '<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (Hh - m.b) + '" y2="' + (Hh - m.b) + '"/>';
    variants.forEach(function (v, vi) {
      var pts = rows.filter(function (r) { return r.variants[v.key]; });
      if (!pts.length) return;
      var path = pts.map(function (r, i) { return (i ? 'L' : 'M') + x(r.depth) + ',' + y(r.variants[v.key].nodes); }).join('');
      svg += '<path d="' + path + '" fill="none" stroke="' + colors[vi] + '" stroke-width="2" stroke-linejoin="round"/>';
      pts.forEach(function (r) {
        var s = r.variants[v.key];
        var tip = '<b>' + esc(v.label) + '</b>, N=' + r.depth + '<br>' + fmtInt(s.nodes) + ' nodes · ' + fmtMs(s.ms) + ' ms per move';
        svg += '<circle cx="' + x(r.depth) + '" cy="' + y(s.nodes) + '" r="4" fill="' + colors[vi] + '" stroke="var(--surface)" stroke-width="2"/>';
        svg += '<circle cx="' + x(r.depth) + '" cy="' + y(s.nodes) + '" r="12" fill="transparent" data-tip="' + esc(tip) + '"/>';
      });
      var last = pts[pts.length - 1];
      var ly = y(last.variants[v.key].nodes) + 4 + (vi === 2 ? 12 : vi === 1 ? -4 : 0);
      svg += '<text x="' + (x(last.depth) + 10) + '" y="' + ly + '">' + esc(v.label) + '</text>';
    });
    svg += '</svg>';
    var legend = '<div class="legend">' + variants.map(function (v, vi) {
      return '<span style="--c:' + colors[vi] + '">' + esc(v.label) + '</span>';
    }).join('') + '</div>';
    return legend + svg;
  }

  setupCard('b-search', function (card, signal, onProgress) {
    var maxD = num(card, '.in-maxdepth'), depths = [];
    for (var d = 1; d <= maxD; d++) depths.push(d);
    return Bench.searchBenchmark({
      depths: depths, positions: num(card, '.in-positions'), heuristic: 'kaggle',
      maxMinimaxDepth: num(card, '.in-mmdepth'), seed: 42, signal: signal, onProgress: onProgress
    }).then(function (res) {
      var rows = res.rows.map(function (r) {
        var mm = r.variants.minimax, ab = r.variants.alphabeta, o = r.variants.alphabetaOrdered;
        return '<tr><td>' + r.depth + '</td>' +
          '<td>' + (mm ? fmtInt(mm.nodes) : '–') + '</td><td>' + (mm ? fmtMs(mm.ms) : '–') + '</td>' +
          '<td>' + fmtInt(ab.nodes) + '</td><td>' + fmtMs(ab.ms) + '</td>' +
          '<td>' + fmtInt(o.nodes) + '</td><td>' + fmtMs(o.ms) + '</td>' +
          '<td>' + (mm ? (mm.nodes / o.nodes).toFixed(1) + '×' : '–') + '</td>' +
          '<td class="' + (r.agree ? 'ok' : 'bad') + '">' + (r.agree ? '✓ same' : '✗ differs') + '</td></tr>';
      }).join('');
      return lineChart(res.rows, res.variants) +
        '<div class="table-scroll"><table class="data"><thead><tr><th>N</th><th>Minimax nodes</th><th>ms</th>' +
        '<th>α-β nodes</th><th>ms</th><th>α-β + ordering nodes</th><th>ms</th><th>Reduction</th><th>Root value</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>' +
        '<p class="note">Per move, averaged over ' + res.positions + ' positions. "Reduction" = minimax nodes ÷ ordered alpha-beta nodes.</p>';
    });
  });

  // ---- 2. depth sweep
  var REFERENCES = {
    kaggle1: { heuristic: 'kaggle', depth: 1, label: 'Kaggle 1-step' },
    random: { random: true, label: 'Random' },
    kaggle3: { heuristic: 'kaggle', depth: 3, label: 'Kaggle N=3' },
    wc4: { heuristic: 'windowsCenter', depth: 4, label: 'Windows + center N=4' }
  };
  (function () {
    var sel = $('#b-sweep .in-ref');
    Object.keys(REFERENCES).forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = REFERENCES[k].label; sel.appendChild(o);
    });
    heurChecks($('#b-sweep .heur-checks'), HKEYS);
    heurChecks($('#b-rr .heur-checks'), HKEYS);
  })();

  setupCard('b-sweep', function (card, signal, onProgress) {
    var heurs = selectedHeurs(card), maxN = num(card, '.in-maxdepth'), agents = [];
    if (!heurs.length) return Promise.reject(new Error('Select at least one heuristic.'));
    heurs.forEach(function (h) { for (var n = 1; n <= maxN; n++) agents.push({ heuristic: h, depth: n }); });
    var ref = REFERENCES[$('.in-ref', card).value];
    return Bench.gauntlet({
      agents: agents, reference: ref, gamesPerPair: num(card, '.in-games'),
      openingPlies: num(card, '.in-opening'), seed: 42, signal: signal, onProgress: onProgress
    }).then(function (res) {
      var r = res.agents.length - 1, head = '';
      for (var n = 1; n <= maxN; n++) head += '<th style="text-align:center">N=' + n + '</th>';
      var score = '', cost = '';
      heurs.forEach(function (h, hi) {
        score += '<tr><td>' + esc(H[h].label) + '</td>';
        cost += '<tr><td>' + esc(H[h].label) + '</td>';
        for (var n = 1; n <= maxN; n++) {
          var i = hi * maxN + n - 1, a = res.agents[i];
          score += heatCell(res.matrix[i][r], a.label + ' vs ' + ref.label);
          cost += '<td>' + fmtMs(a.msPerMove) + ' ms · ' + fmtInt(a.nodesPerMove) + '</td>';
        }
        score += '</tr>'; cost += '</tr>';
      });
      return '<h3>Score vs ' + esc(ref.label) + '</h3>' +
        '<div class="table-scroll"><table class="data"><thead><tr><th>Heuristic</th>' + head + '</tr></thead><tbody>' + score + '</tbody></table></div>' +
        '<p class="note">Cell = score (wins/draws/losses). Blue: beats the reference, orange: loses to it, gray: even.</p>' +
        '<h3>Cost per move (ms · nodes)</h3>' +
        '<div class="table-scroll"><table class="data"><thead><tr><th>Heuristic</th>' + head + '</tr></thead><tbody>' + cost + '</tbody></table></div>';
    });
  });

  // ---- 3. round robin
  setupCard('b-rr', function (card, signal, onProgress) {
    var heurs = selectedHeurs(card), N = num(card, '.in-depth');
    var agents = heurs.map(function (h) { return { heuristic: h, depth: N }; });
    if ($('.in-random', card).checked) agents.push({ random: true, label: 'Random' });
    if (agents.length < 2) return Promise.reject(new Error('Select at least two agents.'));
    return Bench.tournament({
      agents: agents, gamesPerPair: num(card, '.in-games'), openingPlies: num(card, '.in-opening'),
      seed: 42, signal: signal, onProgress: onProgress
    }).then(function (res) {
      var standings = res.standings.map(function (s, i) {
        return '<tr><td>' + (i + 1) + '. ' + esc(s.label) + '</td><td>' + pct(s.score) + '</td><td>' + s.w + '</td><td>' + s.d + '</td><td>' + s.l +
          '</td><td>' + fmtMs(s.msPerMove) + '</td><td>' + fmtInt(s.nodesPerMove) + '</td></tr>';
      }).join('');
      var order = res.standings.map(function (s) { return s.index; });
      var cross = order.map(function (i) {
        return '<tr><td>' + esc(res.agents[i].label) + '</td>' + order.map(function (j) {
          return i === j ? '<td style="text-align:center">–</td>' : heatCell(res.matrix[i][j], res.agents[i].label + ' vs ' + res.agents[j].label);
        }).join('') + '</tr>';
      }).join('');
      return '<h3>Standings</h3><div class="table-scroll"><table class="data"><thead><tr><th>Agent</th><th>Score</th><th>W</th><th>D</th><th>L</th><th>ms/move</th><th>nodes/move</th></tr></thead><tbody>' +
        standings + '</tbody></table></div>' +
        '<h3>Cross table</h3><div class="table-scroll"><table class="data"><thead><tr><th>Row vs column</th>' +
        order.map(function (i) { return '<th style="text-align:center">' + esc(res.agents[i].label.replace(' N=' + N, '')) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + cross + '</tbody></table></div>' +
        '<p class="note">Row agent\'s score against the column agent over ' + res.gamesPerPair + ' games.</p>';
    });
  });

  // =============================================================== ABOUT
  $('#heur-list').innerHTML = HKEYS.map(function (k) {
    return '<div class="heur-item"><b>' + esc(H[k].label) + '</b> &nbsp;<code>' + esc(H[k].formula) + '</code><br>' + esc(H[k].description) + '</div>';
  }).join('');
})();
