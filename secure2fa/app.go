package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const appDataDirName = "Secure2FA"

type App struct {
	ctx        context.Context
	mu         sync.Mutex
	storageDir string
	vault      *VaultData
	sessionKey []byte
	// lastCopiedCode 記錄最近一次寫入剪貼簿的驗證碼，用於倒數清空前確認
	// 剪貼簿內容仍是我們寫入的碼，避免覆蓋使用者期間新複製的內容。
	lastCopiedCode             string
	launchScreenshotProtection bool
}

func NewApp() *App {
	return &App{launchScreenshotProtection: true}
}

func NewAppWithStorage(storageDir string) *App {
	return &App{storageDir: storageDir, launchScreenshotProtection: true}
}

func (a *App) SetLaunchScreenshotProtection(enabled bool) {
	a.launchScreenshotProtection = enabled
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) GetSetupState() (SetupState, error) {
	dir, err := a.resolveStorageDir()
	if err != nil {
		return SetupState{}, err
	}
	_, statErr := os.Stat(filepath.Join(dir, vaultFileName))
	hasVault := statErr == nil
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return SetupState{}, statErr
	}

	return SetupState{
		HasVault:             hasVault,
		Unlocked:             a.isUnlocked(),
		UserDataPath:         dir,
		OSUserScoped:         true,
		Platform:             runtime.GOOS,
		BiometricAvailable:   biometricAvailable(),
		BiometricEnrolled:    biometricEnrolled(),
		BiometricDescription: biometricStatus(),
		ScreenshotProtection: contentProtectionAvailable() && a.launchScreenshotProtection,
	}, nil
}

func (a *App) CreateVault(password string) (SessionState, error) {
	if err := validatePassword(password); err != nil {
		return SessionState{}, err
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	dir, err := a.resolveStorageDir()
	if err != nil {
		return SessionState{}, err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return SessionState{}, err
	}
	path := filepath.Join(dir, vaultFileName)
	if _, err := os.Stat(path); err == nil {
		return SessionState{}, errors.New("vault already exists")
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return SessionState{}, err
	}

	vault := defaultVaultData()
	key, err := createEncryptedVault(path, password, vault)
	if err != nil {
		return SessionState{}, err
	}

	a.setSessionLocked(vault, key)
	return a.sessionStateLocked(), nil
}

func (a *App) UnlockVault(password string) (SessionState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	path, err := a.vaultPath()
	if err != nil {
		return SessionState{}, err
	}
	vault, key, err := openEncryptedVault(path, password)
	if err != nil {
		return SessionState{}, errors.New("password is incorrect or vault is damaged")
	}
	a.setSessionLocked(vault, key)
	return a.sessionStateLocked(), nil
}

func (a *App) LockVault() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.clearSessionLocked()
	// 主動回收：丟掉 vault 參考後立即 GC 並把釋出的頁面歸還 OS，
	// 縮短明文 secret（無法抹除的 Go string）殘留在 heap 的時間視窗。
	runtime.GC()
	debug.FreeOSMemory()
	return nil
}

// setSessionLocked 取代目前 session，覆寫前先清掉舊的 key material。
// 呼叫端必須持有 a.mu。
func (a *App) setSessionLocked(vault *VaultData, key []byte) {
	if a.sessionKey != nil {
		clearBytes(a.sessionKey)
	}
	a.vault = vault
	a.sessionKey = key
}

// clearSessionLocked 清除記憶體中的 session key 與 vault 參考。
// sessionKey 為 []byte 可逐位元組歸零；vault 內的 secret 是 Go string，
// 無法就地抹除，只能丟棄參考交由 GC 回收。呼叫端必須持有 a.mu。
func (a *App) clearSessionLocked() {
	clearBytes(a.sessionKey)
	a.sessionKey = nil
	a.vault = nil
	a.lastCopiedCode = ""
}

func (a *App) GetAccounts() ([]AccountView, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return nil, err
	}
	return accountViews(a.vault.Accounts), nil
}

func (a *App) GetCodes() ([]CodeView, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return nil, err
	}
	return codeViews(a.vault.Accounts, time.Now())
}

func (a *App) AddAccount(input AccountInput) (AccountView, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return AccountView{}, err
	}
	account, err := accountFromInput(input)
	if err != nil {
		return AccountView{}, err
	}
	a.vault.Accounts = append(a.vault.Accounts, account)
	if err := a.saveLocked(); err != nil {
		return AccountView{}, err
	}
	return viewForAccount(account), nil
}

