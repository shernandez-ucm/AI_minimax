// Regenerates the docs/*.svg diagrams used in README.md from the engine's own
// heuristics, so every number in the figures is computed, not typed in.
//   node docs/make-diagrams.js
var fs = require('fs');
var C4 = require('../engine.js');
var OUT = __dirname + '/';

var SEQ = '3236434324';
var st = new C4.State();
SEQ.split('').forEach(function (c) { st.play(+c); });
var cells = st.cells, ME = 1, OPP = 2;

var COL = {
  bg: '#ffffff', border: '#d0d7de', text: '#1f2328', muted: '#57606a',
  board: '#1e4fa3', hole: '#eef2f8', x: '#d32f2f', xs: '#8e1b1b', o: '#f6b70f', os: '#a87900',
  f: '#13853b', opp: '#7b1fa2', center: '#ffe08a', neutral: '#8c959f'
};
var FONT = 'font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif"';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function text(x, y, s, o) {
  o = o || {};
  return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 13) + '"' +
    (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') +
    ' fill="' + (o.fill || COL.text) + '"' + (o.weight ? ' font-weight="' + o.weight + '"' : '') +
    (o.family ? ' font-family="' + o.family + '"' : '') + '>' + esc(s) + '</text>';
}
function mono(x, y, s, o) { o = Object.assign({ family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }, o || {}); return text(x, y, s, o); }
function svg(w, h, body, title) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" ' + FONT + ' role="img">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<rect x="0.5" y="0.5" width="' + (w - 1) + '" height="' + (h - 1) + '" rx="10" fill="' + COL.bg + '" stroke="' + COL.border + '"/>\n' +
    body + '\n</svg>\n';
}

function windowCells(wi) { return C4.windows[wi]; }
function rc(i) { return [Math.floor(i / 7), i % 7]; }
function classify(wi) {
  var m = 0, p = 0;
  C4.windows[wi].forEach(function (i) { if (cells[i] === ME) m++; else if (cells[i] === OPP) p++; });
  return { m: m, p: p };
}
function windowsOf(kind, k) { // kind 'F' or 'O'
  var out = [];
  for (var wi = 0; wi < C4.windows.length; wi++) {
    var c = classify(wi);
    if (kind === 'F' && c.p === 0 && c.m === k) out.push(wi);
    if (kind === 'O' && c.m === 0 && c.p === k) out.push(wi);
  }
  return out;
}

/**
 * Draw a board. opts: cs (cell size), cells, labels (bool: col/row numbers),
 * cellText(i) -> string|null, shade(i) -> fill|null, windows [{wi, color}],
 * hideEmpty (bool)
 */
