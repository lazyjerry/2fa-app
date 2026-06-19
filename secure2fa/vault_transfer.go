package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
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

var otpauthPattern = regexp.MustCompile(`otpauth://[^\s"'<>]+`)

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

func (a *App) ImportAccounts(payload string) (ImportResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return ImportResult{}, err
	}

	incoming, err := parseBatchAccounts(payload)
	if err != nil {
		return ImportResult{}, err
	}
	result := mergeAccounts(a.vault, incoming)
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

func parseBatchAccounts(payload string) ([]Account, error) {
	trimmed := strings.TrimSpace(payload)
	if trimmed == "" {
		return nil, errors.New("import file is empty")
	}

	if json.Valid([]byte(trimmed)) {
		accounts, err := parseBatchAccountsJSON(trimmed)
		if err != nil {
			return nil, err
		}
		if len(accounts) > 0 {
			return accounts, nil
		}
	}

	accounts, err := parseBatchAccountsText(trimmed)
	if err != nil {
		return nil, err
	}
	if len(accounts) == 0 {
		return nil, errors.New("no supported accounts found in file")
	}
	return accounts, nil
}

func parseBatchAccountsJSON(payload string) ([]Account, error) {
	var root any
	if err := json.Unmarshal([]byte(payload), &root); err != nil {
		return nil, errors.New("import file is not valid JSON")
	}

	collector := &batchCollector{}
	collectBatchAccounts(root, collector)
	if len(collector.accounts) > 0 {
		return collector.accounts, nil
	}
	if collector.firstErr != nil {
		return nil, collector.firstErr
	}
	return nil, errors.New("no supported accounts found in JSON")
}

func parseBatchAccountsText(payload string) ([]Account, error) {
	matches := otpauthPattern.FindAllString(payload, -1)
	if len(matches) == 0 {
		return nil, errors.New("file does not contain otpauth URIs")
	}

	accounts := make([]Account, 0, len(matches))
	for _, uri := range matches {
		account, err := accountFromURI(URIAccountInput{URI: uri})
		if err != nil {
			return nil, fmt.Errorf("invalid otpauth URI: %w", err)
		}
		if strings.TrimSpace(account.Notes) == "" {
			account.Notes = account.Name
		}
		accounts = append(accounts, account)
	}
	return accounts, nil
}

type batchCollector struct {
	accounts []Account
	firstErr error
}

func collectBatchAccounts(value any, collector *batchCollector) {
	switch node := value.(type) {
	case []any:
		for _, item := range node {
			collectBatchAccounts(item, collector)
		}
	case map[string]any:
		if account, ok, err := accountFromBatchMap(node); err != nil {
			if collector.firstErr == nil {
				collector.firstErr = err
			}
		} else if ok {
			collector.accounts = append(collector.accounts, account)
		}
		for _, v := range node {
			switch v.(type) {
			case map[string]any, []any:
				collectBatchAccounts(v, collector)
			}
		}
	case string:
		uri := strings.TrimSpace(node)
		if strings.HasPrefix(strings.ToLower(uri), "otpauth://") {
			account, err := accountFromURI(URIAccountInput{URI: uri})
			if err != nil {
				if collector.firstErr == nil {
					collector.firstErr = fmt.Errorf("invalid otpauth URI: %w", err)
				}
				return
			}
			if strings.TrimSpace(account.Notes) == "" {
				account.Notes = account.Name
			}
			collector.accounts = append(collector.accounts, account)
		}
	}
}

func accountFromBatchMap(node map[string]any) (Account, bool, error) {
	otpType := strings.ToLower(strings.TrimSpace(firstString(node, "type", "otpType", "otp_type")))
	if otpType != "" && otpType != "totp" {
		return Account{}, false, nil
	}

	uri := firstString(node, "uri", "otpauth", "otpauthUri", "otpauth_uri", "otpauthURL", "otpauth_url")
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(uri)), "otpauth://") {
		account, err := accountFromURI(URIAccountInput{URI: uri})
		if err != nil {
			return Account{}, false, fmt.Errorf("invalid otpauth URI: %w", err)
		}
		if strings.TrimSpace(account.Notes) == "" {
			account.Notes = account.Name
		}
		if category := strings.TrimSpace(firstString(node, "category", "group")); category != "" {
			account.Category = category
		}
		return account, true, nil
	}

	secret := firstString(node, "secret", "key", "token", "base32", "otpSecret")
	if strings.TrimSpace(secret) == "" {
		return Account{}, false, nil
	}

	issuer := strings.TrimSpace(firstString(node, "issuer", "provider", "service", "site"))
	name := strings.TrimSpace(firstString(node, "name", "account", "accountName", "account_name", "username", "email"))
	label := strings.TrimSpace(firstString(node, "label", "title"))
	labelIssuer, labelName := splitBatchLabel(label)
	if issuer == "" {
		issuer = labelIssuer
	}
	if name == "" {
		name = labelName
	}
	if issuer == "" || name == "" {
		return Account{}, false, errors.New("account entry is missing issuer or account name")
	}

	algorithm := strings.TrimSpace(firstString(node, "algorithm", "algo", "hash"))
	digits := firstInt(node, 6, "digits", "codeDigits", "code_digits")
	period := firstInt(node, 30, "period", "step", "timestep", "timeStep")
	category := strings.TrimSpace(firstString(node, "category", "group"))
	notes := strings.TrimSpace(firstString(node, "notes", "note", "displayName", "nickname", "title"))
	if notes == "" {
		notes = name
	}

	account, err := accountFromInput(AccountInput{
		Issuer:    issuer,
		Name:      name,
		Secret:    secret,
		Category:  category,
		Notes:     notes,
		Algorithm: algorithm,
		Digits:    digits,
		Period:    period,
	})
	if err != nil {
		return Account{}, false, err
	}
	return account, true, nil
}

func firstString(node map[string]any, keys ...string) string {
	for _, key := range keys {
		value, ok := node[key]
		if !ok || value == nil {
			continue
		}
		switch typed := value.(type) {
		case string:
			if s := strings.TrimSpace(typed); s != "" {
				return s
			}
		case json.Number:
			if s := strings.TrimSpace(typed.String()); s != "" {
				return s
			}
		case float64:
			return strconv.FormatFloat(typed, 'f', -1, 64)
		case int:
			return strconv.Itoa(typed)
		}
	}
	return ""
}

func firstInt(node map[string]any, fallback int, keys ...string) int {
	for _, key := range keys {
		value, ok := node[key]
		if !ok || value == nil {
			continue
		}
		switch typed := value.(type) {
		case float64:
			if typed > 0 {
				return int(typed)
			}
		case int:
			if typed > 0 {
				return typed
			}
		case string:
			number, err := strconv.Atoi(strings.TrimSpace(typed))
			if err == nil && number > 0 {
				return number
			}
		}
	}
	return fallback
}

func splitBatchLabel(label string) (string, string) {
	trimmed := strings.TrimSpace(label)
	if trimmed == "" {
		return "", ""
	}
	parts := strings.SplitN(trimmed, ":", 2)
	if len(parts) == 2 {
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
	}
	return "", trimmed
}
