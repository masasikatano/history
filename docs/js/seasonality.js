/* Seasonality tests: January effect, Halloween effect, Sell in May. */

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
/* Practical equivalence margins (absolute return difference). */
const TOST_DELTA_MONTHLY = 0.02; /* 月次平均リターン差 ±2% 以内を実用上同等とみなす */
const TOST_DELTA_HALF = 0.04; /* 半年リターン差 ±4% 以内 */

function mean(a) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

function variance(a, m) {
  return a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1);
}

/* Two-sided p-value of a standard normal. */
function normalP(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 2 * Math.min(p, 1 - p);
}

/* Welch's t-test (normal approximation for the p-value; df is large for monthly samples). */
function welchTest(x, y) {
  const mx = mean(x);
  const my = mean(y);
  const vx = variance(x, mx);
  const vy = variance(y, my);
  const se = Math.sqrt(vx / x.length + vy / y.length);
  if (se === 0) return { diff: mx - my, p: 1, se: 0 };
  const t = (mx - my) / se;
  /* p 値は正規近似（月次サンプルでは自由度が十分大きい） */
  const p = normalP(t);
  return { diff: mx - my, p, se };
}

/* Mann-Whitney U test (normal approximation with tie-unaffected variance). */
function mannWhitney(x, y) {
  const combined = [...x.map((v) => ({ v, g: 0 })), ...y.map((v) => ({ v, g: 1 }))].sort(
    (a, b) => a.v - b.v
  );
  const n1 = x.length;
  const n2 = y.length;
  let rankSum = 0;
  for (let i = 0; i < combined.length; i += 1) {
    if (combined[i].g === 0) rankSum += i + 1;
  }
  const u1 = rankSum - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma === 0) return { u: u1, p: 1 };
  return { u: u1, p: normalP((u1 - mu) / sigma) };
}

/* Bootstrap CI (percentile, 10,000 resamples) for the difference in means. */
function bootstrapCI(x, y, resamples = 10000) {
  const diffs = new Array(resamples);
  const nx = x.length;
  const ny = y.length;
  for (let r = 0; r < resamples; r += 1) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < nx; i += 1) sx += x[Math.floor(Math.random() * nx)];
    for (let i = 0; i < ny; i += 1) sy += y[Math.floor(Math.random() * ny)];
    diffs[r] = sx / nx - sy / ny;
  }
  diffs.sort((a, b) => a - b);
  return { lo: diffs[Math.floor(0.025 * resamples)], hi: diffs[Math.floor(0.975 * resamples)] };
}

/* TOST-style equivalence check: is the (approx) 95% CI of the mean diff inside ±delta? */
function equivalenceResult(test, delta) {
  const ci = { lo: test.diff - 1.96 * test.se, hi: test.diff + 1.96 * test.se };
  return { ci, equivalent: test.se > 0 && ci.lo > -delta && ci.hi < delta };
}

/* Build non-overlapping monthly returns (month-end over previous month-end). */
function monthlyReturns(points, startDate, endDate) {
  const inRange = points.filter((p) => p.date >= startDate && p.date <= endDate);
  const byMonth = new Map();
  for (const p of inRange) {
    const key = p.date.slice(0, 7); /* YYYY-MM */
    const prev = byMonth.get(key);
    if (!prev || p.date > prev.date) byMonth.set(key, p);
  }
  const months = [...byMonth.keys()].sort();
  const out = [];
  for (let i = 1; i < months.length; i += 1) {
    const prev = byMonth.get(months[i - 1]);
    const cur = byMonth.get(months[i]);
    /* 隣接する月同士のみ（欠損月をまたぐつなぎはしない） */
    const ymPrev = months[i - 1].split("-").map(Number);
    const ymCur = months[i].split("-").map(Number);
    const adjacent =
      ymCur[0] * 12 + ymCur[1] === ymPrev[0] * 12 + ymPrev[1] + 1;
    if (!adjacent) continue;
    out.push({
      year: ymCur[0],
      month: ymCur[1],
      ret: cur.value / prev.value - 1,
    });
  }
  return out;
}

