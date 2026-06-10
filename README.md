# KnitMe

KnitMe は、iPad で使えるシンプルなドット編み図 PWA です。描画モードで編み図を作り、ビュワーモードで行・列を追いながら確認できます。

## 主な機能

- 白黒ドットだけに絞った編み図編集
- 行番号 / 列番号 / セル番号の固定表示
- 横数 / 縦数 / ドット横幅 / ドット縦幅 / ズーム調整
- ビュワーモードでの行・列・交差強調
- `localStorage` による端末内自動保存
- `manifest` / `service worker` 付きのオフライン対応 PWA

## ローカル確認

静的サイトなので、任意の簡易サーバーで確認できます。

```bash
python3 -m http.server 4173
```

その後、`http://localhost:4173` を開いてください。

## GitHub Pages で公開する場合

1. このリポジトリを GitHub に push します。
2. GitHub の `Settings > Pages` を開きます。
3. `Build and deployment` で `GitHub Actions` を選びます。
4. `main` に push すると Pages が自動更新されます。

## iPad で使う流れ

1. Safari で公開 URL を開く
2. 共有メニューから `ホーム画面に追加`
3. 以後はアプリのようにフルスクリーン起動
