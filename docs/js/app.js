/* Detection thresholds (editable). */
const THRESHOLDS = {
  equityDrawdown: 0.1,
  fxWindow: 60,
  fxPct: 0.1,
  yieldWindow: 60,
  yieldBp: 1.0,
  monthlyWindowEquiv: 3,
};

const SERIES_ORDER = ["sp500", "nikkei", "usdjpy", "us10y"];
const VIEW_START = "2015-01-01";

function viewStart(_seriesId) {
  return VIEW_START;
}

function viewStartMs(seriesId) {
  return Date.parse(viewStart(seriesId));
}

const charts = {};
let events = [];
let detectionsBySeries = {};
let activeEvent = null;

function inView(endDate, seriesId) {
  return endDate >= viewStart(seriesId);
}

function pointsFromView(points, seriesId) {
  const start = viewStart(seriesId);
  return points.filter((p) => p.date >= start);
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`failed to load ${path}`);
  return res.json();
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function windowSize(frequency, dailyWindow) {
  return frequency === "monthly" ? THRESHOLDS.monthlyWindowEquiv : dailyWindow;
}

function detectDrawdowns(points) {
  const out = [];
  if (!points.length) return out;
  let peak = points[0].value;
  let peakDate = points[0].date;
  let inDd = false;
  let start = null;
  let trough = points[0].value;
  let end = points[0].date;

  const close = () => {
    if (!inDd) return;
    const mag = (peak - trough) / peak;
    if (mag >= THRESHOLDS.equityDrawdown) {
      out.push({
        start,
        end,
        kind: "drawdown",
        magnitude: mag,
      });
    }
    inDd = false;
  };

  for (const p of points) {
    if (p.value >= peak) {
      close();
      peak = p.value;
      peakDate = p.date;
      trough = p.value;
      continue;
    }
    const dd = (peak - p.value) / peak;
    if (dd >= THRESHOLDS.equityDrawdown) {
      if (!inDd) {
        inDd = true;
        start = peakDate;
      }
      if (p.value < trough) trough = p.value;
      end = p.date;
    }
  }
  close();
  return out;
}

function detectWindowMoves(points, frequency, absThreshold, kindPct) {
  const w = windowSize(frequency, kindPct ? THRESHOLDS.fxWindow : THRESHOLDS.yieldWindow);
  const out = [];
  if (points.length <= w) return out;

  let open = null;
  const flush = () => {
    if (!open) return;
    out.push(open);
    open = null;
  };

  for (let i = w; i < points.length; i++) {
    const a = points[i - w];
    const b = points[i];
    const change = kindPct ? (b.value - a.value) / a.value : b.value - a.value;
    const hit = Math.abs(change) > absThreshold;
    if (hit) {
      const kind = change > 0 ? "surge" : "drop";
      if (open && open.kind === kind && a.date <= open.end) {
        open.end = b.date;
        if (Math.abs(change) > Math.abs(open.magnitude)) open.magnitude = change;
      } else {
        flush();
        open = {
          start: a.date,
          end: b.date,
          kind,
          magnitude: change,
        };
      }
    } else {
      flush();
    }
  }
  flush();
  return mergeOverlappingEpisodes(out);
}

/** Same-direction window hits that overlap on the calendar are one episode. */
function mergeOverlappingEpisodes(episodes) {
  if (episodes.length <= 1) return episodes;
  const sorted = [...episodes].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const merged = [];
  for (const ep of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.kind === ep.kind && ep.start <= last.end) {
      if (ep.end > last.end) last.end = ep.end;
      if (Math.abs(ep.magnitude) > Math.abs(last.magnitude)) last.magnitude = ep.magnitude;
    } else {
      merged.push({ ...ep });
    }
  }
  return merged;
}

function detectSeries(series) {
  if (series.id === "sp500" || series.id === "nikkei") {
    return detectDrawdowns(series.points).map((d) => ({ ...d, series: series.id }));
  }
  if (series.id === "usdjpy") {
    return detectWindowMoves(series.points, series.frequency, THRESHOLDS.fxPct, true).map((d) => ({
      ...d,
      series: series.id,
    }));
  }
  if (series.id === "us10y") {
    return detectWindowMoves(series.points, series.frequency, THRESHOLDS.yieldBp, false).map((d) => ({
      ...d,
      series: series.id,
    }));
  }
  return [];
}

function matchingTitles(det) {
  return events.filter((ev) => {
    const applies = !ev.series || ev.series.length === 0 || ev.series.includes(det.series);
    return applies && overlaps(det.start, det.end, ev.start, ev.end);
  });
}

function formatMag(seriesId, mag, kind) {
  if (seriesId === "sp500" || seriesId === "nikkei") {
    return `ピーク比 −${(mag * 100).toFixed(1)}%`;
  }
  if (seriesId === "usdjpy") {
    const sign = mag > 0 ? "+" : "";
    return `約60営業日で ${sign}${(mag * 100).toFixed(1)}%`;
  }
  const bp = mag * 100;
  const sign = bp > 0 ? "+" : "";
  return `約60営業日で ${sign}${bp.toFixed(0)}bp`;
}

function bandColor(index, active) {
  if (active) return "rgba(220, 80, 70, 0.32)";
  return index % 2 === 0 ? "rgba(201, 162, 39, 0.20)" : "rgba(120, 160, 200, 0.18)";
}

