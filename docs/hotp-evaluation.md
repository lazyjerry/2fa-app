# HOTP 支援評估

目前系統僅支援 TOTP。此文件評估導入 HOTP 的必要改動、風險與建議實作順序。

## 現況

目前 OTP 流程假設時間驅動：
- 新增帳號時只接受 TOTP 參數（algorithm、digits、period）。
- URI 匯入時明確拒絕非 totp 類型。
- 驗證碼列表依 period 倒數刷新。

結論：HOTP 不是單點補丁，會牽動資料模型、後端 API、前端互動與匯入邏輯。

## 必要改動

## 1) 資料模型

新增欄位：
- kind: totp 或 hotp
- counter: 僅 hotp 使用

相容策略：
- 舊資料沒有 kind 時，預設視為 totp。
- 舊資料沒有 counter 時，不影響 totp。

## 2) OTP 生成邏輯

- 新增 generateHOTP(secret, algorithm, digits, counter)。
- codeViews 對 hotp 帳號不應顯示時間倒數。
- hotp 需要「取得碼且遞增 counter」的原子操作。

## 3) 後端 API

- 新增專用方法，例如 NextHOTPCode(accountID)。
- 讀取後必須先保存新 counter，避免重複碼。
- 競態控制需維持 mutex 內單次遞增與寫檔。

## 4) 前端 UI/UX

- 新增帳號表單可選 OTP 類型。
- hotp 帳號顯示「下一組碼」按鈕，非每秒更新。
- 清單上要清楚區分 TOTP 與 HOTP，避免誤用。

## 5) 匯入與 URI

- URI 匯入需支援 otpauth://hotp。
- 若 URI 無 counter，需拒絕或要求使用者補填。
- 批次匯入需保留類型與 counter。

## 6) 測試

至少新增：
- hotp 產碼正確性測試（RFC 向量）。
- counter 每次請求遞增且落盤保存。
- 並行請求不重複碼。
- 舊 vault 升級相容性。

## 風險

1. 可靠性風險
   - counter 若未正確落盤，會重複產生舊碼。
2. 使用性風險
   - 使用者可能把 HOTP 當 TOTP 使用，導致驗證失敗。
3. 相容風險
   - 匯入來源對 counter 欄位支援不一致。

## 建議實作路線

階段 1：後端先行
- 完成資料模型與產碼 API。
- 補齊測試。

階段 2：前端整合
- 加入 HOTP 互動按鈕與型別顯示。
- 維持既有 TOTP 操作不變。

階段 3：匯入強化
- 補 otpauth://hotp 與批次格式細節。
- 增加錯誤提示文案。

## 採納建議

建議採納 HOTP 支援，條件如下：
- 先完成後端原子遞增與保存保證。
- 先上線最小可用版本（手動新增 + 基本顯示 + next code）。
- 匯入與進階 UX 作為第二階段。
