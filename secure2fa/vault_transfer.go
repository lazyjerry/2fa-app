package main

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const exportFormat = "secure2fa-export"

// plainExport 是未加密的明文備份格式：直接包含帳號（含 TOTP secret 明文）。
type plainExport struct {
	Format   string    `json:"format"`
	Version  int       `json:"version"`
	Exported time.Time `json:"exported"`
	Accounts []Account `json:"accounts"`
}

type ImportResult struct {
	Added   int `json:"added"`
	Skipped int `json:"skipped"`
	Total   int `json:"total"`
}

func (a *App) ChangePassword(currentPassword, newPassword string) error {
	if err := validatePassword(newPassword); err != nil {
		return err
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return err
	}

	path, err := a.vaultPath()
	if err != nil {
		return err
	}
	if err := a.verifyPasswordLocked(path, currentPassword); err != nil {
		return errors.New("current password is incorrect")
	}

	newKey, err := createEncryptedVault(path, newPassword, a.vault)
	if err != nil {
		return err
	}
	clearBytes(a.sessionKey)
	a.sessionKey = newKey
	return nil
}

func (a *App) ExportVault(password string) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return "", err
	}

	path, err := a.vaultPath()
	if err != nil {
		return "", err
	}
	if err := a.verifyPasswordLocked(path, password); err != nil {
		return "", errors.New("password is incorrect")
	}
	return marshalPlainExport(a.vault)
}

// ExportVaultToFile 先產生明文備份，再以原生儲存對話框讓使用者選擇位置寫檔。
// 回傳實際儲存路徑；使用者取消時回傳空字串且不視為錯誤。
func (a *App) ExportVaultToFile(password string) (string, error) {
	payload, err := a.ExportVault(password)
	if err != nil {
		return "", err
	}

	if a.ctx == nil {
		return "", errors.New("runtime context is not ready")
	}
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "匯出備份",
		DefaultFilename: "secure2fa-export-" + time.Now().Format("2006-01-02") + ".json",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "JSON 備份檔 (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

// ImportVaultFromFile 以原生開檔對話框讓使用者選擇明文備份檔，讀取後匯入。
// 使用者取消時回傳 Total 為 0 的空結果且不視為錯誤。
func (a *App) ImportVaultFromFile() (ImportResult, error) {
	if a.ctx == nil {
		return ImportResult{}, errors.New("runtime context is not ready")
	}
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "匯入備份",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "JSON 備份檔 (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return ImportResult{}, err
	}
	if path == "" {
		return ImportResult{}, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ImportResult{}, err
	}
	return a.ImportVault(string(data))
}

func (a *App) ImportVault(payload string) (ImportResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return ImportResult{}, err
	}

	imported, err := parsePlainExport(payload)
	if err != nil {
		return ImportResult{}, err
	}
	result := mergeAccounts(a.vault, imported.Accounts)
	if result.Added > 0 {
		if err := a.saveLocked(); err != nil {
			return ImportResult{}, err
		}
	}
	return result, nil
}

// verifyPasswordLocked confirms password matches the on-disk vault without
// disturbing the active session key.
func (a *App) verifyPasswordLocked(path, password string) error {
	_, key, err := openEncryptedVault(path, password)
	if err != nil {
		return err
	}
	clearBytes(key)
	return nil
}

func marshalPlainExport(vault *VaultData) (string, error) {
	exp := plainExport{
		Format:   exportFormat,
		Version:  1,
		Exported: time.Now(),
		Accounts: vault.Accounts,
	}
	out, err := json.MarshalIndent(exp, "", "  ")
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func parsePlainExport(payload string) (*VaultData, error) {
	var exp plainExport
	if err := json.Unmarshal([]byte(payload), &exp); err != nil {
		return nil, errors.New("export file is not valid")
	}
	if exp.Format != exportFormat {
		return nil, errors.New("unrecognized export format")
	}
	return &VaultData{Accounts: exp.Accounts}, nil
}

func mergeAccounts(vault *VaultData, incoming []Account) ImportResult {
	existing := make(map[string]bool, len(vault.Accounts))
	for _, acc := range vault.Accounts {
		existing[dedupKey(acc)] = true
	}

	result := ImportResult{Total: len(incoming)}
	now := time.Now()
	for _, acc := range incoming {
		key := dedupKey(acc)
		if existing[key] {
			result.Skipped++
			continue
		}
		acc.ID = newID()
		if acc.CreatedAt.IsZero() {
			acc.CreatedAt = now
		}
		acc.UpdatedAt = now
		vault.Accounts = append(vault.Accounts, acc)
		existing[key] = true
		result.Added++
	}
	return result
}

func dedupKey(acc Account) string {
	return strings.ToLower(strings.TrimSpace(acc.Issuer)) + "\x00" +
		strings.ToLower(strings.TrimSpace(acc.Name)) + "\x00" +
		normalizeSecret(acc.Secret)
}
