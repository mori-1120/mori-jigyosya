# 事業者管理アプリ - Vercelデプロイ手順

## 🚀 デプロイの準備

### 1. セキュリティ設定完了 ✅
- `supabase-env.js` をGit追跡から除外済み
- 環境変数方式に移行済み
- APIキーはVercelの環境変数で管理

### 2. 必要な環境変数
Vercelの環境変数設定で以下を追加してください：

```
VITE_SUPABASE_URL=https://ocfljsoxxgmnzqlquchx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmxqc294eGdtbnpxbHF1Y2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNTQ3ODYsImV4cCI6MjA3MjczMDc4Nn0.-7ehWfqboDccUKpk83Ys50l25sGsFXwG_12U0T33IJ0
```

## 📋 デプロイ手順

### Step 1: GitHubにプッシュ
```bash
git add .
git commit -m "feat: 環境変数対応・Vercelデプロイ設定完了"
git push origin main
```

### Step 2: Vercelプロジェクト作成・設定
1. [Vercel Dashboard](https://vercel.com/dashboard) にアクセス
2. "New Project" をクリック
3. GitHubリポジトリを選択
4. **Environment Variables** で以下を設定：
   - Key: `VITE_SUPABASE_URL`
   - Value: `https://ocfljsoxxgmnzqlquchx.supabase.co`
   - Key: `VITE_SUPABASE_ANON_KEY`  
   - Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
5. "Deploy" をクリック

### Step 3: ビルド確認
- Vercelが自動的に `npm run build` を実行
- `build.js` が環境変数を `config.js` に注入
- 静的ファイルとしてデプロイ完了

## 🔧 トラブルシューティング

### よくある問題と解決策

#### 1. **ビルドエラー: "npm not found"**
```
Solution: package.json が存在することを確認
Status: ✅ 作成済み
```

#### 2. **環境変数が読み込まれない**
```
Solution: Vercel Dashboardで環境変数設定を確認
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
```

#### 3. **Supabase接続エラー**
```
Solution: ブラウザのDevToolsで以下をチェック
- console.log('Supabase config loaded:', ...) が表示されるか
- window.SUPABASE_CONFIG が正しく設定されているか
```

#### 4. **認証が動作しない**
```
Solution: Google OAuth設定を確認
1. Google Cloud Console
2. 認証済みのオリジンにVercel URLを追加
   例: https://your-app-name.vercel.app
```

## 📁 ファイル構成

### 作成されたファイル
- ✅ `config.js` - 環境変数注入用
- ✅ `build.js` - Vercelビルドスクリプト  
- ✅ `package.json` - npm設定
- ✅ `vercel.json` - Vercel設定（ビルドコマンド追加）

### セキュリティ対応
- ✅ `supabase-env.js` をGit追跡から除外
- ✅ `.gitignore` に追加済み
- ✅ 環境変数方式に変更済み

## 🌐 デプロイ後の確認

### 1. 基本動作確認
- [ ] サイトにアクセスできるか
- [ ] Supabase接続が正常か（DevToolsでエラーチェック）
- [ ] Google OAuth認証が動作するか

### 2. Google OAuth設定
Vercel URLを Google Cloud Console の「承認済みのオリジン」に追加：
```
https://your-app-name.vercel.app
```

### 3. 本格運用前チェック
- [ ] 全ページの動作確認
- [ ] CRUD操作の動作確認  
- [ ] モバイル表示の確認
- [ ] セキュリティヘッダーの確認

## ⚡ 今回の改善点

1. **セキュリティ向上** - APIキーをGitHubから除外
2. **環境変数対応** - Vercel標準の環境変数システム活用
3. **自動ビルド** - 環境変数を自動注入するビルドプロセス
4. **開発効率** - ローカル開発時のフォールバック設定

これでデプロイの準備が完了しました！🚀