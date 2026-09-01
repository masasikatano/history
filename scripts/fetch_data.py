#!/usr/bin/env python3
"""Fetch longest public series into docs/data/*.json. No interpolation or splicing."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DOCS_DATA = ROOT / "docs" / "data"
ENV_PATH = ROOT / ".env"

FRED_OBS = "https://api.stlouisfed.org/fred/series/observations"
YAHOO_SP500_URL = (
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC"
    "?period1=1420070400&period2=9999999999&interval=1d&events=history"
)


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip())


def http_get(url: str, timeout: int = 60) -> bytes:
    req = Request(url, headers={"User-Agent": "history-macro-site/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fred_observations(series_id: str, api_key: str) -> list[dict]:
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "asc",
        "observation_start": "1800-01-01",
    }
    url = f"{FRED_OBS}?{urlencode(params)}"
    payload = json.loads(http_get(url).decode("utf-8"))
    if "observations" not in payload:
        raise RuntimeError(f"FRED error for {series_id}: {payload}")
    points = []
    for obs in payload["observations"]:
        val = obs.get("value")
        if val in (None, ".", ""):
            continue
        points.append({"date": obs["date"], "value": float(val)})
    return points


def fetch_yahoo_sp500() -> list[dict]:
    """Fetch daily S&P 500 from Yahoo Finance (2015-01-01 onwards).

    Yahoo's v8 chart API returns timestamps at US/Eastern market hours.
    UTC calendar date matches the trading date, so we use that.
    """
    payload = json.loads(http_get(YAHOO_SP500_URL).decode("utf-8"))
    result = payload.get("chart", {}).get("result", [None])[0]
    error = payload.get("chart", {}).get("error")
    if result is None:
        raise RuntimeError(f"Yahoo Finance error: {error or payload}")
    timestamps = result.get("timestamp", [])
    indicators = result.get("indicators", {})
    quotes = indicators.get("quote", [{}])[0]
    adjclose_info = indicators.get("adjclose", [{}])[0]
    adjclose = adjclose_info.get("adjclose", [])
    close = quotes.get("close", [])
    points = []
    for i, ts in enumerate(timestamps):
        if adjclose and i < len(adjclose) and adjclose[i] is not None:
            val = adjclose[i]
        elif i < len(close) and close[i] is not None:
            val = close[i]
        else:
            continue
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        points.append({"date": dt.date().isoformat(), "value": float(val)})
    if not points:
        raise RuntimeError("No S&P 500 points parsed from Yahoo Finance")
    return points


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def range_of(points: list[dict]) -> tuple[str | None, str | None]:
    if not points:
        return None, None
    return points[0]["date"], points[-1]["date"]


def main() -> int:
    load_env()
    fred_key = os.environ.get("FRED_API_KEY")
    if not fred_key:
        print("FRED_API_KEY is required in .env", file=sys.stderr)
        return 1

    snapshot = datetime.now(timezone.utc).date().isoformat()

    print("Fetching S&P500 (Yahoo Finance ^GSPC, daily from 2015)…")
    sp_points = fetch_yahoo_sp500()
    sp = {
        "id": "sp500",
        "name": "S&P500",
        "frequency": "daily",
        "source": "Yahoo Finance (^GSPC)",
        "sourceUrl": "https://finance.yahoo.com/quote/%5EGSPC/history/",
        "license": "Yahoo Finance から取得した遅行データ。再利用は各社の利用規約に従う。",
        "points": sp_points,
    }

    print("Fetching Nikkei (FRED NIKKEI225)…")
    nikkei_points = fred_observations("NIKKEI225", fred_key)
    nikkei = {
        "id": "nikkei",
        "name": "日経平均",
        "frequency": "daily",
        "source": "Nikkei Industry Research Institute via FRED (NIKKEI225)",
        "sourceUrl": "https://fred.stlouisfed.org/series/NIKKEI225",
        "license": "FRED 利用規約に従う。出典明示。",
        "points": nikkei_points,
    }

    print("Fetching Japan share prices (FRED SPASTT01JPM661N)…")
    japan_stock_points = fred_observations("SPASTT01JPM661N", fred_key)
    japan_stock = {
        "id": "japan_stock",
        "name": "日本株価指数（OECD）",
        "frequency": "monthly",
        "source": "OECD via FRED (SPASTT01JPM661N)",
        "sourceUrl": "https://fred.stlouisfed.org/series/SPASTT01JPM661N",
        "license": "FRED 利用規約に従う。出典明示。",
        "points": japan_stock_points,
    }

    print("Fetching USDJPY (FRED DEXJPUS)…")
    usdjpy_points = fred_observations("DEXJPUS", fred_key)
    usdjpy = {
        "id": "usdjpy",
        "name": "ドル円",
        "frequency": "daily",
        "source": "Board of Governors of the Federal Reserve System via FRED (DEXJPUS)",
        "sourceUrl": "https://fred.stlouisfed.org/series/DEXJPUS",
        "license": "FRED 利用規約に従う。出典明示。",
        "points": usdjpy_points,
    }

    print("Fetching US 10Y (FRED DGS10)…")
    us10y_points = fred_observations("DGS10", fred_key)
    us10y = {
        "id": "us10y",
        "name": "米10年国債利回り",
        "frequency": "daily",
        "source": "Board of Governors of the Federal Reserve System via FRED (DGS10)",
        "sourceUrl": "https://fred.stlouisfed.org/series/DGS10",
        "license": "FRED 利用規約に従う。出典明示。",
        "points": us10y_points,
    }

    print("Fetching Japan 10Y government bond yield (FRED IRLTLT01JPM156N)…")
    jp10y_points = fred_observations("IRLTLT01JPM156N", fred_key)
    jp10y = {
        "id": "jp10y",
        "name": "日本国債10年物金利",
        "frequency": "monthly",
        "source": "Organization for Economic Co-operation and Development via FRED (IRLTLT01JPM156N)",
        "sourceUrl": "https://fred.stlouisfed.org/series/IRLTLT01JPM156N",
        "license": "FRED 利用規約に従う。出典明示。",
        "points": jp10y_points,
    }

    print("Fetching VIX (FRED VIXCLS)…")
    vix_points = fred_observations("VIXCLS", fred_key)
    vix = {
        "id": "vix",
        "name": "VIX",
        "frequency": "daily",
        "source": "Chicago Board Options Exchange via FRED (VIXCLS)",
        "sourceUrl": "https://fred.stlouisfed.org/series/VIXCLS",
        "license": "FRED 利用規約に従う。出典明示。",
        "points": vix_points,
    }

    series_list = [sp, nikkei, japan_stock, usdjpy, us10y, jp10y, vix]
    for s in series_list:
        write_json(DOCS_DATA / f"{s['id']}.json", s)
        start, end = range_of(s["points"])
        print(f"  {s['id']}: {len(s['points'])} points {start} → {end} ({s['frequency']})")

    meta = {
        "snapshotDate": snapshot,
        "note": "系列ごとに取得可能な最長期間。補間・つなぎはしない。",
        "sources": [
            {
                "id": s["id"],
                "name": s["name"],
                "source": s["source"],
                "sourceUrl": s["sourceUrl"],
                "license": s["license"],
                "frequency": s["frequency"],
                "start": range_of(s["points"])[0],
                "end": range_of(s["points"])[1],
                "count": len(s["points"]),
            }
            for s in series_list
        ],
        "disclaimer": (
            "本サイトは学習用の歴史的チャートです。投資助言、売買推奨、"
            "ポートフォリオ提案ではありません。ライブ価格は表示しません。"
        ),
    }
    write_json(DOCS_DATA / "meta.json", meta)

    events_path = DOCS_DATA / "events.json"
    if not events_path.exists():
        write_json(events_path, default_events())
        print("Wrote default events.json")
    else:
        print("Kept existing events.json")

    print(f"Snapshot {snapshot} written to {DOCS_DATA}")
    return 0


def default_events() -> list[dict]:
    return [
        {
            "start": "1929-10-24",
            "end": "1933-03-04",
            "title": "世界恐慌",
            "series": ["sp500"],
            "source": "Federal Reserve History; NYSE crash week of 24 Oct 1929; US banking holiday March 1933",
            "sourceUrl": "https://www.federalreservehistory.org/essays/great-depression",
        },
        {
            "start": "1979-10-06",
            "end": "1982-08-17",
            "title": "ボルカー・ショック",
            "series": ["us10y", "sp500"],
            "source": "Fed Saturday Night Special 6 Oct 1979; 1980–82 recessions; Aug 1982 bull-market turn",
            "sourceUrl": "https://www.federalreservehistory.org/essays/anti-inflation-measures",
        },
        {
            "start": "1985-09-22",
            "end": "1988-12-31",
            "title": "プラザ合意後の円高",
            "series": ["usdjpy"],
            "source": "Plaza Accord 22 Sep 1985; subsequent USD/JPY decline through late 1980s",
            "sourceUrl": "https://www.federalreservehistory.org/essays/plaza-accord",
        },
        {
            "start": "1987-10-19",
            "end": "1987-12-31",
            "title": "ブラックマンデー",
            "series": ["sp500", "nikkei"],
            "source": "19 Oct 1987 crash; recovery into year-end 1987",
            "sourceUrl": "https://www.federalreservehistory.org/essays/stock-market-crash-of-1987",
        },
        {
            "start": "1997-07-02",
            "end": "1998-12-31",
            "title": "アジア通貨危機",
            "series": ["nikkei", "usdjpy"],
            "source": "Thai baht float 2 Jul 1997; regional crisis through 1998",
            "sourceUrl": "https://www.federalreservehistory.org/essays/asian-financial-crisis",
        },
        {
            "start": "2000-03-10",
            "end": "2002-10-09",
            "title": "ITバブル崩壊",
            "series": ["sp500", "nikkei"],
            "source": "NASDAQ peak 10 Mar 2000; S&P 500 trough 9 Oct 2002",
            "sourceUrl": "https://www.federalreservehistory.org/essays/stock-market-crash-of-2000-02",
        },
        {
            "start": "2008-09-15",
            "end": "2009-03-09",
            "title": "リーマン・ショック",
            "series": ["sp500", "nikkei", "usdjpy", "us10y"],
            "source": "Lehman Brothers bankruptcy 15 Sep 2008; S&P 500 trough 9 Mar 2009",
            "sourceUrl": "https://www.federalreservehistory.org/essays/great-recession-and-its-aftermath",
        },
        {
            "start": "2010-04-23",
            "end": "2012-07-26",
            "title": "欧州債務危機",
            "series": ["sp500", "us10y"],
            "source": "First Greek EU/IMF programme request Apr 2010; ECB OMT speech 26 Jul 2012",
            "sourceUrl": "https://www.ecb.europa.eu/press/key/date/2012/html/sp120726.en.html",
        },
        {
            "start": "2020-02-19",
            "end": "2020-03-23",
            "title": "コロナショック",
            "series": ["sp500", "nikkei", "usdjpy", "us10y"],
            "source": "S&P 500 peak 19 Feb 2020; trough 23 Mar 2020",
            "sourceUrl": "https://www.federalreservehistory.org/essays/coronavirus-covid-19-pandemic",
        },
        {
            "start": "2022-01-13",
            "end": "2022-11-09",
            "title": "The Great Tightening",
            "series": ["usdjpy", "us10y"],
            "source": "Inflation surge and Fed hiking cycle from 2022; BOJ YCC kept Japanese yields pinned, widening the US–Japan rate gap. USD/JPY and UST 10Y both advanced in two legs around a mid-year pause. Yen-buying intervention in Sep–Oct 2022 is a separate USD/JPY event, not a driver of the UST move",
            "sourceUrl": "https://www.federalreserve.gov/publications/2022-ar-monetary-policy.htm",
        },
        {
            "start": "2022-09-22",
            "end": "2022-10-24",
            "title": "24年ぶり円買い介入（2022年）",
            "series": ["usdjpy"],
            "source": "First yen-buying intervention in 24 years on 22 Sep 2022; follow-up around 21–24 Oct 2022",
            "sourceUrl": "https://www.mof.go.jp/english/policy/international_policy/economic_report/",
        },
    ]


if __name__ == "__main__":
    sys.exit(main())
