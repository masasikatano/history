# 長期マクロ履歴

歴史学習用の静的サイトです。S&P500、日経平均、日本株価指数（OECD）、ドル円、米10年国債利回り、日本国債10年物金利、VIX を、チャート上は 2015年1月以降で揃えて示します。保管データは系列ごとの最長期間です。投資助言ではありません。

仕様は [`spec.md`](spec.md) を参照してください。

## GitHub Pages

リポジトリ設定で公開ディレクトリを `/docs` にしてください。閲覧時に外部 API は呼びません。

## ローカルでの確認

静的ファイルなので `docs/` 配下を任意の HTTP サーバで配信すれば表示できます。

```bash
cd docs
python3 -m http.server 8000
```

- トップ: http://localhost:8000/index.html
- 保有期間別リターン分布（S&P500）: http://localhost:8000/holding.html

`file://` で直接開くと JSON の `fetch` がブラウザにブロックされて表示できないため、必ず HTTP 経由で開いてください。

## データの取り直し

相場系列を公開ソースの最新値にするには、リポジトリ直下で次を実行します。

```bash
python3 scripts/fetch_data.py
```

スクリプトは標準ライブラリだけで動きます。`requirements.txt` の `requests` は不要です。

1. [FRED の API キー](https://fredaccount.stlouisfed.org/apikeys) を取り、リポジトリ直下の `.env` に `FRED_API_KEY=あなたのキー` と書く。`.env` はコミットしない。
2. 上のコマンドを実行する。
3. 標準出力の `start → end` と、`docs/data/meta.json` の `snapshotDate` を確認する。

上書きされるファイルは次のとおりです。

- `docs/data/sp500.json` — Yahoo Finance `^GSPC`。2015-01-01 以降の日次
- `docs/data/nikkei.json` — FRED `NIKKEI225`
- `docs/data/japan_stock.json` — FRED `SPASTT01JPM661N`（月次）
- `docs/data/usdjpy.json` — FRED `DEXJPUS`
- `docs/data/us10y.json` — FRED `DGS10`
- `docs/data/jp10y.json` — FRED `IRLTLT01JPM156N`（月次）
- `docs/data/vix.json` — FRED `VIXCLS`
- `docs/data/meta.json` — 取得日と各系列の開始・終了・件数

`events.json` が既にあれば残します。無いときだけ既定の事件リストを書きます。系列の補間やつなぎはしません。月次系列と FRED の日次系列は、公表ラグで取得日まで届かないことがあります。

GitHub Pages に出すときは `docs/data/` の変更をコミットして push します。定期自動更新はしません。表示の確認は「ローカルでの確認」のとおりです。

## 出典とライセンス

| 系列 | 出典 | 条件 |
|------|------|------|
| S&P500 | [Yahoo Finance `^GSPC`](https://finance.yahoo.com/quote/%5EGSPC/history/)（日次、2015年〜） | Yahoo Finance 利用規約に従う。 |
| 日経平均 | FRED [`NIKKEI225`](https://fred.stlouisfed.org/series/NIKKEI225) | [FRED 利用規約](https://fred.stlouisfed.org/legal/) |
| 日本株価指数（OECD） | FRED [`SPASTT01JPM661N`](https://fred.stlouisfed.org/series/SPASTT01JPM661N) | 同上 |
| ドル円 | FRED [`DEXJPUS`](https://fred.stlouisfed.org/series/DEXJPUS) | 同上 |
| 米10年 | FRED [`DGS10`](https://fred.stlouisfed.org/series/DGS10) | 同上 |
| 日本国債10年物金利 | FRED [`IRLTLT01JPM156N`](https://fred.stlouisfed.org/series/IRLTLT01JPM156N) | 同上 |
| VIX | FRED [`VIXCLS`](https://fred.stlouisfed.org/series/VIXCLS) | 同上 |

事件タイトルの日付は Federal Reserve History 等の公開年表に基づく概算区間です。長文解説は置きません。

## 免責

本サイトは歴史学習用の静的資料です。投資助言、推奨配分、売買シグナルは提供しません。表示はスナップショット時点の公開系列であり、ライブ価格ではありません。
