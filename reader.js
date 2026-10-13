// ==NORMALIZE START==
// Rewrites numbers / years / currency / percents into words so the speech engine
// reads them the same way every time. Every replaced chunk keeps a map back to
// the original text, so highlighting still lines up.
const ZD = '零一二三四五六七八九'.split('');
const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve',
  'thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const SCALES = ['','thousand','million','billion','trillion'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON_RE = MONTHS.join('|') + '|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';

const digitsEn = s => [...s].map(c => ONES[+c]).join(' ');
const digitsZh = s => [...s].map(c => ZD[+c]).join('');

function below1000En(n){
  const p = [];
  if (n >= 100){ p.push(ONES[Math.floor(n / 100)] + ' hundred'); n %= 100; }
  if (n >= 20) p.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
  else if (n > 0) p.push(ONES[n]);
  return p.join(' ');
}
function intEn(s){
  let n = Number(s);
  if (n === 0) return 'zero';
  const parts = []; let i = 0;
  while (n > 0){
    const g = n % 1000;
    if (g) parts.unshift(below1000En(g) + (SCALES[i] ? ' ' + SCALES[i] : ''));
    n = Math.floor(n / 1000); i++;
  }
  return parts.join(' ');
}
function numEn(i, d, neg){
  let w = (i.length > 1 && i[0] === '0') || i.length > 12 ? digitsEn(i) : intEn(i);
  if (d) w += ' point ' + digitsEn(d);
  return (!neg ? '' : neg === '+' ? 'plus ' : 'negative ') + w;
}
function ordEn(n){
  const w = intEn(String(n));
  const irr = {one:'first',two:'second',three:'third',five:'fifth',eight:'eighth',nine:'ninth',twelve:'twelfth',zero:'zeroth'};
  return w.replace(/([a-z]+)$/, (_, last) => irr[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th'));
}
function yearEn(y){
  y = +y;
  if (y >= 2000 && y < 2010) return y === 2000 ? 'two thousand' : 'two thousand ' + ONES[y - 2000];
  const hi = Math.floor(y / 100), lo = y % 100, hw = intEn(String(hi));
  if (lo === 0) return hw + ' hundred';
  if (lo < 10) return hw + ' oh ' + ONES[lo];
  return hw + ' ' + intEn(String(lo));
}

function g4Zh(x){
  const u = ['', '十', '百', '千'], ds = String(x).padStart(4, '0');
  let out = '', zero = false;
  for (let k = 0; k < 4; k++){
    const d = +ds[k];
    if (d === 0){ if (out) zero = true; }
    else { if (zero){ out += '零'; zero = false; } out += ZD[d] + u[3 - k]; }
  }
  return out;
}
function intZh(s){
  let n = Number(s);
  if (n === 0) return '零';
  const groups = [];
  while (n > 0){ groups.push(n % 10000); n = Math.floor(n / 10000); }
  const units = ['', '万', '亿', '万亿'];
  let out = '', pending = false;
  for (let k = groups.length - 1; k >= 0; k--){
    const g = groups[k];
    if (g === 0){ pending = out !== ''; continue; }
    let seg = g4Zh(g);
    if (g === 2 && k >= 1) seg = '两';
    if (out && (pending || g < 1000)) out += '零';
    out += seg + units[k]; pending = false;
  }
  return out.startsWith('一十') ? out.slice(1) : out;
}
function numZh(i, d, liang){
  let w = (i.length > 1 && i[0] === '0') || i.length > 12 ? digitsZh(i) : intZh(i);
  if (liang && w === '二') w = '两';
  if (d) w += '点' + digitsZh(d);
  return w;
}

const signZh = c => !c ? '' : c === '+' ? '正' : '负';
const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const parse = s => { const [i, d = ''] = s.replace(/,/g, '').split('.'); return { i, d }; };
const esc = s => s.replace(/[$¥￥€£]/g, c => '\\' + c);

// [english name, chinese name, has cents]
const CUR = {
  '$':['dollar','美元',1], 'US$':['US dollar','美元',1], 'USD':['US dollar','美元',1],
  'HK$':['Hong Kong dollar','港元',1], 'HKD':['Hong Kong dollar','港元',1],
  'A$':['Australian dollar','澳元',1], 'C$':['Canadian dollar','加元',1],
  'S$':['Singapore dollar','新加坡元',1], 'NT$':['New Taiwan dollar','新台币',1],
  '€':['euro','欧元',1], 'EUR':['euro','欧元',1], '£':['pound','英镑',1], 'GBP':['pound','英镑',1],
  '¥':['yen','元',0], '￥':['yen','元',0], 'JPY':['yen','日元',0],
  'CN¥':['yuan','元',0], 'CNY':['yuan','元',0], 'RMB':['yuan','元',0],
};
const CODE = Object.keys(CUR).sort((a, b) => b.length - a.length).map(esc).join('|');
const SC_EN = { k:'thousand', m:'million', mn:'million', b:'billion', bn:'billion', t:'trillion', tn:'trillion' };
const SC_ZH = { thousand:'千', million:'百万', billion:'十亿', trillion:'万亿' };
const NOT_LETTER = '(?<![A-Za-z])', NO_LETTER_AFTER = '(?![A-Za-z])';
const ZH_LIANG = /^(个|只|条|位|名|家|项|次|倍|件|天|周|岁|年|小时|万|亿|千|百)/;
const ZH_YEAR_SUFFIX = '(?=\\s?(?:年|财年|年度))';

const RULES = {
  en: [
    // ISO date -> "March fifth, twenty twenty-four"
    { pri:0, re:/(?<![\d.,\-\/])((?:19|20)\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])(?!\d)/g,
      fn:m => `${MONTHS[+m[2] - 1]} ${ordEn(+m[3])}, ${yearEn(m[1])}` },
    { pri:1, re:new RegExp(`(?:(?<!\\w)[-−])?${NOT_LETTER}(${CODE})\\s?(-)?${NUM}(?:\\s(thousand|million|billion|trillion)|(bn|mn|tn|[kKmMbBtT]))?${NO_LETTER_AFTER}`, 'g'),
      fn:m => {
        const [name, , cents] = CUR[m[1]], { i, d } = parse(m[3]);
        const scale = m[4] ? m[4].toLowerCase() : m[5] ? SC_EN[m[5].toLowerCase()] : '';
        const neg = m[2] || /^[-−]/.test(m[0]) ? 'negative ' : '';
        const plural = (n, one) => (one || n === 'yen' || n === 'yuan') ? n : n + 's';
        if (!scale && cents && (d.length === 0 || d.length === 2)){
          const c = +d || 0, whole = i.length > 12 ? digitsEn(i) : intEn(i);
          if (i === '0' && c > 0) return neg + intEn(String(c)) + (c === 1 ? ' cent' : ' cents');
          return neg + whole + ' ' + plural(name, i === '1') + (c > 0 ? ' and ' + intEn(String(c)) + (c === 1 ? ' cent' : ' cents') : '');
        }
        return neg + numEn(i, d) + (scale ? ' ' + scale : '') + ' ' + plural(name, false);
      } },
    { pri:2, re:new RegExp(`(?<![\\w.,])([-+−])?${NUM}\\s?[%％]`, 'g'),
      fn:m => { const { i, d } = parse(m[2]); return numEn(i, d, m[1]) + ' percent'; } },
    { pri:3, re:/(?<![\d.,])((?:19|20)\d{2})\s?[-–—]\s?((?:19|20)\d{2})(?!\d)/g,
      fn:m => `${yearEn(m[1])} to ${yearEn(m[2])}` },
    { pri:4, re:new RegExp(`(?<=(?:\\b(?:in|since|by|from|until|till|through|during|year|years|fiscal|before|after|early|late|mid|end|and|between|H[12]|Q[1-4]|${MON_RE})\\.?,?\\s+|\\b(?:${MON_RE})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+|\\bFY\\s?))((?:19|20)\\d{2})(?!\\d|[.,]\\d)`, 'gi'),
      fn:m => yearEn(m[1]) },
    { pri:5, re:/(?<![\w.,])(\d+)(st|nd|rd|th)\b/gi, fn:m => ordEn(+m[1]) },
    { pri:6, re:new RegExp(`(?<![\\w.,\\-−])${NUM}\\s?[-–—~～]\\s?${NUM}(\\s?[%％])?(?!\\d)`, 'g'),
      fn:m => {
        const a = parse(m[1]), b = parse(m[2]);
        if (!(Number(b.i + '.' + (b.d || 0)) > Number(a.i + '.' + (a.d || 0))) || (b.i.length > 1 && b.i[0] === '0')) return null;
        return numEn(a.i, a.d) + ' to ' + numEn(b.i, b.d) + (m[3] ? ' percent' : '');
      } },
    { pri:7, re:/(?<![A-Za-z])bps?(?![A-Za-z])/gi, fn:() => 'basis points' },
    { pri:7, re:/(?<![A-Za-z])YoY(?![A-Za-z])/gi, fn:() => 'year over year' },
    { pri:7, re:/(?<![A-Za-z])QoQ(?![A-Za-z])/gi, fn:() => 'quarter over quarter' },
    { pri:7, re:/(?<![A-Za-z])MoM(?![A-Za-z])/gi, fn:() => 'month over month' },
    { pri:7, re:/(?<![A-Za-z])YTD(?![A-Za-z])/gi, fn:() => 'year to date' },
    { pri:8, re:new RegExp(`(?<![\\d.,])(?:(?<!\\w)([-+−]))?${NUM}`, 'g'),
      fn:m => { const { i, d } = parse(m[2]); return numEn(i, d, m[1]); } },
  ],
  zh: [
    { pri:0, re:/(?<![\d.,\-\/])((?:19|20)\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])(?!\d)/g,
      fn:m => `${digitsZh(m[1])}年${intZh(m[2])}月${intZh(m[3])}日` },
    { pri:1, re:new RegExp(`(?:(?<!\\w)[-−])?${NOT_LETTER}(${CODE})\\s?(-)?${NUM}(?:(万亿|亿|万|千|百)|(bn|mn|tn|[kKmMbBtT])|\\s(thousand|million|billion|trillion))?(?:元)?${NO_LETTER_AFTER}`, 'g'),
      fn:m => {
        const cur = CUR[m[1]][1], { i } = parse(m[3]);
        const d = parse(m[3]).d.replace(/0+$/, '');
        const unit = m[4] || (m[5] ? SC_ZH[SC_EN[m[5].toLowerCase()]] : m[6] ? SC_ZH[m[6].toLowerCase()] : '');
        return (m[2] || /^[-−]/.test(m[0]) ? '负' : '') + numZh(i, d) + unit + cur;
      } },
    { pri:2, re:new RegExp(`(?<![\\w.,])([-+−])?${NUM}\\s?[%％]`, 'g'),
      fn:m => { const { i, d } = parse(m[2]); return signZh(m[1]) + '百分之' + numZh(i, d); } },
    { pri:3, re:new RegExp(`(?<![\\d.,])((?:19|20)\\d{2})\\s?[-–—~～]\\s?((?:19|20)\\d{2})(?!\\d)${ZH_YEAR_SUFFIX}`, 'g'),
      fn:m => `${digitsZh(m[1])}至${digitsZh(m[2])}` },
    { pri:4, re:new RegExp(`(?<![\\d.,])((?:19|20)\\d{2})(?!\\d)${ZH_YEAR_SUFFIX}`, 'g'), fn:m => digitsZh(m[1]) },
    { pri:4, re:/(?<=\bFY\s?)((?:19|20)\d{2})(?!\d)/gi, fn:m => digitsZh(m[1]) },
    { pri:6, re:new RegExp(`(?<![\\w.,\\-−])${NUM}\\s?[-–—~～]\\s?${NUM}(\\s?[%％])?(?!\\d)`, 'g'),
      fn:m => {
        const a = parse(m[1]), b = parse(m[2]);
        if (!(Number(b.i + '.' + (b.d || 0)) > Number(a.i + '.' + (a.d || 0))) || (b.i.length > 1 && b.i[0] === '0')) return null;
        return (m[3] ? '百分之' : '') + numZh(a.i, a.d) + '至' + numZh(b.i, b.d);
      } },
    { pri:7, re:/(?<=\d\s?)bps?(?![A-Za-z])/gi, fn:() => '个基点' },
    { pri:7, re:/(?<![A-Za-z])YoY(?![A-Za-z])/gi, fn:() => '同比' },
    { pri:7, re:/(?<![A-Za-z])QoQ(?![A-Za-z])/gi, fn:() => '环比' },
    { pri:8, re:new RegExp(`(?<![\\d.,])(?:(?<!\\w)([-+−]))?${NUM}`, 'g'),
      fn:(m, str) => {
        const { i, d } = parse(m[2]);
        const liang = i === '2' && !d && !m[1] && ZH_LIANG.test(str.slice(m.index + m[0].length, m.index + m[0].length + 2));
        return signZh(m[1]) + numZh(i, d, liang);
      } },
  ],
};

