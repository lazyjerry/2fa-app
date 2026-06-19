# 待完成事項

## 安全與驗證

- [ ] 接入 macOS LocalAuthentication，支援 Touch ID / Face ID 可用時解鎖。
- [ ] 接入 Windows Hello，支援 PIN / 生物驗證可用時解鎖。
- [ ] 設計生物驗證與主密碼的 fallback 流程，避免使用者被鎖在 vault 外。
- [ ] 增加主密碼變更功能，重新加密既有 vault。
- [ ] 增加 vault 匯出/匯入功能，匯出檔需加密並要求再次輸入主密碼。
- [ ] 檢查 session key 與 vault data 在鎖定時的記憶體清理策略。
- [ ] 評估是否導入 OS keychain 儲存受保護的 key material。
- [ ] 補強剪貼簿清空策略，避免覆蓋使用者在倒數期間新複製的其他內容。

## 截圖與隱私防護

- [ ] 在 Windows 實機驗證 Wails `ContentProtection` 是否阻擋 Snipping Tool、Print Screen、Teams/Zoom 分享。
- [ ] 在 macOS 實機驗證 Wails `ContentProtection` 是否阻擋 Screenshot、QuickTime、螢幕分享。
- [ ] 增加 app 失焦、最小化、切換桌面時的即時遮蔽測試。
- [ ] 在 README 補上各平台截圖防護驗證矩陣與限制。

## 跨平台建置

- [ ] 在 Windows 開發機或 CI runner 執行 `wails build`。
- [ ] 建立 Windows installer，驗證安裝、解除安裝、資料目錄保留策略。
- [ ] 建立 macOS release package，處理 signing、notarization、DMG 或 zip。
- [ ] 建立 GitHub Actions 或其他 CI，跑 Go test、frontend build、npm audit、macOS/Windows build。

## 功能完整度

- [ ] 增加批次匯入常見 authenticator 匯出格式。
- [ ] 增加帳號排序、釘選與分類管理。
- [ ] 增加重複帳號或重複 secret 偵測。
- [ ] 增加手動新增表單的即時 secret 格式驗證。
- [ ] 增加 QR 掃描失敗時的錯誤提示與重試狀態。
- [ ] 增加 HOTP 支援評估；目前只支援 TOTP。
- [ ] 增加多語系架構，至少保留繁體中文與英文文案。

## 測試

- [ ] 補 backend 測試：密碼錯誤、vault 檔損毀、設定邊界值、刪除帳號。
- [ ] 補 frontend component 或 E2E 測試：登入、新增、搜尋、複製、設定。
- [ ] 補 camera scanner mock 測試，確認 `otpauth://` QR 可被正確匯入。
- [ ] 補跨平台手動測試清單，涵蓋 macOS Intel/Apple Silicon、Windows 10/11。

## 文件與發佈

- [ ] 補使用者操作指南：建立 vault、新增帳號、掃 QR、複製驗證碼、鎖定。
- [ ] 補安全設計文件：資料格式、加密流程、威脅模型、已知限制。
- [ ] 補 release checklist：版本號、build、簽章、驗證、發佈、回滾。
- [ ] 初始化 git repo 後確認 `.gitignore` 已排除 `docs/research-skill/`、build output、node_modules。
