# デプロイ手順（v1 / PWA 無料公開）

`base: './'`（相対パス）でビルドしているため、ルート配信でもサブパス配信でも動く。
いずれのホスティングでも **HTTPS** で配信すること（Service Worker / PWA インストールに必須）。

## 方法A: GitHub Pages（推奨・このリポジトリ向け）

1. リポジトリ **Settings → Pages → Build and deployment → Source** を **「GitHub Actions」** に設定。
2. `main` に push すると [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) が
   ビルド（`npm ci && npm run build`）して `dist/` を Pages へ公開。
3. 公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`
4. スマホでそのURLを開き、ブラウザメニューから「ホーム画面に追加」。

## 方法B: Netlify

- Build command: `npm run build` / Publish directory: `dist`
- （CLI）`npx netlify deploy --prod --dir=dist`

## 方法C: Vercel

- Framework preset: **Vite** / Build: `npm run build` / Output: `dist`
- （CLI）`npx vercel --prod`

## 公開後チェック（受け入れ基準）

- [ ] Lighthouse（Chrome DevTools → Lighthouse）で **PWA: Installable**。
- [ ] 機内モードでアプリを起動できる（オフライン動作）。
- [ ] 実機スマホで「ホーム画面に追加」→ スタンドアロン起動。
- [ ] キーボードのみ（Tab/Enter/Space）で主要操作が可能。
- [ ] 公開URLで第三者が試せる。
