package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

const vaultFileName = "vault.json"

var defaultKDF = kdfParams{
	Name:    "argon2id",
	Time:    3,
	Memory:  64 * 1024,
	Threads: 4,
	KeyLen:  32,
}

func validatePassword(password string) error {
	if len([]rune(password)) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	return nil
}

func defaultVaultData() *VaultData {
	now := time.Now()
	return &VaultData{
		Version: 1,
		Created: now,
		Updated: now,
		Settings: Settings{
			MaskCodes:             true,
			AutoLockSeconds:       300,
			ClipboardClearSeconds: 20,
			ScreenshotProtection:  true,
			Theme:                 "system",
		},
		Accounts: []Account{},
	}
}

func createEncryptedVault(path, password string, vault *VaultData) ([]byte, error) {
	params := defaultKDF
	params.Salt = randomBytes(16)
	key := deriveKey(password, params)
	if err := writeEncryptedVault(path, key, params, vault); err != nil {
		clearBytes(key)
		return nil, err
	}
	return key, nil
}

func openEncryptedVault(path, password string) (*VaultData, []byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	var file encryptedVault
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, nil, err
	}
	if file.KDF.Name != "argon2id" {
		return nil, nil, fmt.Errorf("unsupported kdf: %s", file.KDF.Name)
	}
	key := deriveKey(password, file.KDF)
	vault, err := decryptVault(file, key)
	if err != nil {
		clearBytes(key)
		return nil, nil, err
	}
	return vault, key, nil
}

func saveEncryptedVault(path string, key []byte, vault *VaultData) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var file encryptedVault
	if err := json.Unmarshal(raw, &file); err != nil {
		return err
	}
	return writeEncryptedVault(path, key, file.KDF, vault)
}

func writeEncryptedVault(path string, key []byte, params kdfParams, vault *VaultData) error {
	vault.Updated = time.Now()
	plain, err := json.MarshalIndent(vault, "", "  ")
	if err != nil {
		return err
	}
	defer clearBytes(plain) // 明文含全部 secret，封裝後歸零
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	nonce := randomBytes(gcm.NonceSize())
	file := encryptedVault{
		Version: 1,
		KDF:     params,
		Nonce:   nonce,
		Data:    gcm.Seal(nil, nonce, plain, nil),
		Updated: vault.Updated,
	}
	out, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, out, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func decryptVault(file encryptedVault, key []byte) (*VaultData, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain, err := gcm.Open(nil, file.Nonce, file.Data, nil)
	if err != nil {
		return nil, err
	}
	defer clearBytes(plain) // 解密後的明文含全部 secret，解析完即歸零
	var vault VaultData
	if err := json.Unmarshal(plain, &vault); err != nil {
		return nil, err
	}
	vault.Settings = normalizedSettings(vault.Settings)
	return &vault, nil
}

func deriveKey(password string, params kdfParams) []byte {
	return argon2.IDKey([]byte(password), params.Salt, params.Time, params.Memory, params.Threads, params.KeyLen)
}

func randomBytes(size int) []byte {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return buf
}

func clearBytes(buf []byte) {
	for i := range buf {
		buf[i] = 0
	}
}

func normalizedSettings(settings Settings) Settings {
	if settings.AutoLockSeconds < 30 {
		settings.AutoLockSeconds = 30
	}
	if settings.ClipboardClearSeconds < 0 {
		settings.ClipboardClearSeconds = 0
	}
	if settings.ClipboardClearSeconds > 300 {
		settings.ClipboardClearSeconds = 300
	}
	switch strings.ToLower(settings.Theme) {
	case "light", "dark", "system":
	default:
		settings.Theme = "system"
	}
	return settings
}
