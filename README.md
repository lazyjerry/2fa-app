# Secure 2FA

Wails (Go + React/TypeScript) 桌面 2FA authenticator。實作目錄位於 `secure2fa/`。

## 功能

- 離線 TOTP 驗證碼，不需要網路。
- 主密碼登入，vault 以 Argon2id + AES-GCM 加密。
- 同台電腦多使用者：資料放在 OS 使用者自己的 config directory。
- 驗證碼管理：搜尋、分類、命名、備註、編輯、刪除。
- 手動輸入、`otpauth://` URI 匯入、鏡頭掃 QR code。
- 複製驗證碼到剪貼簿，並可設定自動清空。
- Wails ContentProtection 在 macOS/Windows 啟用 best-effort 截圖防護。

## 開發

```bash
cd secure2fa
wails dev
```

## 建置

```bash
cd secure2fa
wails build
```

目前已驗證：

```bash
cd secure2fa
go test ./...
cd frontend && npm run build
cd .. && wails build -skipbindings
```