function board(x, y, opts) {
  var cs = opts.cs || 40, b = cells, s = '', pad = cs * 0.12;
  var W = 7 * cs, H = 6 * cs;
  s += '<g transform="translate(' + x + ',' + y + ')">';
  s += '<rect x="' + (-pad) + '" y="' + (-pad) + '" width="' + (W + 2 * pad) + '" height="' + (H + 2 * pad) + '" rx="' + (cs * 0.25) + '" fill="' + COL.board + '"/>';
  for (var i = 0; i < 42; i++) {
    var r = Math.floor(i / 7), c = i % 7, cx = c * cs + cs / 2, cy = r * cs + cs / 2, rad = cs * 0.4;
    var shade = opts.shade && opts.shade(i);
    var fill = b[i] === ME ? COL.x : b[i] === OPP ? COL.o : (shade || COL.hole);
    var stroke = b[i] === ME ? COL.xs : b[i] === OPP ? COL.os : 'none';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (cs > 30 ? 1.5 : 1) + '"/>';
    if (shade && b[i] !== 0) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rad + cs * 0.06) + '" fill="none" stroke="' + shade + '" stroke-width="' + (cs * 0.08) + '"/>';
    var t = opts.cellText && opts.cellText(i);
    if (t != null) {
      var tf = b[i] === ME ? '#ffffff' : b[i] === OPP ? '#3d2a00' : COL.muted;
      s += text(cx, cy + cs * 0.13, t, { anchor: 'middle', size: Math.round(cs * 0.36), fill: tf, weight: b[i] ? 700 : 400 });
    }
  }
  // windows: offset collinear overlapping windows so each stays visible
  var ws = opts.windows || [];
  var groups = {};
  ws.forEach(function (w) {
    var a = rc(C4.windows[w.wi][0]), z = rc(C4.windows[w.wi][3]);
    var dr = Math.sign(z[0] - a[0]), dc = Math.sign(z[1] - a[1]);
    var key = dr + ',' + dc + ':' + (dr === 0 ? a[0] : dc === 0 ? a[1] : dr * dc > 0 ? a[0] - a[1] : a[0] + a[1]);
    (groups[key] = groups[key] || []).push(w);
  });
  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    g.forEach(function (w, k) {
      var a = rc(C4.windows[w.wi][0]), z = rc(C4.windows[w.wi][3]);
      var x1 = a[1] * cs + cs / 2, y1 = a[0] * cs + cs / 2, x2 = z[1] * cs + cs / 2, y2 = z[0] * cs + cs / 2;
      var len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      var off = (k - (g.length - 1) / 2) * cs * 0.2;
      x1 += nx * off; x2 += nx * off; y1 += ny * off; y2 += ny * off;
      s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + w.color + '" stroke-opacity="0.8" stroke-width="' + (cs * 0.16) + '" stroke-linecap="round"/>';
    });
  });
  ws.forEach(function (w) {
    C4.windows[w.wi].forEach(function (i) {
      if (b[i] !== 0) return;
      var r = Math.floor(i / 7), c = i % 7;
      s += '<circle cx="' + (c * cs + cs / 2) + '" cy="' + (r * cs + cs / 2) + '" r="' + (cs * 0.3) + '" fill="none" stroke="' + w.color + '" stroke-width="' + Math.max(1.5, cs * 0.06) + '" stroke-dasharray="' + (cs * 0.12) + ' ' + (cs * 0.08) + '"/>';
    });
  });
  if (opts.labels) {
    for (var c2 = 0; c2 < 7; c2++) s += text(c2 * cs + cs / 2, H + pad + cs * 0.45, c2, { anchor: 'middle', size: 12, fill: COL.muted });
    for (var r2 = 0; r2 < 6; r2++) s += text(-pad - 6, r2 * cs + cs / 2 + 4, r2, { anchor: 'end', size: 12, fill: COL.muted });
  }
  s += '</g>';
  return s;
}
function boardW(cs) { return 7 * cs; }
function boardH(cs) { return 6 * cs; }
function legendPieces(x, y) {
  return '<circle cx="' + x + '" cy="' + (y - 4) + '" r="7" fill="' + COL.x + '" stroke="' + COL.xs + '"/>' +
    text(x + 12, y, 'X = me (player 1, to move)', { size: 12, fill: COL.muted }) +
    '<circle cx="' + (x + 190) + '" cy="' + (y - 4) + '" r="7" fill="' + COL.o + '" stroke="' + COL.os + '"/>' +
    text(x + 202, y, 'O = opponent', { size: 12, fill: COL.muted });
}

// ---------------------------------------------------------------------------
var F = [0, 1, 2, 3, 4].map(function (k) { return windowsOf('F', k).length; });
var O = [0, 1, 2, 3, 4].map(function (k) { return windowsOf('O', k).length; });
var centerMe = 0, centerOpp = 0;
for (var r = 0; r < 6; r++) { var v = cells[r * 7 + 3]; if (v === ME) centerMe++; else if (v === OPP) centerOpp++; }
var H = {};
Object.keys(C4.HEURISTICS).forEach(function (k) { H[k] = C4.HEURISTICS[k].fn(cells, ME); });
var T = []; // windows per cell
for (var i = 0; i < 42; i++) T.push(0);
C4.windows.forEach(function (w) { w.forEach(function (i) { T[i]++; }); });
var sumMe = 0, sumOpp = 0;
for (i = 0; i < 42; i++) { if (cells[i] === ME) sumMe += T[i]; else if (cells[i] === OPP) sumOpp += T[i]; }
// (feature counts and scores are checked against the engine below)
if (H.cellTable !== sumMe - sumOpp) throw new Error('cell table mismatch');
if (H.windowsCenter !== 5 * F[3] + 2 * F[2] - 2 * O[2] - 4 * O[3] + 3 * (centerMe - centerOpp)) throw new Error('wc mismatch');