func (a *App) AddAccountFromURI(input URIAccountInput) (AccountView, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return AccountView{}, err
	}
	account, err := accountFromURI(input)
	if err != nil {
		return AccountView{}, err
	}
	a.vault.Accounts = append(a.vault.Accounts, account)
	if err := a.saveLocked(); err != nil {
		return AccountView{}, err
	}
	return viewForAccount(account), nil
}

func (a *App) UpdateAccount(id string, input AccountInput) (AccountView, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return AccountView{}, err
	}
	for i := range a.vault.Accounts {
		if a.vault.Accounts[i].ID == id {
			updated := a.vault.Accounts[i]
			if strings.TrimSpace(input.Secret) != "" {
				replacement, err := accountFromInput(input)
				if err != nil {
					return AccountView{}, err
				}
				updated.Secret = replacement.Secret
				updated.Algorithm = replacement.Algorithm
				updated.Digits = replacement.Digits
				updated.Period = replacement.Period
			}
			if strings.TrimSpace(input.Issuer) != "" {
				updated.Issuer = strings.TrimSpace(input.Issuer)
			}
			if strings.TrimSpace(input.Name) != "" {
				updated.Name = strings.TrimSpace(input.Name)
			}
			updated.Category = strings.TrimSpace(input.Category)
			updated.Notes = strings.TrimSpace(input.Notes)
			updated.UpdatedAt = time.Now()
			a.vault.Accounts[i] = updated
			if err := a.saveLocked(); err != nil {
				return AccountView{}, err
			}
			return viewForAccount(updated), nil
		}
	}
	return AccountView{}, errors.New("account not found")
}

func (a *App) DeleteAccount(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return err
	}
	for i := range a.vault.Accounts {
		if a.vault.Accounts[i].ID == id {
			a.vault.Accounts = append(a.vault.Accounts[:i], a.vault.Accounts[i+1:]...)
			return a.saveLocked()
		}
	}
	return errors.New("account not found")
}

func (a *App) GetSettings() (Settings, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return Settings{}, err
	}
	return a.vault.Settings, nil
}

func (a *App) SaveSettings(settings Settings) (Settings, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return Settings{}, err
	}
	a.vault.Settings = normalizedSettings(settings)
	if err := a.saveLocked(); err != nil {
		return Settings{}, err
	}
	if err := saveLaunchSettings(LaunchSettings{ScreenshotProtection: a.vault.Settings.ScreenshotProtection}); err != nil {
		return Settings{}, err
	}
	return a.vault.Settings, nil
}

func (a *App) CopyCode(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return err
	}
	code, err := codeForAccountID(a.vault.Accounts, id, time.Now())
	if err != nil {
		return err
	}
	if a.ctx == nil {
		return errors.New("runtime context is not ready")
	}
	if err := wailsruntime.ClipboardSetText(a.ctx, code); err != nil {
		return err
	}
	a.lastCopiedCode = code
	return nil
}

// ClearClipboard 只在剪貼簿內容仍是本程式最後寫入的驗證碼時才清空，
// 避免覆蓋使用者在倒數期間新複製的其他內容。讀取失敗時保守略過不清空。
func (a *App) ClearClipboard() error {
	if a.ctx == nil {
		return errors.New("runtime context is not ready")
	}
	a.mu.Lock()
	expected := a.lastCopiedCode
	a.mu.Unlock()
	if expected == "" {
		return nil
	}
	current, err := wailsruntime.ClipboardGetText(a.ctx)
	if err != nil {
		return err
	}
	if current != expected {
		return nil
	}
	if err := wailsruntime.ClipboardSetText(a.ctx, ""); err != nil {
		return err
	}
	a.mu.Lock()
	if a.lastCopiedCode == expected {
		a.lastCopiedCode = ""
	}
	a.mu.Unlock()
	return nil
}

func (a *App) isUnlocked() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.vault != nil && len(a.sessionKey) > 0
}

func (a *App) sessionStateLocked() SessionState {
	return SessionState{
		Unlocked:     true,
		AccountCount: len(a.vault.Accounts),
		Settings:     a.vault.Settings,
	}
}

func (a *App) requireUnlockedLocked() error {
	if a.vault == nil || len(a.sessionKey) == 0 {
		return errors.New("vault is locked")
	}
	return nil
}

func (a *App) saveLocked() error {
	path, err := a.vaultPath()
	if err != nil {
		return err
	}
	return saveEncryptedVault(path, a.sessionKey, a.vault)
}

func (a *App) vaultPath() (string, error) {
	dir, err := a.resolveStorageDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, vaultFileName), nil
}

func (a *App) resolveStorageDir() (string, error) {
	if a.storageDir != "" {
		return a.storageDir, nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("user config dir: %w", err)
	}
	return filepath.Join(dir, appDataDirName), nil
}
