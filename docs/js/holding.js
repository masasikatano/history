/* Holding-period return stats for S&P500. */

const HOLDING_PERIODS = [
  { label: "1週間", days: 5 },
  { label: "2週間", days: 10 },
  { label: "1ヶ月", days: 21 },
  { label: "3ヶ月", days: 63 },
  { label: "半年", days: 126 },
  { label: "1年", days: 252 },
];

function percentile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function holdingPeriodStats(points, days) {
  const rets = [];
  for (let i = 0; i + days < points.length; i += 1) {
    rets.push(points[i + days].value / points[i].value - 1);
  }
  if (!rets.length) return null;
  const sorted = [...rets].sort((a, b) => a - b);
  const sum = rets.reduce((acc, r) => acc + r, 0);
  const positive = rets.filter((r) => r > 0).length;
  return {
    count: rets.length,
    median: percentile(sorted, 0.5),
    mean: sum / rets.length,
    positiveRatio: positive / rets.length,
    best: sorted[sorted.length - 1],
    worst: sorted[0],
    p5: percentile(sorted, 0.05),
    p95: percentile(sorted, 0.95),
  };
}

function fmtPct(x, digits = 1) {
  return x == null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

function returnStatsByWeekday(points, days) {
  const byDay = [[], [], [], [], [], [], []];
  for (let i = 0; i + days < points.length; i += 1) {
    const dow = new Date(`${points[i].date}T00:00:00`).getDay();
    byDay[dow].push(points[i + days].value / points[i].value - 1);
  }
  return byDay.map((rets) => {
    if (!rets.length) return null;
    const sorted = [...rets].sort((a, b) => a - b);
    const sum = rets.reduce((acc, r) => acc + r, 0);
    const positive = rets.filter((r) => r > 0).length;
    return {
      count: rets.length,
      median: percentile(sorted, 0.5),
      mean: sum / rets.length,
      positiveRatio: positive / rets.length,
      best: sorted[sorted.length - 1],
      worst: sorted[0],
      p5: percentile(sorted, 0.05),
      p95: percentile(sorted, 0.95),
    };
  });
}

async function main() {
  const seriesDefs = {
    sp500: { name: "S&P500（ドル建て）", data: await (await fetch("data/sp500.json")).json() },
    nikkei: { name: "日経平均（円建て）", data: await (await fetch("data/nikkei.json")).json() },
  };
  let current = "sp500";
  const tbody = document.querySelector("#holding-table tbody");
  const seriesSelect = document.getElementById("series-select");
  const startInput = document.getElementById("start-date");
  const endInput = document.getElementById("end-date");
  const resetBtn = document.getElementById("reset-range");
  const note = document.getElementById("holding-note");
  const weekdayTbody = document.querySelector("#weekday-table tbody");
  const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  function fillRow(tr, label, s) {
    const cells = [
      label,
      s ? String(s.count) : "—",
      s ? fmtPct(s.median) : "—",
      s ? fmtPct(s.mean) : "—",
      s ? fmtPct(s.positiveRatio) : "—",
      s ? fmtPct(s.best) : "—",
      s ? fmtPct(s.worst) : "—",
      s ? fmtPct(s.p5) : "—",
      s ? fmtPct(s.p95) : "—",
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
  }

  function render() {
    const { name, data } = seriesDefs[current];
    const points = data.points;
    const inRange = points.filter(
      (p) => p.date >= startInput.value && p.date <= endInput.value
    );
    tbody.textContent = "";
    weekdayTbody.textContent = "";

    if (inRange.length < 2) {
      note.textContent = "期間内のデータが不足しています。日付の範囲を広げてください。";
      return;
    }

    for (const period of HOLDING_PERIODS) {
      const s = holdingPeriodStats(inRange, period.days);
      const tr = document.createElement("tr");
      fillRow(tr, period.label, s);
      tbody.appendChild(tr);
    }

    const oneWeek = HOLDING_PERIODS[0].days;
    const byWeekday = returnStatsByWeekday(inRange, oneWeek);
    for (let dow = 1; dow <= 5; dow += 1) {
      const tr = document.createElement("tr");
      fillRow(tr, WEEKDAY_LABELS[dow], byWeekday[dow]);
      weekdayTbody.appendChild(tr);
    }

    note.textContent =
      `対象: ${name}、日次、${inRange[0].date} 〜 ${inRange[inRange.length - 1].date}、${inRange.length} 点。` +
      "窓が短い期間（サンプル数が少ない）や、上昇局面に偏った期間では長期保有が有利に見えるバイアスがあります。";
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
  document.getElementById("holding-note").textContent = `データの読み込みに失敗しました: ${err.message}`;
});