// Times, dates, GMT offsets, tickers, quarters, markdown clean-up.
const SPELL_SKIP = new Set(['NASDAQ','NATO','OPEC','EBITDA','NASA','ASEAN','OK','LIBOR']);
const QN = ['first','second','third','fourth'], QZ = ['一','二','三','四'];
function extraRules(mode){
  const zh = mode === 'zh';
  const spell = w => [...w].join(' ');
  return [
    { pri:0, re:/(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?![\d:])(?:\s?([AaPp])\.?[Mm](?![A-Za-z])\.?)?/g,
      fn:m => {
        const h = +m[1], mi = +m[2], sec = m[3] ? +m[3] : null, pm = m[4] ? !/a/i.test(m[4]) : null;
        if (zh){
          let t = (pm === null ? '' : pm ? '下午' : '上午') + (h === 2 ? '两' : intZh(String(h))) + '点';
          if (mi === 0 && sec === null) t += '整';
          else t += (mi === 0 ? '零' : mi < 10 ? '零' + intZh(String(mi)) : intZh(String(mi))) + '分';
          if (sec !== null) t += intZh(String(sec)) + '秒';
          return t;
        }
        const hw = h === 0 ? 'zero' : intEn(String(h)), ap = pm === null ? '' : pm ? ' P M' : ' A M';
        let t = mi === 0 ? (ap ? hw : hw + " o'clock") : hw + ' ' + (mi < 10 ? 'oh ' + ONES[mi] : intEn(String(mi)));
        if (sec !== null) t += ' ' + intEn(String(sec)) + ' seconds';
        return t + ap;
      } },
    { pri:0, re:/(?<![A-Za-z])(GMT|UTC)\s?([+\-−])\s?(\d{1,2})(?::?([0-5]\d))?/g,
      fn:m => {
        const plus = m[2] === '+', h = String(+m[3]), mi = m[4] ? String(+m[4]) : '';
        return zh ? spell(m[1]) + (plus ? '加' : '减') + intZh(h) + (mi ? '点' + intZh(mi) + '分' : '')
                  : spell(m[1]) + (plus ? ' plus ' : ' minus ') + intEn(h) + (mi ? ' ' + intEn(mi) : '');
      } },
    // 10/09 -> October 9th / 10月9日
    { pri:0, re:/(?<![\d\/.\-])(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?![\d\/])/g,
      fn:m => zh ? intZh(String(+m[1])) + '月' + intZh(String(+m[2])) + '日' : MONTHS[+m[1] - 1] + ' ' + ordEn(+m[2]) },
    { pri:6, re:/(?<![A-Za-z])S&P(?![A-Za-z])/g, fn:() => zh ? '标普' : 'S and P' },
    { pri:6, re:/(?<![\w.,])(\d{1,2})Y(?![A-Za-z])/g, fn:m => zh ? intZh(m[1]) + '年期' : intEn(m[1]) + ' year' },
    { pri:6, re:/(?<![A-Za-z])Q([1-4])(?!\d)/g, fn:m => zh ? '第' + QZ[m[1] - 1] + '季度' : QN[m[1] - 1] + ' quarter' },
    { pri:6, re:/(?<![A-Za-z])H([12])(?!\d)/g, fn:m => zh ? (m[1] === '1' ? '上半年' : '下半年') : (m[1] === '1' ? 'first half' : 'second half') },
    // tickers / acronyms are spelled out letter by letter
    { pri:9, re:/(?<![A-Za-z0-9])[A-Z]{2,6}(?![A-Za-z])/g, fn:m => SPELL_SKIP.has(m[0]) ? null : spell(m[0]) },
    { pri:9, re:/(?<=[A-Za-z0-9\u4e00-\u9fff])\/(?=[A-Za-z\u4e00-\u9fff])/g, fn:() => zh ? '、' : ', ' },
    // markdown markers
    { pri:9, re:/^[ \t]*(?:#{1,6}|[-*•])[ \t]+|\*\*|__|`|\|/gm, fn:() => '' },
  ];
}
RULES.en.push(...extraRules('en'));
RULES.zh.push(...extraRules('zh'));

const modeOf = t => /[㐀-鿿]/.test(t) ? 'zh' : 'en';

function normalize(text, mode){
  const cands = [];
  for (const r of RULES[mode]){
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(text))){
      if (m[0] === ''){ r.re.lastIndex++; continue; }
      const sp = r.fn(m, text);
      if (sp != null) cands.push({ s:m.index, e:m.index + m[0].length, pri:r.pri, sp });
    }
  }
  cands.sort((a, b) => a.s - b.s || a.pri - b.pri || (b.e - b.s) - (a.e - a.s));
  let spoken = '', map = [], pos = 0;
  const pad = mode === 'en' ? ' ' : '';
  const plain = (a, b) => { for (let k = a; k < b; k++){ spoken += text[k]; map.push([k, k + 1, false]); } };
  for (const c of cands){
    if (c.s < pos) continue;
    plain(pos, c.s);
    const out = pad + c.sp + pad;
    spoken += out;
    for (let k = 0; k < out.length; k++) map.push([c.s, c.e, true]);
    pos = c.e;
  }
  plain(pos, text.length);
  return { spoken, map };
}
// ==NORMALIZE END==

