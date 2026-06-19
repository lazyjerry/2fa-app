# macOS 手動測試清單

每次 release 前至少各跑一次 Intel 與 Apple Silicon。測試結果記錄在 PR、release note 或 issue，不直接覆寫此清單。

## 測試矩陣

| 架構 | macOS 版本 | Package | 結果 |
| --- | --- | --- | --- |
| Intel | 待填 | unsigned `.app` / signed `.app` | 待測 |
| Apple Silicon | 待填 | unsigned `.app` / signed `.app` | ok |

## 基本功能

- 建立 vault：新安裝啟動後可建立主密碼。
- 解鎖 vault：正確密碼可登入，錯誤密碼會顯示錯誤。
- 新增驗證碼：圖片、URI、手動 secret 都可新增 TOTP。
- QR 解析失敗：非 `otpauth://` QR 或無 QR 圖片會顯示錯誤，且可重新選檔或貼上。
- 搜尋：issuer、帳號、分類、名稱可篩選清單。
- 複製：複製驗證碼後顯示提示，剪貼簿倒數清空設定有效。
- 設定：遮蔽驗證碼、自動鎖定、剪貼簿清空秒數、平台截圖防護開關可保存。
- 鎖定：手動鎖定後清單與驗證碼不可讀取。

## 隱私與截圖防護

- Screenshot：使用 `Command + Shift + 4` 或 `Command + Shift + 5` 擷取 Secure 2FA 視窗。
- QuickTime：錄製 Secure 2FA 視窗或整個螢幕。
- 螢幕分享：使用 FaceTime、Meet、Zoom 或 macOS Screen Sharing 分享包含 Secure 2FA 的畫面。
- 失焦：解鎖後切到其他 APP，驗證碼畫面需套用遮蔽。
- 最小化：最小化前不應留下可讀驗證碼畫面；回復視窗後可正常解除遮蔽。
- 切換 Desktop / Space：離開目前桌面時套用遮蔽，回到 APP 後解除遮蔽。

## Package 與資料

- 初次啟動：unsigned package 可開啟；signed/notarized package 不出現 Gatekeeper 警告。
- 資料目錄：設定頁顯示的資料目錄位於目前 OS 使用者範圍。
- 重啟保存：關閉 APP 後重啟，vault 與設定仍可讀取。
- 備份還原：匯出後匯入到新 vault，重複帳號會略過。
