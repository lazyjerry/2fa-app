package main

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const exportFormat = "secure2fa-export"

type vaultExport struct {
	Format  string    `json:"format"`
	Version int       `json:"version"`
	KDF     kdfParams `json:"kdf"`
	Nonce   []byte    `json:"nonce"`
	Data    []byte    `json:"data"`
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
	return encryptExport(password, a.vault)
}

func (a *App) ImportVault(password, payload string) (ImportResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return ImportResult{}, err
	}

	imported, err := decryptExport(password, payload)
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

func encryptExport(password string, vault *VaultData) (string, error) {
	params := defaultKDF
	params.Salt = randomBytes(16)
	key := deriveKey(password, params)
	defer clearBytes(key)

	plain, err := json.Marshal(vault)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := randomBytes(gcm.NonceSize())
	exp := vaultExport{
		Format:  exportFormat,
		Version: 1,
		KDF:     params,
		Nonce:   nonce,
		Data:    gcm.Seal(nil, nonce, plain, nil),
	}
	out, err := json.MarshalIndent(exp, "", "  ")
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func decryptExport(password, payload string) (*VaultData, error) {
	var exp vaultExport
	if err := json.Unmarshal([]byte(payload), &exp); err != nil {
		return nil, errors.New("export file is not valid")
	}
	if exp.Format != exportFormat {
		return nil, errors.New("unrecognized export format")
	}
	if exp.KDF.Name != "argon2id" {
		return nil, errors.New("unsupported kdf in export file")
	}
	key := deriveKey(password, exp.KDF)
	defer clearBytes(key)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain, err := gcm.Open(nil, exp.Nonce, exp.Data, nil)
	if err != nil {
		return nil, errors.New("password is incorrect or export is damaged")
	}
	var vault VaultData
	if err := json.Unmarshal(plain, &vault); err != nil {
		return nil, err
	}
	return &vault, nil
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