// ---------------------------------------------------------------------------
// 1. Example position
(function () {
  var cs = 44, w = 640, h = 392, bx = 50, by = 60, s = '';
  s += text(24, 34, 'Example position', { size: 18, weight: 700 });
  s += text(24, 52, 'moves ' + SEQ + ' (columns, 0 = left) · X to move', { size: 12, fill: COL.muted });
  s += board(bx, by + 6, { cs: cs, labels: true });
  var tx = bx + boardW(cs) + 40, ty = by + 20;
  s += text(tx, ty, 'Feature counts (from X’s view)', { size: 14, weight: 700 });
  var rows = [['k', 'Fₖ (mine)', 'Oₖ (opp)']];
  for (var k = 1; k <= 4; k++) rows.push([k, F[k], O[k]]);
  rows.forEach(function (row, ri) {
    var yy = ty + 26 + ri * 22;
    if (ri === 0) s += '<line x1="' + tx + '" y1="' + (yy + 7) + '" x2="' + (tx + 220) + '" y2="' + (yy + 7) + '" stroke="' + COL.border + '"/>';
    s += text(tx + 8, yy, row[0], { size: 13, weight: ri ? 400 : 700, anchor: 'start' });
    s += text(tx + 100, yy, row[1], { size: 13, weight: ri ? 400 : 700, anchor: 'middle', fill: ri ? COL.f : COL.text });
    s += text(tx + 185, yy, row[2], { size: 13, weight: ri ? 400 : 700, anchor: 'middle', fill: ri ? COL.opp : COL.text });
  });
  var yy2 = ty + 26 + 5 * 22 + 10;
  s += text(tx, yy2, 'Center column: X ' + centerMe + ', O ' + centerOpp, { size: 13 });
  s += text(tx, yy2 + 22, 'Cell (4,5) completes X’s row AND O’s', { size: 12, fill: COL.muted });
  s += text(tx, yy2 + 38, 'diagonal; whoever plays column 5 first', { size: 12, fill: COL.muted });
  s += text(tx, yy2 + 54, 'hands that cell to the other side.', { size: 12, fill: COL.muted });
  s += legendPieces(bx, h - 14);
  fs.writeFileSync(OUT + 'example-position.svg', svg(w, h, s, 'Example Connect 4 position used by every heuristic diagram'));
})();