function annotationsFor(seriesId, detections) {
  const anns = {};
  detections.forEach((d, i) => {
    const highlight =
      activeEvent &&
      overlaps(d.start, d.end, activeEvent.start, activeEvent.end) &&
      (!activeEvent.series ||
        activeEvent.series.length === 0 ||
        activeEvent.series.includes(seriesId));
    const start = viewStart(seriesId);
    if (d.end < start) return;
    anns[`band${i}`] = {
      type: "box",
      xMin: Math.max(Date.parse(d.start), viewStartMs(seriesId)),
      xMax: Date.parse(d.end),
      backgroundColor: bandColor(i, highlight),
      borderWidth: 0,
    };
  });
  return anns;
}

function renderChart(series, detections) {
  const host = document.getElementById("charts");
  const block = document.createElement("article");
  block.className = "chart-block";
  block.id = `chart-${series.id}`;
  const visible = pointsFromView(series.points, series.id);
  const start = viewStart(series.id);
  const end = visible[visible.length - 1]?.date ?? series.points[series.points.length - 1]?.date ?? "—";
  const freqLabel = series.frequency === "daily" ? "日次" : "月次";
  block.innerHTML = `
    <h2>${series.name}</h2>
    <p class="meta-line">表示 ${start} 〜 ${end} ／ ${freqLabel} ／ ${series.source}</p>
    <div class="chart-wrap"><canvas id="cv-${series.id}"></canvas></div>
    <ul class="episodes" id="ep-${series.id}"></ul>
  `;
  host.appendChild(block);

  const ep = block.querySelector(`#ep-${series.id}`);
  detections.filter((d) => inView(d.end, series.id)).forEach((d) => {
    const titles = matchingTitles(d);
    const li = document.createElement("li");
    if (titles.length) {
      li.textContent = `${d.start}〜${d.end} ${formatMag(series.id, d.magnitude, d.kind)} — ${titles.map((t) => t.title).join("、")}`;
    } else {
      li.className = "unannotated";
      li.textContent = `${d.start}〜${d.end} ${formatMag(series.id, d.magnitude, d.kind)} — 未注釈`;
    }
    ep.appendChild(li);
  });

  const ctx = document.getElementById(`cv-${series.id}`);
  const unit = series.id === "us10y" ? "％" : series.id === "usdjpy" ? "円/ドル" : "指数";
  charts[series.id] = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: series.name,
          data: visible.map((p) => ({ x: Date.parse(p.date), y: p.value })),
          borderColor: "#8ec8ff",
          backgroundColor: "transparent",
          borderWidth: 1.4,
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      plugins: {
        legend: { display: false },
        annotation: { annotations: annotationsFor(series.id, detections) },
        tooltip: {
          callbacks: {
            label: (item) => `${item.parsed.y} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          type: "time",
          min: viewStartMs(series.id),
          time: { unit: "year" },
          ticks: { color: "#93a1b0", maxRotation: 0 },
          grid: { color: "#2a3542" },
        },
        y: {
          ticks: { color: "#93a1b0" },
          grid: { color: "#2a3542" },
          title: { display: true, text: unit, color: "#93a1b0" },
        },
      },
    },
  });
}

function refreshBands() {
  for (const id of SERIES_ORDER) {
    const chart = charts[id];
    if (!chart) continue;
    chart.options.plugins.annotation.annotations = annotationsFor(id, detectionsBySeries[id] || []);
    chart.update("none");
  }
}

function renderTimeline() {
  const list = document.getElementById("event-list");
  list.innerHTML = "";
  const sorted = [...events]
    .filter((ev) => inView(ev.end))
    .sort((a, b) => a.start.localeCompare(b.start));
  sorted.forEach((ev) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<span class="when">${ev.start} 〜 ${ev.end}</span>${ev.title}`;
    btn.addEventListener("click", () => {
      const same = activeEvent && activeEvent.title === ev.title && activeEvent.start === ev.start;
      activeEvent = same ? null : ev;
      list.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      if (!same) btn.classList.add("active");
      refreshBands();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function renderFooter(meta) {
  document.getElementById("snapshot-line").textContent =
    `データ取得日（スナップショット）: ${meta.snapshotDate}。チャート表示は ${VIEW_START} 以降で揃える。保管データは系列ごとの最長期間。`;
  const tbody = document.querySelector("#series-table tbody");
  tbody.innerHTML = "";
  meta.sources.forEach((s) => {
    const tr = document.createElement("tr");
    const freq = s.frequency === "daily" ? "日次" : "月次";
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.start}</td>
      <td>${s.end}</td>
      <td>${freq}</td>
      <td><a href="${s.sourceUrl}">${s.source}</a></td>
    `;
    tbody.appendChild(tr);
  });
}

async function main() {
  const meta = await loadJson("data/meta.json");
  events = await loadJson("data/events.json");
  renderFooter(meta);
  renderTimeline();

  for (const id of SERIES_ORDER) {
    const series = await loadJson(`data/${id}.json`);
    const dets = detectSeries({ ...series, points: pointsFromView(series.points, series.id) });
    detectionsBySeries[id] = dets;
    renderChart(series, dets);
  }
}

main().catch((err) => {
  document.getElementById("charts").textContent = `読み込みに失敗しました: ${err.message}`;
});