/* Build non-overlapping half-year returns per calendar year. */
function halfYearReturns(monthly) {
  const byKey = new Map(monthly.map((m) => [`${m.year}-${m.month}`, m.ret]));
  const years = [...new Set(monthly.map((m) => m.year))].sort();
  const out = { novApr: [], mayOct: [] };
  for (const y of years) {
    let r = 1;
    let ok = true;
    for (const m of [11, 12]) {
      const v = byKey.get(`${y - 1}-${m}`);
      if (v == null) ok = false;
      else r *= 1 + v;
    }
    for (const m of [1, 2, 3, 4]) {
      const v = byKey.get(`${y}-${m}`);
      if (v == null) ok = false;
      else r *= 1 + v;
    }
    if (ok) out.novApr.push(r - 1);

    r = 1;
    ok = true;
    for (const m of [5, 6, 7, 8, 9, 10]) {
      const v = byKey.get(`${y}-${m}`);
      if (v == null) ok = false;
      else r *= 1 + v;
    }
    if (ok) out.mayOct.push(r - 1);
  }
  return out;
}

function fmtPct(x, digits = 1) {
  return x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(digits)}%`;
}

function fmtP(p) {
  return p == null || Number.isNaN(p) ? "—" : p < 0.001 ? "<0.001" : p.toFixed(3);
}

function statsRow(label, rets) {
  if (!rets.length) return { label, count: 0 };
  const sorted = [...rets].sort((a, b) => a - b);
  return {
    label,
    count: rets.length,
    mean: mean(rets),
    median: sorted[Math.floor(sorted.length / 2)],
    positiveRatio: rets.filter((r) => r > 0).length / rets.length,
  };
}

/* Run the full test battery for two groups and return a conclusions object. */
function compareGroups(x, y, delta) {
  if (x.length < 2 || y.length < 2) return null;
  const test = welchTest(x, y);
  const mw = mannWhitney(x, y);
  const boot = bootstrapCI(x, y);
  const tost = equivalenceResult(test, delta);
  return { test, mw, boot, tost, nx: x.length, ny: y.length };
}

async function main() {
  const seriesDefs = {
    sp500: { name: "S&P500（ドル建て）", data: await (await fetch("data/sp500.json")).json() },
    nikkei: { name: "日経平均（円建て）", data: await (await fetch("data/nikkei.json")).json() },
  };
  let current = "sp500";
  const seriesSelect = document.getElementById("series-select");
  const startInput = document.getElementById("start-date");
  const endInput = document.getElementById("end-date");
  const resetBtn = document.getElementById("reset-range");
  const note = document.getElementById("seasonality-note");
  const monthTbody = document.querySelector("#month-table tbody");
  const testTbody = document.querySelector("#test-table tbody");
  const summary = document.getElementById("summary");

  function fillStatsRow(tr, s) {
    const cells = [
      s.label,
      String(s.count),
      fmtPct(s.mean),
      fmtPct(s.median),
      fmtPct(s.positiveRatio),
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
  }

  function fillTestRow(label, res) {
    const tr = document.createElement("tr");
    const cells = res
      ? [
          label,
          `${res.nx} vs ${res.ny}`,
          fmtPct(res.test.diff),
          fmtP(res.test.p),
          fmtP(res.mw.p),
          `${fmtPct(res.boot.lo)} 〜 ${fmtPct(res.boot.hi)}`,
          res.tost.equivalent ? "等価とみなせる" : "等価とは言えない",
        ]
      : [label, "—", "—", "—", "—", "—", "サンプル不足"];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    testTbody.appendChild(tr);
  }

  function render() {
    const { name, data } = seriesDefs[current];
    const monthly = monthlyReturns(data.points, startInput.value, endInput.value);
    monthTbody.textContent = "";
    testTbody.textContent = "";

    if (monthly.length < 24) {
      note.textContent = "期間内の月次データが不足しています（最低約2年分必要）。日付の範囲を広げてください。";
      summary.textContent = "";
      return;
    }

    /* 月別集計表 */
    for (let m = 1; m <= 12; m += 1) {
      const rets = monthly.filter((r) => r.month === m).map((r) => r.ret);
      const tr = document.createElement("tr");
      fillStatsRow(tr, statsRow(MONTH_LABELS[m - 1], rets));
      monthTbody.appendChild(tr);
    }

    /* 1月効果: 1月 vs 1月以外 */
    const jan = monthly.filter((r) => r.month === 1).map((r) => r.ret);
    const nonJan = monthly.filter((r) => r.month !== 1).map((r) => r.ret);
    const janRes = compareGroups(jan, nonJan, TOST_DELTA_MONTHLY);

    /* ハロウィン効果 / Sell in May: 11-4月 vs 5-10月 */
    const half = halfYearReturns(monthly);
    const hwRes = compareGroups(half.novApr, half.mayOct, TOST_DELTA_HALF);

    fillTestRow("1月 vs 1月以外（月次）", janRes);
    fillTestRow("11-4月 vs 5-10月（半年・ハロウィン/Sell in May）", hwRes);

    const lines = [];
    if (janRes) {
      const detected = janRes.test.p < 0.05 || janRes.mw.p < 0.05;
      lines.push(
        detected
          ? `1月効果: 差が検出されました（平均差 ${fmtPct(janRes.test.diff)}、t検定 p=${fmtP(janRes.test.p)}）。ただし1月だけを抜いて検定しているため多重検定に注意が必要です。`
          : `1月効果: 差は統計的に検出されませんでした（t検定 p=${fmtP(janRes.test.p)}、Mann-Whitney p=${fmtP(janRes.mw.p)}）。` +
              (janRes.tost.equivalent
                ? `平均差の95%信頼区間が ±2% の等価域内にあるため、実用上の差は小さいとみなせます。`
                : `等価域（±2%）内とは言えないため、「差がない」とは断定できません（月次サンプル数が少なく検出力が不足している可能性があります）。`)
      );
    }
    if (hwRes) {
      const detected = hwRes.test.p < 0.05 || hwRes.mw.p < 0.05;
      if (detected) {
        lines.push(
          `ハロウィン効果: 11-4月が5-10月に対して優位（平均差 ${fmtPct(hwRes.test.diff)}、p=${fmtP(hwRes.test.p)}）。同時に Sell in May も有効と言えます。ただし年ごとの半年リターンは数十点しかなく検出力に注意。`
        );
      } else {
        lines.push(
          `ハロウィン効果: 11-4月と5-10月の差は検出されませんでした（t検定 p=${fmtP(hwRes.test.p)}、Mann-Whitney p=${fmtP(hwRes.mw.p)}）。` +
            (hwRes.tost.equivalent
              ? `信頼区間が ±4% の等価域内に入るため実用上の差は小さいとみなせます。`
              : `等価域（±4%）内とは言えず「差がない」とは断定できません。`) +
            ` Sell in May の有効性も同時に検出されません（同じ検定の裏返し）。`
        );
      }
    }
    summary.textContent = lines.join(" ");
    if (!janRes && !hwRes) summary.textContent = "サンプル数が不足しているため検定できません。";

    note.textContent =
      `対象: ${name}、月次リターン（非重複）、${monthly[0].year}年${monthly[0].month}月 〜 ` +
      `${monthly[monthly.length - 1].year}年${monthly[monthly.length - 1].month}月、${monthly.length} ヶ月。` +
      `ハロウィン効果の検定は暦年ごとの半年リターン（11-4月: ${half.novApr.length} 組、5-10月: ${half.mayOct.length} 組）を使用。`;
  }

  function applySeriesBounds() {
    const points = seriesDefs[current].data.points;
    startInput.min = points[0].date;
    startInput.max = points[points.length - 1].date;
    endInput.min = points[0].date;
    endInput.max = points[points.length - 1].date;
    if (startInput.value < points[0].date) startInput.value = points[0].date;
    if (endInput.value > points[points.length - 1].date) endInput.value = points[points.length - 1].date;
  }

  seriesSelect.addEventListener("change", () => {
    current = seriesSelect.value;
    applySeriesBounds();
    render();
  });
  startInput.addEventListener("change", render);
  endInput.addEventListener("change", render);
  resetBtn.addEventListener("click", () => {
    const points = seriesDefs[current].data.points;
    startInput.value = points[0].date;
    endInput.value = points[points.length - 1].date;
    render();
  });

  applySeriesBounds();
  render();
}

main().catch((err) => {
  document.getElementById("seasonality-note").textContent = `データの読み込みに失敗しました: ${err.message}`;
});
