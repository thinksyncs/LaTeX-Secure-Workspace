# LaTeX Workspace Security

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/14764/badge)](https://www.bestpractices.dev/projects/14764) · [English](./README.md)

**LaTeXを書き、必要なときにビルド。最初のPDFにDockerは不要です。**

VS Codeで論文や技術文書を編集し、そのままPDFを確認できます。既存のTeXを使うか、承認したうえで軽量版を導入できます。クラウドコンパイラ、文書アップロードサービス、拡張機能独自のテレメトリーはありません。

[Marketplaceからインストール](https://marketplace.visualstudio.com/items?itemName=ToppyMicroServices.tex-workspace-secure) · [セットアップガイド（英語）](./resources/local-setup.md) · [マニュアル（英語）](./docs/manual/README.md)

## この拡張機能でできること

- **編集からPDFまで：** 入力補完、文書内の移動、ラベルの改名、診断、SyncTeX対応のPDFプレビュー。
- **ビルドは自分のタイミングで：** 保存時の自動ビルドはなく、固定レシピを使用します。shell escapeとプロジェクト指定のビルドコマンドは無効です。
- **実行環境を選択：** 明示的な同意後にローカルのpdfLaTeXを使うか、Dockerで隔離します。LuaLaTeXにはDockerが必要です。

LaTeX Workshopから独立したフォークです。自由なツールチェーン設定や自動コンパイルより、実行の管理とシンプルな操作を重視しています。公式のLaTeX Workshop拡張機能ではありません。

## 最初のPDFまで

1. 拡張機能をインストールし、信頼できるローカルフォルダーを開きます。
2. コマンドパレットで **Create first-PDF sample (English / Japanese)** を実行し、言語とワークスペース内の保存先を選びます。サンプルの内容を確認してください。作成だけではビルドやダウンロードは始まりません。
3. サンプルを開いた状態で **LaTeX Workspace Security: Build LaTeX project** を実行し、確認画面が出たら **Use Local TeX** を選びます。ツールの確認後にビルドされ、`.lw-security` 内のPDFが開きます。

ツールがない場合は **Install Lightweight TeX** からプロファイルを選び、ダウンロードを承認します。TinyTeXの導入後、ビルドを続行します。日本語サンプルには **Japanese TeX — 日本語**（CJKとIPAexフォント）、または同じパッケージを備えた既存のTeXが必要です。プロファイルは **Install or select TeX (Lightweight / Japanese)** で切り替えられます。管理者権限の要求やOSのPATH変更は行いません。

Windowsでは、管理対象TeXのインストール先にASCII文字のパスが必要です。固定バージョンのビルドツールには、日本語を含むプロジェクトパスの既知の制約もあります。対応環境、専用フォルダーの設定、トラブル対処は[セットアップガイド（英語）](./resources/local-setup.md)をご覧ください。

ローカルTeXはOSアカウントの権限で動作し、サンドボックスではありません。信頼できる文書を使用してください。実行の同意はすべての信頼済みワークスペースに適用され、ユーザー設定で取り消せます。隔離やLuaLaTeXが必要な場合は[Dockerの設定（英語）](./docs/manual/README.md#optional-docker-setup)をご覧ください。

## 企業での利用

ローカルでの編集・ビルド・プレビューにクラウドアカウントや文書のアップロードは不要です。拡張機能内のプレビューサーバーもありません。任意のDockerビルドでは、ネットワークを無効化し、ソースを読み取り専用でマウントします。ホストへの出力の書き込み先は`.lw-security`に限定します。

ただし、拡張機能全体を隔離するものでも、社内ITの承認を保証するものでもありません。ローカルの補助プログラムが動作する場合があり、導入時にはネットワーク接続が必要になることがあります。VS Codeや他の拡張機能の動作も別途考慮してください。IT部門への説明には[セキュリティ上の境界](./docs/security-hardening.ja.md)をご利用ください。

[安定版リリース](https://github.com/thinksyncs/LaTeX-Secure-Workspace/releases)には、導入前の確認に使えるVSIX、SPDX SBOM、GitHubのアテステーションを含みます。

## このプロジェクトについて

職場でLaTeXを使う人が、環境の準備やツールを選んだ理由の説明に追われず、文書の内容に集中できるようにしたいと考えています。Word、Markdown、AIを使った作業とともに、数式の伝わりやすさと丁寧な組版を大切にしています。組織のルールを尊重しながら、その選択を支えるためのプロジェクトです。

[開発への参加（英語）](./CONTRIBUTING.md) · [テスト（英語）](./test/README.md) · [リリース手順（英語）](./RELEASING.md) · [脆弱性の報告（英語）](./SECURITY.md)

[MITライセンス](./LICENSE.txt)。上流プロジェクトと第三者への帰属表示：[NOTICE](./NOTICE)。