// ---------- sentence splitting ----------
const ABBR = new Set('mr mrs ms dr prof inc ltd corp co vs etc eg ie no st jr sr fig approx est dept'.split(' '));
const CLOSERS = '。！？!?”’」』）)"\'';
function splitSegments(text){
  const segs = [];
  const push = (a, b) => {
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b > a && /[\p{L}\p{N}]/u.test(text.slice(a, b))) segs.push({ s:a, e:b });
  };
  const scan = (from, to) => {
    let start = from, i = from;
    while (i < to){
      const c = text[i];
      if (c === '\n'){ push(start, i); start = ++i; continue; }
      if ('。！？!?；;'.includes(c)){
        let j = i + 1; while (j < to && CLOSERS.includes(text[j])) j++;
        push(start, j); start = i = j; continue;
      }
      if (c === '.' && (i + 1 >= to || /\s/.test(text[i + 1]))){
        const w = ((text.slice(Math.max(start, i - 8), i).match(/([A-Za-z]+)$/) || [])[1] || '').toLowerCase();
        if (!ABBR.has(w) && w.length !== 1){
          let j = i + 1; while (j < to && CLOSERS.includes(text[j])) j++;
          push(start, j); start = i = j; continue;
        }
      }
      if (i - start >= 90 && ('，、：:'.includes(c) || (c === ',' && !/\d/.test(text[i + 1] || '')))){
        push(start, i + 1); start = ++i; continue;
      }
      i++;
    }
    push(start, to);
  };

  // Table detection: lines with tabs (copied from a web page) or markdown | pipes |.
  const lines = [];
  for (let p = 0; p <= text.length;){
    let q = text.indexOf('\n', p); if (q < 0) q = text.length;
    lines.push({ s:p, e:q }); p = q + 1;
  }
  const cellsOf = L => {
    const line = text.slice(L.s, L.e), raw = [];
    if (/^\s*\|.*\|\s*$/.test(line)){
      const last = line.lastIndexOf('|'); let pos = line.indexOf('|') + 1;
      while (pos <= last){ let nx = line.indexOf('|', pos); if (nx < 0 || nx > last) nx = last; raw.push([pos, nx]); pos = nx + 1; }
    } else if (line.includes('\t')){
      let pos = 0; for (const part of line.split('\t')){ raw.push([pos, pos + part.length]); pos += part.length + 1; }
    }
    return raw.map(([x, y]) => {
      while (x < y && /\s/.test(line[x])) x++;
      while (y > x && /\s/.test(line[y - 1])) y--;
      return { s:L.s + x, e:L.s + y };
    });
  };
  const tab = L => {
    const line = text.slice(L.s, L.e);
    if (!line.trim()) return null;
    const sep = /^\s*\|?[\s:\-|]+\|?\s*$/.test(line) && line.includes('-') && line.includes('|');
    const cells = cellsOf(L);
    if (!sep && cells.filter(c => c.e > c.s).length < 2) return null;
    return { sep, cells };
  };

  let regionStart = 0, i = 0;
  while (i < lines.length){
    if (!tab(lines[i])){ i++; continue; }
    const block = []; let j = i;
    for (let t; j < lines.length && (t = tab(lines[j])); j++) block.push({ L:lines[j], ...t });
    const rows = block.filter(b => !b.sep);
    if (block.length < 2 || !rows.length){ i = j; continue; }
    if (lines[i].s > regionStart) scan(regionStart, lines[i].s);
    const tbl = {
      mode: modeOf(text.slice(lines[i].s, lines[j - 1].e)),
      headers: rows[0].cells.map(c => text.slice(c.s, c.e)),
    };
    rows.forEach((b, r) => {
      let a = b.L.s, e = b.L.e;
      while (a < e && /\s/.test(text[a])) a++;
      while (e > a && /\s/.test(text[e - 1])) e--;
      if (e > a) segs.push({ s:a, e, table:tbl, cells:b.cells, skip:r === 0 });
    });
    regionStart = lines[j - 1].e; i = j;
  }
  if (text.length > regionStart) scan(regionStart, text.length);
  return segs;
}

