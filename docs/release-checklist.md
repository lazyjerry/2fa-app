# Secure 2FA Release Checklist

本清單用於每次版本發佈前後檢查，避免遺漏 build、簽章、驗證與回滾準備。

## 版本與變更

- [ ] 確認本次版本號與 tag 命名。
- [ ] 更新 release note 草稿（重點功能、修正、風險）。
- [ ] 確認 tasks 與文件狀態與本次發佈內容一致。

## Build 前檢查

- [ ] 工作目錄乾淨，沒有不屬於本次 release 的變更。
- [ ] Go 與 Node 依賴可重現安裝。
- [ ] 若有 UI 文案更新，確認繁中與英文都同步。

## CI 與測試

- [ ] 執行 go test 全部通過。
- [ ] 執行 frontend build 全部通過。
- [ ] npm audit 在既定門檻內。
- [ ] 主要流程手動 smoke test：建立、解鎖、新增、複製、鎖定。

## 產出封包

- [ ] 執行 package script，產出 .app 與 zip。
- [ ] 若需 DMG，啟用 CREATE_DMG 產出。
- [ ] 檢查輸出檔可正常啟動。

## macOS 簽章與 Notarization

- [ ] 設定 SIGN_IDENTITY（Developer ID Application）。
- [ ] 若要 notarize，設定 APPLE_ID、APPLE_TEAM_ID、APPLE_APP_SPECIFIC_PASSWORD。
- [ ] 簽章後驗證 codesign 結果。
- [ ] notarization submit 成功且完成 stapling。

## 隱私防護驗證

- [ ] 設定頁顯示平台截圖防護狀態正確。
- [ ] macOS 實機驗證 Screenshot / QuickTime / 螢幕分享。
- [ ] 驗證失焦、最小化、桌面切換遮蔽。

## 發佈

- [ ] 建立並推送 git tag。
- [ ] 上傳 release artifact（zip/dmg）。
- [ ] 發佈 release note。
- [ ] 記錄已知限制與後續追蹤 issue。

## 回滾準備

- [ ] 保留前一版可安裝封包。
- [ ] 保留前一版對應 source tag。
- [ ] 定義回滾條件（重大資料損毀、無法啟動、核心流程失效）。
- [ ] 發生重大問題時，先下架新版本並回指前版下載連結。

## 建議命令

以下命令可作為 release 前最小檢查基線：

```bash
cd secure2fa
go test ./...

cd frontend
npm ci
npm audit --audit-level=moderate
npm run build

cd ..
bash scripts/package-macos.sh
```

簽章與 notarization 範例：

```bash
cd secure2fa
SIGN_IDENTITY="Developer ID Application: YOUR NAME (TEAMID)" \
NOTARIZE=1 \
APPLE_ID="your-apple-id@example.com" \
APPLE_TEAM_ID="TEAMID" \
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
bash scripts/package-macos.sh
```