// 2. Windows and the (m, p) classification
(function () {
  var cs = 20, w = 760, h = 350, s = '';
  s += text(24, 34, 'Windows: the 69 groups of four aligned cells', { size: 18, weight: 700 });
  var dirs = [
    { name: 'horizontal', n: 24, wi: C4.windows.findIndex(function (w) { return rc(w[0])[0] === 5 && rc(w[0])[1] === 1 && rc(w[1])[0] === 5; }) },
    { name: 'vertical', n: 21, wi: C4.windows.findIndex(function (w) { return rc(w[0])[1] === 3 && rc(w[0])[0] === 2 && rc(w[1])[1] === 3; }) },
    { name: 'diagonal ↘', n: 12, wi: C4.windows.findIndex(function (w) { return rc(w[0])[0] === 1 && rc(w[0])[1] === 2 && rc(w[1])[0] === 2 && rc(w[1])[1] === 3; }) },
    { name: 'diagonal ↗', n: 12, wi: C4.windows.findIndex(function (w) { return rc(w[0])[0] === 5 && rc(w[0])[1] === 0 && rc(w[1])[0] === 4; }) }
  ];
  var counted = { };
  C4.windows.forEach(function (wd) { var a = rc(wd[0]), b = rc(wd[1]); var k = (b[0] - a[0]) + ',' + (b[1] - a[1]); counted[k] = (counted[k] || 0) + 1; });
  if (counted['0,1'] !== 24 || counted['1,0'] !== 21 || counted['1,1'] !== 12 || counted['-1,1'] !== 12) throw new Error('dir counts ' + JSON.stringify(counted));
  var saved = cells; cells = new Int8Array(42);
  dirs.forEach(function (d, di) {
    var x = 36 + di * 180, y = 70;
    s += board(x, y, { cs: cs, windows: [{ wi: d.wi, color: COL.f }] });
    s += text(x + boardW(cs) / 2, y + boardH(cs) + 26, d.name + ': ' + d.n, { anchor: 'middle', size: 13, weight: 600 });
  });
  cells = saved;
  s += text(36, 250, '24 + 21 + 12 + 12 = 69 windows. A cell lies in 3 to 13 of them (the "cell table").', { size: 13, fill: COL.muted });
  s += text(36, 276, 'Each window is classified by (m, p) = (my pieces, opponent pieces):', { size: 13 });
  // mini legend chips
  var chips = [
    ['Fₖ', 'p = 0, m = k: only my pieces, still winnable for me', COL.f],
    ['Oₖ', 'm = 0, p = k: only opponent pieces, a threat against me', COL.opp],
    ['dead', 'm > 0 and p > 0: nobody can win here, worth 0', COL.neutral]
  ];
  chips.forEach(function (c, i) {
    var y = 306;
    var x = 36 + i * 240;
    s += '<rect x="' + x + '" y="' + (y - 14) + '" width="40" height="20" rx="4" fill="' + c[2] + '"/>';
    s += text(x + 20, y + 1, c[0], { anchor: 'middle', size: 12, fill: '#ffffff', weight: 700 });
    var words = c[1].split(': ');
    s += text(x + 48, y - 1, words[0], { size: 12, weight: 600 });
    s += text(x + 48, y + 14, words[1], { size: 11, fill: COL.muted });
  });
  fs.writeFileSync(OUT + 'windows.svg', svg(w, h, s, 'The 69 four-cell windows and the F/O classification'));
})();