// ---------- UI ----------
const $ = id => document.getElementById(id);
const input = $('input'), read = $('read'), playBtn = $('play'), speedSel = $('speed');
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const store = {
  get(k, d){ try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch {} },
};

SPEEDS.forEach(v => {
  const o = document.createElement('option');
  o.value = v; o.textContent = v === 1 ? '1× (normal)' : v + '×';
  speedSel.append(o);
});
speedSel.value = store.get('speed', '1');
if (!speedSel.value) speedSel.value = '1';

input.value = store.get('text', '');
const updateCount = () => { $('count').textContent = input.value.length.toLocaleString() + ' characters'; };
updateCount();

const SAMPLE = `2024年，公司实现营业收入1,234.56亿元，同比增长12.5%，净利润为￥85.3亿元。预计2025年的资本开支约为$2.5亿，较2023年下降3.2%。

In 2024, revenue rose 12.5% to $1,234.56 million, while net income was $85.3M. The Fed held rates at 5.25-5.50% on March 20, 2024, and the 10-year yield closed at 4.31%, up 15bps. Analysts expect FY2025 EPS of €3.07, about 1st-quarter levels.

大盘概况
指数/ETF	涨跌 (10/09)	价格	报价时间 (GMT+8)
S&P 500	+0.59%	7,811.54	10/10 05:30
SOX	-0.41%	12,572.42	10/10 05:16
10Y 收益率	—	5.24%	10/10 02:00

板块上，医疗 XLV +1.58%、金融 XLF +0.92% 领涨；亚洲 10/12 收盘（日经/恒生/上证）：待确认。`;

