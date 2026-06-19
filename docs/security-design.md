# Secure 2FA 安全設計文件

本文件描述目前版本的安全模型與邊界，對應後端 Go 實作。

## 目標與邊界

安全目標：
- 保護本機儲存的 OTP secret 與帳號資料。
- 在鎖定狀態拒絕讀取驗證碼與帳號內容。
- 降低螢幕外洩與剪貼簿殘留風險。

非目標：
- 防禦已取得系統高權限的惡意程式。
- 防禦外部相機拍攝與硬體側錄。

## 資料格式

### 1) 磁碟上的加密 Vault

檔案位置：
- 由 os.UserConfigDir 決定使用者層級資料目錄。
- vault 檔名為 vault.json。

外層格式（encryptedVault）：
- version
- kdf
- nonce
- data
- updated

kdf 參數（kdfParams）：
- name: argon2id
- salt: 16 bytes
- time: 3
- memory: 65536 KiB
- threads: 4
- keyLen: 32

內層明文（VaultData）包含：
- version
- created
- updated
- settings
- accounts

accounts 欄位包含 OTP metadata 與 secret；只在解密後存在記憶體。

### 2) 匯出檔

匯出格式（plainExport）：
- format: secure2fa-export
- version
- exported
- accounts

匯出檔為明文 JSON，屬於高敏感資料。

## 加密與解密流程

建立 vault：
1. 驗證主密碼長度。
2. 產生隨機 salt。
3. 以 Argon2id 衍生 32-byte key。
4. 將 VaultData JSON 序列化。
5. 以 AES-GCM 加密並寫入 vault.json。

解鎖 vault：
1. 讀取 vault.json。
2. 用檔內 kdf 參數重算 key。
3. AES-GCM 解密取得 VaultData。
4. session 期間保留 session key 與 vault 內容於記憶體。

保存 vault：
1. 用既有 session key 重新加密。
2. 先寫 .tmp，再 rename 取代原檔，避免部分寫入損壞。

## Session 與記憶體清理

- 鎖定時清除 session key 的 byte slice。
- 丟棄 vault 參考後觸發 GC 與 FreeOSMemory，縮短明文殘留時間。
- Go string 無法原地清零，secret 明文仍可能短暫存在 heap，依賴 GC 回收。
- 匯出與解密流程中的明文 byte buffer 使用後會主動清零。

## 存取控制

- 大部分讀寫 API 先檢查 requireUnlocked 狀態。
- 鎖定狀態下拒絕取得帳號與驗證碼。
- 前端不直接取得 secret，只取得 metadata 與目前產生的 code。

## 隱私防護

### 螢幕內容保護

- 啟動時依設定啟用 Wails ContentProtection。
- 平台支援：macOS、Windows。
- 屬於 best-effort，不等同 DRM。

### 前端即時遮蔽

- 監聽 blur、focus、visibilitychange。
- 失焦、最小化、桌面切換時套用遮蔽。

### 剪貼簿

- 複製 OTP 後啟動倒數清空。
- 清空前先比對剪貼簿是否仍為最後一次 OTP，避免覆蓋使用者新內容。

## 威脅模型

### 主要威脅

1. 本機檔案外洩
   - 控制：Argon2id + AES-GCM，主密碼保護。
2. 使用中肩窺或截圖
   - 控制：遮蔽 UI + ContentProtection。
3. 剪貼簿殘留
   - 控制：倒數清空與內容比對。
4. 錯誤密碼暴力嘗試
   - 控制：KDF 成本拉高離線破解成本。

### 殘餘風險

1. 高權限惡意程式可讀取使用中記憶體。
2. 外接相機拍攝無法防禦。
3. 明文匯出檔由使用者自行保護，若落入他人可直接讀取 secret。
4. 目前未提供 HOTP counter 同步機制。

## 已知限制

- 主密碼僅有最小長度檢查，未強制複雜度策略。
- 匯出格式為明文 JSON，不適合長期保存或雲端同步。
- 生物驗證流程依平台簽章與 Keychain 條件；開發版可能不可用。
- 截圖防護需重啟才套用新設定。

## 測試與驗證對應

- 錯誤密碼、vault 檔損毀、設定邊界值、刪除帳號：後端測試已覆蓋。
- 截圖保護開關保存與啟動狀態：後端測試已覆蓋。
- Screenshot / QuickTime / 螢幕分享：需在 macOS 實機手動驗證。