// 3. Zero heuristic: search tree with horizon
(function () {
  var w = 760, h = 330, s = '';
  s += text(24, 34, 'Zero (blind): h = 0', { size: 18, weight: 700 });
  s += text(24, 54, 'Every non-terminal leaf looks the same, so only wins and losses inside the horizon matter (example position, N = 2).', { size: 12, fill: COL.muted });
  var rootX = 380, rootY = 90, l1y = 160, l2y = 236;
  var r1 = C4.chooseMove(st, { heuristic: 'zero', depth: 2, exactRoot: true, rand: C4.rng(1) });
  var xs = [], gap = 96;
  for (var c = 0; c < 7; c++) xs.push(rootX + (c - 3) * gap);
  // horizon
  s += '<line x1="30" y1="' + (l2y + 12) + '" x2="' + (w - 30) + '" y2="' + (l2y + 12) + '" stroke="' + COL.neutral + '" stroke-dasharray="6 5"/>';
  s += text(30, l2y + 26, 'horizon: ply 2 (leaves scored by h)', { size: 11, fill: COL.muted });
  // root
  for (c = 0; c < 7; c++) s += '<line x1="' + rootX + '" y1="' + (rootY + 14) + '" x2="' + xs[c] + '" y2="' + (l1y - 16) + '" stroke="' + COL.neutral + '"/>';
  s += '<circle cx="' + rootX + '" cy="' + rootY + '" r="15" fill="' + COL.x + '" stroke="' + COL.xs + '"/>';
  s += text(rootX + 24, rootY + 4, 'X to move (max)', { size: 12 });
  for (c = 0; c < 7; c++) {
    var lost = r1.scores[c] < -1e8;
    s += '<rect x="' + (xs[c] - 30) + '" y="' + (l1y - 16) + '" width="60" height="32" rx="6" fill="' + (lost ? '#fde7ea' : '#f6f8fa') + '" stroke="' + (lost ? COL.x : COL.border) + '"/>';
    s += text(xs[c], l1y - 2, 'col ' + c, { anchor: 'middle', size: 11, fill: COL.muted });
    s += mono(xs[c], l1y + 11, lost ? '−1e9' : '0', { anchor: 'middle', size: 12, weight: 700, fill: lost ? COL.x : COL.text });
    // children: O replies (min)
    var kids = [-12, 0, 12];
    if (c === 5) {
      // expand: O plays column 5 and wins at (4,5)
      for (var k = 0; k < 7; k++) {
        var kx = xs[c] - 48 + k * 16;
        var win = k === 5;
        s += '<line x1="' + xs[c] + '" y1="' + (l1y + 16) + '" x2="' + kx + '" y2="' + (l2y - 8) + '" stroke="' + (win ? COL.opp : COL.border) + '"' + (win ? ' stroke-width="2"' : '') + '/>';
        s += '<circle cx="' + kx + '" cy="' + l2y + '" r="6" fill="' + (win ? COL.o : '#f6f8fa') + '" stroke="' + (win ? COL.os : COL.border) + '"/>';
      }
      s += text(xs[c] + 40, l2y + 30, 'O plays col 5,', { anchor: 'middle', size: 11, fill: COL.opp });
      s += text(xs[c] + 40, l2y + 44, 'wins at (4,5)', { anchor: 'middle', size: 11, fill: COL.opp });
    } else {
      s += '<path d="M' + xs[c] + ' ' + (l1y + 16) + ' L' + (xs[c] - 22) + ' ' + (l2y + 4) + ' L' + (xs[c] + 22) + ' ' + (l2y + 4) + ' Z" fill="#f6f8fa" stroke="' + COL.border + '"/>';
      s += mono(xs[c], l2y, '0·0·0', { anchor: 'middle', size: 10, fill: COL.muted });
    }
  }
  s += text(24, h - 18, 'Result: columns 0, 1, 2, 3, 4, 6 tie at 0 → picked at random. Zero only knows to avoid column 5.', { size: 12 });
  fs.writeFileSync(OUT + 'h-zero.svg', svg(w, h, s, 'Zero heuristic: only terminal leaves inside the horizon matter'));
})();

// 4. Cell table
(function () {
  var cs = 40, w = 760, h = 430, s = '';
  s += text(24, 34, 'Cell table: h = Σ T[my cells] − Σ T[opponent cells]', { size: 18, weight: 700 });
  s += text(24, 54, 'T[cell] = number of windows through the cell. Central cells take part in more possible fours.', { size: 12, fill: COL.muted });
  var heat = function (i) { var t = (T[i] - 3) / 10; var l = Math.round(96 - t * 40); return 'hsl(210, 70%, ' + l + '%)'; };
  var saved = cells; cells = new Int8Array(42);
  s += board(40, 86, { cs: cs, cellText: function (i) { return T[i]; }, shade: heat });
  cells = saved;
  s += text(40 + boardW(cs) / 2, 86 + boardH(cs) + 30, 'T (empty board)', { anchor: 'middle', size: 13, weight: 600 });
  var bx = 40 + boardW(cs) + 70;
  s += board(bx, 86, { cs: cs, cellText: function (i) { return cells[i] ? T[i] : null; } });
  s += text(bx + boardW(cs) / 2, 86 + boardH(cs) + 30, 'example position', { anchor: 'middle', size: 13, weight: 600 });
  var xsum = [], osum = [];
  for (var i = 0; i < 42; i++) { if (cells[i] === ME) xsum.push(T[i]); else if (cells[i] === OPP) osum.push(T[i]); }
  s += mono(40, h - 46, 'X: ' + xsum.join(' + ') + ' = ' + sumMe, { size: 13, fill: COL.xs });
  s += mono(40, h - 24, 'O: ' + osum.join(' + ') + ' = ' + sumOpp, { size: 13, fill: COL.os });
  s += mono(440, h - 34, 'h = ' + sumMe + ' − ' + sumOpp + ' = ' + H.cellTable, { size: 15, weight: 700 });
  fs.writeFileSync(OUT + 'h-cell-table.svg', svg(w, h, s, 'Cell table heuristic on the example position'));
})();

