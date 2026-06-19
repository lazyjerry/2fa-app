# 待完成事項

## 安全與驗證

- [x] 接入 macOS LocalAuthentication，支援 Touch ID 可用時解鎖。（需要正式簽章才能使用）
- [x] 設計生物驗證與主密碼的 fallback 流程，避免使用者被鎖在 vault 外。
- [x] 增加主密碼變更功能，重新加密既有 vault。
- [x] 增加 vault 匯出/匯入功能，匯出檔需加密並要求再次輸入主密碼。
- [x] 檢查 session key 與 vault data 在鎖定時的記憶體清理策略。
- [x] 評估是否導入 macOS Keychain 儲存受保護的 key material。
- [x] 補強剪貼簿清空策略，避免覆蓋使用者在倒數期間新複製的其他內容。

## 截圖與隱私防護

- [ ] 在 macOS 實機驗證 Wails `ContentProtection` 是否阻擋 Screenshot、QuickTime、螢幕分享。（已建立 README 驗證矩陣與 `docs/macos-manual-test-checklist.md`；待可操作實機完成結果填寫）
- [x] 增加 app 失焦、最小化、切換桌面時的即時遮蔽驗證項目。
- [x] 在 README 補上 macOS 截圖防護驗證矩陣與限制。

## macOS 建置

- [x] 建立 macOS unsigned release package，產出可測試的 `.app` + `.zip` 或 `.dmg`。
- [ ] 處理 macOS Developer ID signing、notarization、stapling。（已建立 `secure2fa/scripts/package-macos.sh` 與 `docs/release-checklist.md` 執行步驟；待 Developer ID 憑證與 Apple notarization 憑證）
- [x] 建立 GitHub Actions 或其他 CI，跑 Go test、frontend build、npm audit、macOS build。

## 功能完整度

- [x] 增加批次匯入常見 authenticator 匯出格式。
- [x] 增加帳號排序、釘選與分類管理。
- [x] 增加重複帳號或重複 secret 偵測。
- [x] 增加手動新增表單的即時 secret 格式驗證。
- [x] 增加 QR 掃描失敗時的錯誤提示與重試狀態。
- [x] 增加 HOTP 支援評估；目前只支援 TOTP。（見 `docs/hotp-evaluation.md`）
- [x] 增加多語系架構，至少保留繁體中文與英文文案。

## 測試

- [x] 補 backend 測試：密碼錯誤、vault 檔損毀、設定邊界值、刪除帳號。
- [x] 補 frontend component 或 E2E 測試：登入、新增、搜尋、複製、設定。
- [x] 補 camera scanner mock 測試，確認 `otpauth://` QR 可被正確匯入。（目前鏡頭模式已移除，以 QR image parser mock 覆蓋）
- [x] 補 macOS 手動測試清單，涵蓋 Intel / Apple Silicon。

## 文件與發佈

- [x] 補使用者操作指南：建立 vault、新增帳號、掃 QR、複製驗證碼、鎖定。（見 `docs/user-guide.md`）
- [x] 補安全設計文件：資料格式、加密流程、威脅模型、已知限制。（見 `docs/security-design.md`）
- [x] 補 release checklist：版本號、build、簽章、驗證、發佈、回滾。（見 `docs/release-checklist.md`）
- [X] 初始化 git repo 後確認 `.gitignore` 已排除 `docs/research-skill/`、build output、node_modules。