// tabs
let active = 'paste';
function showTab(t){
  active = t;
  $('tab-paste').setAttribute('aria-selected', t === 'paste');
  $('tab-read').setAttribute('aria-selected', t === 'read');
  $('paste').hidden = t !== 'paste';
  read.hidden = t !== 'read';
  if (t === 'read') buildRead(); else input.focus();
}
$('tab-paste').onclick = () => showTab('paste');
$('tab-read').onclick = () => showTab('read');

let dirty = true, text = '', segs = [];
input.addEventListener('input', () => { dirty = true; updateCount(); store.set('text', input.value); });
$('clear').onclick = () => { stopAll(); input.value = ''; dirty = true; updateCount(); store.set('text', ''); input.focus(); };
$('sample').onclick = () => { stopAll(); input.value = SAMPLE; dirty = true; updateCount(); store.set('text', SAMPLE); };

function buildRead(){
  if (!dirty) return;
  stopAll();
  text = input.value; dirty = false;
  segs = splitSegments(text);
  read.textContent = '';
  if (!segs.length){
    const e = document.createElement('div');
    e.className = 'empty'; e.textContent = 'Nothing to read yet — paste some text first.';
    read.append(e); return;
  }
  const frag = document.createDocumentFragment();
  let pos = 0;
  segs.forEach((g, k) => {
    if (g.s > pos) frag.append(text.slice(pos, g.s));
    const el = document.createElement('span');
    el.className = 'seg'; el.dataset.k = k;
    g.text = text.slice(g.s, g.e); el.textContent = g.text; g.el = el;
    frag.append(el); pos = g.e;
  });
  if (pos < text.length) frag.append(text.slice(pos));
  read.append(frag);
  updatePos();
}
read.addEventListener('click', e => {
  const el = e.target.closest('.seg');
  if (!el) return;
  let off = 0;
  try {
    let node, o;
    if (document.caretPositionFromPoint){ const c = document.caretPositionFromPoint(e.clientX, e.clientY); node = c && c.offsetNode; o = c && c.offset; }
    else if (document.caretRangeFromPoint){ const c = document.caretRangeFromPoint(e.clientX, e.clientY); node = c && c.startContainer; o = c && c.startOffset; }
    if (node && el.contains(node)){
      const r = document.createRange(); r.setStart(el, 0); r.setEnd(node, o);
      off = r.toString().length;
    }
  } catch {}
  speakFrom(+el.dataset.k, off);
});