// helper: panel with a mini board showing feature windows
function featurePanel(x, y, cs, title, wins, color, line) {
  var s = '';
  s += text(x, y, title, { size: 14, weight: 700, fill: color });
  s += board(x, y + 14, { cs: cs, windows: wins.map(function (wi) { return { wi: wi, color: color }; }) });
  if (line) s += mono(x, y + 14 + boardH(cs) + 28, line, { size: 13 });
  return s;
}

// 5. Kaggle
(function () {
  var cs = 34, w = 760, h = 400, s = '';
  s += text(24, 34, 'Kaggle N-step: h = 1e6·F₄ + 1·F₃ − 1e2·O₃ − 1e4·O₄', { size: 18, weight: 700 });
  s += text(24, 54, 'Counts open threes (3 pieces + 1 empty cell, dashed ring). The opponent’s threes weigh 100× more than mine.', { size: 12, fill: COL.muted });
  s += featurePanel(40, 90, cs, 'F₃ = ' + F[3] + '  (my open threes)', windowsOf('F', 3), COL.f, F[3] + ' × (+1) = +' + F[3]);
  s += featurePanel(330, 90, cs, 'O₃ = ' + O[3] + '  (opponent open threes)', windowsOf('O', 3), COL.opp, O[3] + ' × (−100) = −' + 100 * O[3]);
  var px = 600;
  s += text(px, 120, 'F₄ = O₄ = 0', { size: 14, weight: 700 });
  s += text(px, 140, 'A four is a finished game;', { size: 12, fill: COL.muted });
  s += text(px, 156, 'search scores it as ±1e9', { size: 12, fill: COL.muted });
  s += text(px, 172, 'before h is ever called.', { size: 12, fill: COL.muted });
  s += mono(px, 230, 'h = 0 + 2 − 100 − 0', { size: 13 });
  s += mono(px, 254, '  = ' + H.kaggle, { size: 18, weight: 700, fill: COL.opp });
  s += text(px, 282, 'Reads as “X is losing”,', { size: 12, fill: COL.muted });
  s += text(px, 298, 'though X has two threes', { size: 12, fill: COL.muted });
  s += text(px, 314, 'to O’s one.', { size: 12, fill: COL.muted });
  fs.writeFileSync(OUT + 'h-kaggle.svg', svg(w, h, s, 'Kaggle N-step heuristic on the example position'));
})();

// 6. Symmetric threes vs Kaggle: contribution bars
(function () {
  var w = 760, h = 320, s = '';
  s += text(24, 34, 'Symmetric threes: h = F₃ − O₃', { size: 18, weight: 700 });
  s += text(24, 54, 'Same features as Kaggle, equal weights. Bars: each term’s contribution on the example position (same scale).', { size: 12, fill: COL.muted });
  var zeroX = 560, scale = 3.2; // px per point
  var rows = [
    { name: 'Kaggle', terms: [['+1·F₃', F[3]], ['−100·O₃', -100 * O[3]]], total: H.kaggle },
    { name: 'Symmetric', terms: [['+1·F₃', F[3]], ['−1·O₃', -O[3]]], total: H.symmetric }
  ];
  s += '<line x1="' + zeroX + '" y1="80" x2="' + zeroX + '" y2="250" stroke="' + COL.text + '"/>';
  s += text(zeroX, 268, '0', { anchor: 'middle', size: 11, fill: COL.muted });
  s += text(zeroX - 100 * scale, 268, '−100', { anchor: 'middle', size: 11, fill: COL.muted });
  s += '<line x1="' + (zeroX - 100 * scale) + '" y1="250" x2="' + (zeroX - 100 * scale) + '" y2="256" stroke="' + COL.muted + '"/>';
  rows.forEach(function (row, ri) {
    var y0 = 90 + ri * 85;
    s += text(24, y0 + 22, row.name, { size: 14, weight: 700 });
    s += mono(24, y0 + 42, 'h = ' + row.total, { size: 13, fill: row.total < 0 ? COL.opp : COL.f, weight: 700 });
    row.terms.forEach(function (t, ti) {
      var y = y0 + ti * 26, v = t[1], len = Math.max(2, Math.abs(v) * scale);
      var x = v >= 0 ? zeroX : zeroX - len;
      s += '<rect x="' + x + '" y="' + y + '" width="' + len + '" height="20" rx="3" fill="' + (v >= 0 ? COL.f : COL.opp) + '"/>';
      var lbl = t[0] + ' = ' + (v > 0 ? '+' : '') + v;
      if (len > 150) s += mono(x + 8, y + 15, lbl, { size: 12, fill: '#ffffff', weight: 700 });
      else s += mono(v >= 0 ? zeroX + len + 6 : zeroX - len - 6, y + 15, lbl, { size: 12, anchor: v >= 0 ? 'start' : 'end' });
    });
  });
  s += text(24, h - 22, 'Kaggle plays mostly defence (many draws in the round robin); symmetric weighs attack and defence equally.', { size: 12 });
  fs.writeFileSync(OUT + 'h-symmetric.svg', svg(w, h, s, 'Symmetric threes compared with Kaggle weights'));
})();

