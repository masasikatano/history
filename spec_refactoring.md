# リファクタリング計画書

## 1. 目的

本計画は、静的サイト「長期マクロ履歴」のコードを保守・テストしやすくするためのリファクタリング方針を定める。機能要件は `spec.md` を変更せず、実装構造のみを整理する。

## 2. 現状の課題

- **`docs/js/app.js`（389行）が全責任を持っている**
  - データ読み込み、検出算法、Chart.js 描画、DOM 生成、年表・フッター出力、グローバル状態が混在している。
- **系列（series）の種別判定が散在している**
  - `detectSeries`、`formatMag`、`unit`、`annotationsFor` などで都度 `sp500` / `usdjpy` / `us10y` といった ID を文字列比較している。
- **設定とロジックが混在している**
  - `THRESHOLDS`、`SERIES_ORDER`、`VIEW_START` は冒頭にあるが、系列の「種別」（equity / fx / yield）はコード中に埋め込まれている。
- **`scripts/fetch_data.py`（400行）も単一ファイルで多役**
  - FRED 取得、Shiller パース、メタデータ生成、デフォルト事件生成が一つに詰まっている。
  - 6系列のメタデータ生成がほぼコピペになっている。
- **テストがない**
  - 検出ロジックは純粋関数でテストしやすいが、DOM や Chart.js と絡んでいる。

## 3. リファクタリング方針

### 3.1 Phase 1: 設定・ドメイン層の分離

**対象:** `docs/js/`

- `docs/js/config/series.js` を新設する。
  - `SERIES_ORDER`、`VIEW_START`、各系列の種別（`equity` / `fx` / `yield`）、単位、表示名、閾値を一元管理する。
- `docs/js/models/series.js` を新設する。
  - `series.frequency` から「月次相当窓」を計算する関数を配置する。
  - `inView()`、`pointsFromView()` など、系列データに対する問い合わせを集約する。

### 3.2 Phase 2: 検出ロジックの切り出しと純粋化

**対象:** `docs/js/analytics/detections.js`

- `detectDrawdowns`、`detectWindowMoves`、`mergeOverlappingEpisodes` を `app.js` から移動する。
- `detectSeries()` を廃止し、設定の種別（`equity` / `fx` / `yield`）に応じて関数を選択する。
- グローバル `events` への依存を排除し、検出結果に事件タイトルを紐づける処理はレンダラ側に委譲する。

### 3.3 Phase 3: 描画層の分離

**対象:** `docs/js/renderers/`

- `docs/js/renderers/chart.js`
  - 1系列分の Chart.js 初期化、ハイライト帯、アノテーション更新を担当する。
- `docs/js/renderers/timeline.js`
  - 年表リスト生成、クリックハンドラを担当する。
- `docs/js/renderers/footer.js`
  - スナップショット行、系列テーブルを担当する。
- `docs/js/app.js` は「読み込み → 検出 → 各レンダラ呼び出し」のオーケストレータのみにする。

### 3.4 Phase 4: Python 取得スクリプトの整理

**対象:** `scripts/`

- `scripts/sources/fred.py`
  - FRED API 呼び出し、リトライ、エラーハンドリングを担当する。
- `scripts/sources/shiller.py`
  - Shiller XLS / HTML / CSV ミラーの取得とパースを担当する。
- `scripts/series_config.py`
  - 6系列の ID、名前、FRED series_id、ソース URL、ライセンスをテーブル化する。
- `scripts/output.py`
  - JSON 書き出し、`meta.json` 生成を担当する。
- `scripts/fetch_data.py`
  - 上記モジュールを組み合わせるエントリポイントのみにする。

### 3.5 Phase 5: 基本テストの追加

**対象:** 新規

- Python: `tests/test_shiller_parse.py`、`tests/test_fred_filter.py` を追加する。
- JS: `docs/js/analytics/detections.js` の純粋関数に対し、Node 上で最小限のテストを追加する。
  - 例: 10% ドローダウン検出、FX 60日窓変動、結合ロジック

### 3.6 Phase 6: 動作確認

以下を確認する。

- `python3 scripts/fetch_data.py` が `.env` ありで成功する。
- `docs/index.html` をローカルサーバで開き、6チャート・年表・フッターが従来通り表示される。
- 年表クリックでハイライト帯が切り替わる。
- 未注釈の検出が「未注釈」と表示される。
- GitHub Pages 用 `/docs` 構成が崩れていない。

## 4. リファクタリング後のディレクトリ構成

```
scripts/
  fetch_data.py
  sources/
    fred.py
    shiller.py
  series_config.py
  output.py
docs/
  js/
    app.js
    config/
      series.js
    models/
      series.js
    analytics/
      detections.js
    renderers/
      chart.js
      timeline.js
      footer.js
  ...
tests/
  test_shiller_parse.py
  test_detections.py
```

## 5. 実施方針の選択肢

| 方針 | 範囲 | 備考 |
|------|------|------|
| 保守的 | Phase 1〜3 のみ | JS をモジュール分割し、Python は軽く整理するだけ。 |
| 標準（推奨） | Phase 1〜5 | 設定・検出・描画を分離し、テストを追加する。 |
| 大規模 | TypeScript 移行なども含める | 現状では過剰。 |

本計画書は標準方針を前提とする。
