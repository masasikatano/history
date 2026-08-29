# 長期マクロ履歴

歴史学習用の静的サイトです。S&P500、日経平均、ドル円、米10年国債利回りを、チャート上は 1971年1月以降で揃えて示します。保管データは系列ごとの最長期間です。投資助言ではありません。

仕様は [`spec.md`](spec.md) を参照してください。

## GitHub Pages

リポジトリ設定で公開ディレクトリを `/docs` にしてください。閲覧時に外部 API は呼びません。

## データの取り直し

```bash
python3 scripts/fetch_data.py
```

`.env` に `FRED_API_KEY` が必要です（コミットしないこと）。日経・ドル円・米10年は FRED、S&P500 は Shiller の長期月次を使います。系列の補間やつなぎはしません。定期自動更新はしません。

## 出典とライセンス

| 系列 | 出典 | 条件 |
|------|------|------|
| S&P500 | [Robert Shiller ie_data](http://www.econ.yale.edu/~shiller/data.htm)（月次、1871年〜） | 公開研究データ。出典明示。 |
| 日経平均 | FRED [`NIKKEI225`](https://fred.stlouisfed.org/series/NIKKEI225) | [FRED 利用規約](https://fred.stlouisfed.org/legal/) |
| ドル円 | FRED [`DEXJPUS`](https://fred.stlouisfed.org/series/DEXJPUS) | 同上 |
| 米10年 | FRED [`DGS10`](https://fred.stlouisfed.org/series/DGS10) | 同上 |

事件タイトルの日付は Federal Reserve History 等の公開年表に基づく概算区間です。長文解説は置きません。

## 免責

本サイトは歴史学習用の静的資料です。投資助言、推奨配分、売買シグナルは提供しません。表示はスナップショット時点の公開系列であり、ライブ価格ではありません。