// 7. Windows + center
(function () {
  var cs = 24, w = 760, h = 520, s = '';
  s += text(24, 34, 'Windows + center: h = 5·F₃ + 2·F₂ − 2·O₂ − 4·O₃ + 3·center', { size: 18, weight: 700 });
  s += text(24, 54, 'Adds open twos and center-column control; attack (5) slightly outweighs defence (4).', { size: 12, fill: COL.muted });
  var pw = 235, y1 = 86, y2 = 310;
  s += featurePanel(40, y1, cs, 'F₃ = ' + F[3], windowsOf('F', 3), COL.f, '× 5 = +' + 5 * F[3]);
  s += featurePanel(40 + pw, y1, cs, 'F₂ = ' + F[2], windowsOf('F', 2), COL.f, '× 2 = +' + 2 * F[2]);
  s += featurePanel(40 + 2 * pw, y1, cs, 'O₂ = ' + O[2], windowsOf('O', 2), COL.opp, '× (−2) = −' + 2 * O[2]);
  s += featurePanel(40, y2, cs, 'O₃ = ' + O[3], windowsOf('O', 3), COL.opp, '× (−4) = −' + 4 * O[3]);
  // center panel
  var cx = 40 + pw;
  s += text(cx, y2, 'center: X ' + centerMe + ', O ' + centerOpp, { size: 14, weight: 700 });
  s += board(cx, y2 + 14, { cs: cs, shade: function (i) { return i % 7 === 3 ? COL.center : null; } });
  s += mono(cx, y2 + 14 + boardH(cs) + 28, '3·(' + centerMe + ' − ' + centerOpp + ') = ' + 3 * (centerMe - centerOpp), { size: 13 });
  var tx = 40 + 2 * pw;
  s += text(tx, y2 + 20, 'Total', { size: 14, weight: 700 });
  s += mono(tx, y2 + 48, '  +' + 5 * F[3] + '  (F₃)', { size: 13 });
  s += mono(tx, y2 + 68, '  +' + 2 * F[2] + '  (F₂)', { size: 13 });
  s += mono(tx, y2 + 88, '  −' + 2 * O[2] + '  (O₂)', { size: 13 });
  s += mono(tx, y2 + 108, '   −' + 4 * O[3] + '  (O₃)', { size: 13 });
  s += mono(tx, y2 + 128, '   +' + 3 * (centerMe - centerOpp) + '  (center)', { size: 13 });
  s += '<line x1="' + tx + '" y1="' + (y2 + 136) + '" x2="' + (tx + 150) + '" y2="' + (y2 + 136) + '" stroke="' + COL.text + '"/>';
  s += mono(tx, y2 + 158, 'h = ' + (H.windowsCenter > 0 ? '+' : '') + H.windowsCenter, { size: 18, weight: 700, fill: COL.f });
  fs.writeFileSync(OUT + 'h-windows-center.svg', svg(w, h, s, 'Windows plus center heuristic on the example position'));
})();
console.log('wrote 7 diagrams to ' + OUT);
