# Secure 2FA

跨平台桌面 2FA authenticator，使用 Wails v2、Go、React、TypeScript。

## 已實作

- 本機離線 TOTP 產生與倒數更新。
- 主密碼建立/解鎖 vault。
- Vault 內容以 Argon2id 衍生金鑰，AES-GCM 加密儲存在本機。
- OS 使用者隔離：預設資料位置由 `os.UserConfigDir()` 決定。
- 帳號管理：新增、編輯 metadata、刪除、搜尋、分類、備註。
- 匯入方式：手動 secret、`otpauth://` URI、鏡頭 QR 掃描。
- 複製驗證碼與可設定剪貼簿清空秒數。
- 設定頁：遮蔽驗證碼、自動鎖定、剪貼簿清空、截圖防護狀態、資料目錄。
- macOS/Windows Wails `ContentProtection` 已啟用。

## 安全邊界

- Backend 不把 TOTP secret 回傳給 frontend；frontend 只取得 metadata 與目前驗證碼。
- Vault 鎖定後，backend API 會拒絕讀取帳號與驗證碼。
- 密碼不落地儲存；記憶體內只保留解鎖後的 session key。
- 截圖防護是平台 best-effort：macOS 使用 `NSWindowSharingNone`，Windows 使用 `SetWindowDisplayAffinity`。外部相機、惡意程式或具高權限的螢幕擷取仍不能保證完全阻擋。
- 生物驗證第一版未接入；需求中的「密碼或生物驗證」目前由主密碼滿足。

## 開發

```bash
wails dev
```

Wails dev 會啟動 Vite dev server。瀏覽器開發入口由 Wails 自動配置，通常可從 dev output 看到。

## 驗證

```bash
go test ./...
cd frontend && npm run build
cd .. && wails build -skipbindings
```

## 輸出

macOS build smoke test 已產生：

```text
build/bin/secure2fa.app/Contents/MacOS/secure2fa
```