// ---------- voices ----------
let voices = [];
// Higher = better default. Neural/premium voices first, plain system voices next,
// macOS novelty voices (robotic) last.
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Zarvox|Trinoids|Whisper|Organ|Albert|Jester|Fred|Junior|Kathy|Ralph|Superstar|Good News|Hysterical|Pipe Organ)\b/i;
function rank(v){
  let s = 0;
  if (/premium|enhanced|natural|neural|online/i.test(v.name)) s += 10;
  if (/ting-?ting|mei-?jia|sin-?ji|lili|xiaoxiao|xiaoyi|yunxi|yunyang|hsiaochen|samantha|daniel|karen|aria|jenny|guy/i.test(v.name)) s += 6;
  if (NOVELTY.test(v.name)) s -= 8;
  if (/^Google/i.test(v.name)) s += 9;   // Chrome's online voices sound much more natural (no word highlight though)
  if (/^zh-CN/i.test(v.lang)) s += 1;
  if (v.localService) s += 1;
  return s;
}
// Chinese sounds rushed at the engine's "1×", so calibrate the baseline lower.
const BASE_RATE = { zh: 0.8, en: 1 };
function fillVoices(){
  voices = speechSynthesis.getVoices();
  for (const [mode, selId, test, label] of [['zh', 'voice-zh', /^zh/i, '中文'], ['en', 'voice-en', /^en/i, 'English']]){
    const sel = $(selId), saved = store.get('voice-' + mode, '');
    const all = voices.filter(v => test.test(v.lang));
    const nice = all.filter(v => !NOVELTY.test(v.name));   // hide the robotic novelty voices
    const list = (nice.length ? nice : all).sort((a, b) => rank(b) - rank(a));
    sel.textContent = '';
    list.forEach(v => {
      const o = document.createElement('option');
      o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`; sel.append(o);
    });
    if (!list.length){
      const o = document.createElement('option'); o.textContent = 'none installed'; sel.append(o);
    } else if (saved && list.some(v => v.voiceURI === saved)) sel.value = saved;
  }
  const w = $('warn');
  const noZh = !voices.some(v => /^zh/i.test(v.lang));
  w.hidden = !(voices.length && noZh);
  if (!w.hidden) w.textContent = 'No Chinese voice found on this system. On macOS: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → add a Chinese voice.';
}
const PREVIEW = { zh:'2024年营业收入增长12.5%，净利润为85.3亿元，较10/09上涨。', en:'In 2024, revenue rose 12.5% to $1,234.56 million.' };
function preview(mode){
  if (!synth) return;
  stopAll();
  const u = new SpeechSynthesisUtterance(normalize(PREVIEW[mode], mode).spoken);
  const v = pickVoice(mode); if (v){ u.voice = v; u.lang = v.lang; } else u.lang = mode === 'zh' ? 'zh-CN' : 'en-US';
  u.rate = parseFloat(speedSel.value) * BASE_RATE[mode];
  utter = u;
  whenReady(() => synth.speak(u));
}
document.querySelectorAll('.pv').forEach(b => b.onclick = () => preview(b.dataset.mode));
for (const mode of ['zh', 'en']){
  $('voice-' + mode).onchange = e => {
    store.set('voice-' + mode, e.target.value);
    if (state === 'idle') preview(mode); else restartCurrent();
  };
}
function pickVoice(mode){
  const id = $(mode === 'zh' ? 'voice-zh' : 'voice-en').value;
  return voices.find(v => v.voiceURI === id) || null;
}

// ---------- playback ----------
const CPS = { zh:4.7, en:15 };   // spoken characters per second at rate 1 (auto-calibrated)
let curOffset = null, idx = 0, token = 0, state = 'idle', restartOnResume = false, utter = null, marked = null;
const synth = window.speechSynthesis;
if (!synth || !window.SpeechSynthesisUtterance){
  $('warn').hidden = false; $('warn').textContent = 'This browser has no speech synthesis. Try Safari, Chrome or Edge.';
} else {
  fillVoices();
  synth.addEventListener('voiceschanged', fillVoices);
}

// A table row is read as "first cell, header: value, header: value ..." so the
// listener knows which column each number belongs to.
function speakRow(seg){
  const t = seg.table, zh = t.mode === 'zh';
  let spoken = '', map = [];
  const add = (str, ent) => { for (let q = 0; q < str.length; q++) map.push(ent); spoken += str; };
  seg.cells.forEach((c, k) => {
    const a = Math.min(Math.max(0, c.s - seg.s), seg.text.length);
    const b = Math.min(Math.max(a, c.e - seg.s), seg.text.length);
    const raw = seg.text.slice(a, b), ent = [a, Math.max(b, a + 1), true];
    if (k === 0 && !raw.trim()) return;
    if (k > 0 && spoken) add(zh ? '，' : ', ', ent);
    const head = k > 0 && t.headers[k] ? normalize(t.headers[k], t.mode).spoken : '';
    if (head) add(head + (zh ? '：' : ': '), ent);
    if (/^[\s—–\-－]*$/.test(raw)) add(zh ? '无' : 'none', ent);
    else { const r = normalize(raw, t.mode); spoken += r.spoken; r.map.forEach(e => map.push([e[0] + a, e[1] + a, e[2]])); }
  });
  return { spoken, map };
}
// A cancelled-while-paused engine stays paused (Chrome/Safari), which makes every later
// utterance silent, so always resume after cancel. Speak straight away when idle: some
// browsers only allow speech started inside the click, not after a timeout.
function resetSynth(){ synth.cancel(); synth.resume(); }
function whenReady(fn){
  if (synth.speaking || synth.pending || synth.paused){ resetSynth(); setTimeout(fn, 80); }
  else fn();
}
function prepare(seg){
  if (seg.spoken != null) return;
  if (seg.table){
    const r = speakRow(seg);
    seg.mode = seg.table.mode; seg.spoken = r.spoken; seg.map = r.map; return;
  }
  seg.mode = modeOf(seg.text);
  const r = normalize(seg.text, seg.mode);
  seg.spoken = r.spoken; seg.map = r.map;
}

let segmenter = null;
try { segmenter = new Intl.Segmenter('zh', { granularity:'word' }); } catch {}
function wordRange(seg, spokenIdx){
  const ent = seg.map[Math.min(Math.max(spokenIdx, 0), seg.map.length - 1)];
  if (!ent) return null;
  if (ent[2]) return [ent[0], ent[1]];
  const t = seg.text, o = ent[0], ch = t[o];
  if (/[A-Za-z0-9'’]/.test(ch)){
    let a = o, b = o + 1;
    while (a > 0 && /[A-Za-z0-9'’]/.test(t[a - 1])) a--;
    while (b < t.length && /[A-Za-z0-9'’]/.test(t[b])) b++;
    return [a, b];
  }
  if (/[㐀-鿿]/.test(ch) && segmenter){
    if (!seg.words) seg.words = [...segmenter.segment(t)].map(x => [x.index, x.index + x.segment.length]);
    const w = seg.words.find(x => o >= x[0] && o < x[1]);
    if (w) return w;
  }
  return [o, o + 1];
}

function markSeg(k){
  if (marked != null && segs[marked]){
    const p = segs[marked];
    p.el.classList.remove('on'); p.el.textContent = p.text; p.hl = null; p.range = null;
  }
  marked = k;
  if (k == null || !segs[k]){ renderPip(); return; }
  segs[k].el.classList.add('on');
  if (active === 'read') segs[k].el.scrollIntoView({ block:'center', behavior:'smooth' });
  updatePos();
  renderPip();
}
function markWord(seg, spokenIdx){
  const r = wordRange(seg, spokenIdx);
  if (!r) return;
  const key = r[0] + ':' + r[1];
  if (seg.hl === key) return;
  seg.hl = key; seg.range = r;
  const mk = document.createElement('mark');
  mk.textContent = seg.text.slice(r[0], r[1]);
  seg.el.textContent = '';
  seg.el.append(seg.text.slice(0, r[0]), mk, seg.text.slice(r[1]));
  renderPip();
}

function updatePos(){
  $('pos').textContent = segs.length ? `${Math.min(idx + 1, segs.length)} / ${segs.length}` : '';
}
function setBtn(){
  playBtn.textContent = state === 'playing' ? '❚❚ Pause' : '▶ Play';
  if (pipWin){ const b = pipWin.document.getElementById('pplay'); if (b) b.textContent = state === 'playing' ? '❚❚' : '▶'; }
}

function speakCurrent(from){
  if (idx >= segs.length){ finish(); return; }
  const seg = segs[idx];
  if (seg.skip){ idx++; speakCurrent(); return; }
  prepare(seg);
  markSeg(idx);
  const my = token;
  // Start mid-sentence: drop everything before the word that was clicked.
  let skip = 0;
  curOffset = from || null;
  if (from > 0){
    let q = seg.map.findIndex(e => e[1] > from);
    if (q > 0){
      const r = wordRange(seg, q);
      if (r){ const q2 = seg.map.findIndex(e => e[1] > r[0]); if (q2 >= 0) q = q2; }
      skip = q;
    }
  }
  const u = new SpeechSynthesisUtterance(seg.spoken.slice(skip));
  u.lang = seg.mode === 'zh' ? 'zh-CN' : 'en-US';
  const v = pickVoice(seg.mode); if (v){ u.voice = v; u.lang = v.lang; }
  u.rate = parseFloat(speedSel.value) * BASE_RATE[seg.mode];
  // Some voices (Chrome's online "Google" ones) never report word positions. When no
  // boundary event arrives, estimate the position from elapsed time instead; the
  // speed estimate is refined after every sentence.
  const ctx = { got:false, active:0, last:0, id:0 };
  u.onstart = () => {
    if (my !== token) return;
    ctx.last = performance.now();
    const cps = CPS[seg.mode] * u.rate;
    ctx.id = setInterval(() => {
      if (my !== token || ctx.got){ clearInterval(ctx.id); return; }
      const now = performance.now();
      if (state === 'playing') ctx.active += now - ctx.last;
      ctx.last = now;
      const p = Math.min(Math.floor(ctx.active / 1000 * cps), seg.spoken.length - skip - 1) + skip;
      markWord(seg, p);
      const r = wordRange(seg, p); if (r) curOffset = r[0];
    }, 100);
  };
  u.onboundary = e => {
    if (my !== token || (e.name && e.name !== 'word')) return;
    ctx.got = true;
    markWord(seg, e.charIndex + skip);
    const r = wordRange(seg, e.charIndex + skip); if (r) curOffset = r[0];
  };
  u.onend = () => {
    clearInterval(ctx.id);
    if (my !== token) return;
    if (!ctx.got && ctx.active > 600){
      const measured = (seg.spoken.length - skip) / (ctx.active / 1000) / u.rate;
      CPS[seg.mode] = Math.min(Math.max(CPS[seg.mode] * 0.6 + measured * 0.4, 2), 30);
    }
    idx++; speakCurrent();
  };
  u.onerror = e => {
    clearInterval(ctx.id);
    if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return;
    $('warn').hidden = false; $('warn').textContent = 'Speech error: ' + e.error + ' (voice: ' + (u.voice ? u.voice.name : 'default') + ')';
    if (e.error === 'not-allowed'){ state = 'idle'; setBtn(); return; }   // needs a click first
    idx++; speakCurrent();
  };
  utter = u; // keep a reference so it is not garbage collected mid-speech
  synth.speak(u);
}
function speakFrom(k, off){
  if (active !== 'read') showTab('read');
  if (!segs.length) return;
  token++;
  idx = Math.max(0, Math.min(k, segs.length - 1));
  state = 'playing'; restartOnResume = false; setBtn();
  const my = token;
  whenReady(() => { if (my === token) speakCurrent(off); });
}
function finish(){
  token++; state = 'idle'; idx = 0; markSeg(null); setBtn(); updatePos();
}
function stopAll(){
  token++;
  if (synth) resetSynth();
  state = 'idle'; idx = 0; restartOnResume = false;
  markSeg(null); setBtn(); updatePos();
}
function restartCurrent(){
  if (state === 'playing') speakFrom(idx, curOffset);
  else if (state === 'paused'){ token++; resetSynth(); restartOnResume = true; }
}
function togglePlay(){
  if (active === 'paste') showTab('read');
  if (state === 'idle') speakFrom(idx);
  // Pause = stop and remember the word, resume = restart from that word. The engine's own
  // pause() is ignored by Chrome's online voices and breaks resume on others.
  else if (state === 'playing'){ token++; resetSynth(); state = 'paused'; restartOnResume = true; setBtn(); }
  else if (state === 'paused'){ restartOnResume = false; speakFrom(idx, curOffset); }
}

playBtn.onclick = togglePlay;
$('stop').onclick = stopAll;
$('prev').onclick = () => { if (state === 'idle'){ idx = Math.max(0, idx - 1); markSeg(idx); } else speakFrom(idx - 1); };
$('next').onclick = () => { if (state === 'idle'){ idx = Math.min(segs.length - 1, idx + 1); markSeg(idx); } else speakFrom(idx + 1); };
speedSel.onchange = () => {
  store.set('speed', speedSel.value); restartCurrent();
  if (pipWin){ const sel = pipWin.document.getElementById('pspeed'); if (sel) sel.value = speedSel.value; }
};

document.addEventListener('keydown', e => {
  const t = e.target.tagName;
  if (t === 'TEXTAREA' || t === 'SELECT' || e.metaKey || e.ctrlKey) return;
  if (e.code === 'Space'){ e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowRight') $('next').click();
  else if (e.code === 'ArrowLeft') $('prev').click();
});
window.addEventListener('beforeunload', () => { if (synth) resetSynth(); });
// ---------- floating window (Document Picture-in-Picture, Chrome / Edge) ----------
let pipWin = null;
function renderPip(){
  if (!pipWin) return;
  const d = pipWin.document, pt = d.getElementById('pt'), pn = d.getElementById('pn');
  if (!pt) return;
  const seg = marked != null ? segs[marked] : null;
  pt.textContent = ''; pn.textContent = '';
  if (!seg){ pt.textContent = segs.length ? 'Press ▶ to start' : 'Nothing to read yet'; return; }
  const r = seg.range;
  if (r){
    const mk = d.createElement('mark'); mk.textContent = seg.text.slice(r[0], r[1]);
    pt.append(seg.text.slice(0, r[0]), mk, seg.text.slice(r[1]));
  } else pt.textContent = seg.text;
  const nx = segs.slice(marked + 1).find(g => !g.skip);
  if (nx) pn.textContent = nx.text;
}
function openPip(win){
  pipWin = win;
  const d = win.document;
  d.head.append(document.querySelector('style').cloneNode(true));
  d.title = 'Read Aloud';
  d.body.className = 'pip';
  d.body.innerHTML = '<div class="pt" id="pt"></div><div class="pn" id="pn"></div>' +
    '<div class="pbar"><button class="btn" id="pprev" title="Previous">‹</button>' +
    '<button class="btn primary" id="pplay" style="min-width:50px"></button>' +
    '<button class="btn" id="pnext" title="Next">›</button><span class="spacer"></span>' +
    '<button class="btn" id="pminus" title="Smaller text">A−</button><button class="btn" id="pplus" title="Larger text">A+</button>' +
    '<select id="pspeed" aria-label="Speed"></select></div>';
  const $p = id => d.getElementById(id);
  [...speedSel.options].forEach(o => $p('pspeed').append(new Option(o.textContent, o.value)));
  $p('pspeed').value = speedSel.value;
  $p('pspeed').onchange = () => { speedSel.value = $p('pspeed').value; speedSel.onchange(); };
  $p('pplay').onclick = togglePlay;
  $p('pprev').onclick = () => $('prev').click();
  $p('pnext').onclick = () => $('next').click();
  let size = parseInt(store.get('pipsize', '20'), 10) || 20;
  const applySize = () => { $p('pt').style.fontSize = size + 'px'; store.set('pipsize', size); };
  $p('pminus').onclick = () => { size = Math.max(12, size - 2); applySize(); };
  $p('pplus').onclick = () => { size = Math.min(60, size + 2); applySize(); };
  applySize();
  d.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    if (e.code === 'Space'){ e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') $('next').click();
    else if (e.code === 'ArrowLeft') $('prev').click();
  });
  win.addEventListener('pagehide', () => { if (pipWin === win) pipWin = null; $('pop').classList.remove('on'); });
  $('pop').classList.add('on');
  setBtn(); renderPip();
}
if (!('documentPictureInPicture' in window)) $('pop').hidden = true;
$('pop').onclick = async () => {
  if (pipWin){ pipWin.close(); return; }
  if (active === 'paste') showTab('read');
  try { openPip(await documentPictureInPicture.requestWindow({ width:420, height:150 })); }
  catch (err){ $('warn').hidden = false; $('warn').textContent = 'Could not open the floating window: ' + err.message; }
};
setBtn();

// ---------- Chrome extension glue ----------
// The background worker stores text selected on a web page (right-click menu); the
// side panel picks it up here, whether it was already open or has just been opened.
const ext = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) ? chrome : null;
const voicesReady = () => new Promise(res => {
  if (voices.length || !synth) return res();
  const t = setTimeout(res, 1500);
  synth.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once:true });
});
async function takePending(){
  if (!ext) return;
  const { pending } = await ext.storage.session.get('pending');
  if (!pending || Date.now() - pending.ts > 60000) return;
  await ext.storage.session.remove('pending');
  await voicesReady();
  stopAll();
  input.value = pending.text; dirty = true; updateCount(); store.set('text', pending.text);
  showTab('read'); speakFrom(0);
}
if (ext){
  takePending();
  ext.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.pending && c.pending.newValue) takePending(); });
}

// ---------- installable web app (phone "Add to Home Screen" + offline) ----------
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// On a phone keep the voice settings tucked away so the text gets the screen.
if (matchMedia('(max-width:520px)').matches){ const dt = document.querySelector('details'); if (dt) dt.open = false; }
