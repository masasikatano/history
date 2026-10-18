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

async function main() {
  const data = await (await fetch("data/sp500.json")).json();
  const points = data.points;
  const tbody = document.querySelector("#holding-table tbody");
  const startInput = document.getElementById("start-date");
  const endInput = document.getElementById("end-date");
  const resetBtn = document.getElementById("reset-range");
  const note = document.getElementById("holding-note");

  function render() {
    const inRange = points.filter(
      (p) => p.date >= startInput.value && p.date <= endInput.value
    );
    tbody.textContent = "";

    if (inRange.length < 2) {
      note.textContent = "期間内のデータが不足しています。日付の範囲を広げてください。";
      return;
    }

    for (const period of HOLDING_PERIODS) {
      const s = holdingPeriodStats(inRange, period.days);
      const tr = document.createElement("tr");
      const cells = [
        period.label,
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
      tbody.appendChild(tr);
    }

    note.textContent =
      `対象: S&P500 日次、${inRange[0].date} 〜 ${inRange[inRange.length - 1].date}、${inRange.length} 点。` +
      "窓が短い期間（サンプル数が少ない）や、上昇局面に偏った期間では長期保有が有利に見えるバイアスがあります。";
  }

  startInput.min = points[0].date;
  startInput.max = points[points.length - 1].date;
  endInput.min = points[0].date;
  endInput.max = points[points.length - 1].date;

  startInput.addEventListener("change", render);
  endInput.addEventListener("change", render);
  resetBtn.addEventListener("click", () => {
    startInput.value = points[0].date;
    endInput.value = points[points.length - 1].date;
    render();
  });

  render();
}

main().catch((err) => {
  document.getElementById("holding-note").textContent = `データの読み込みに失敗しました: ${err.message}`;
});
