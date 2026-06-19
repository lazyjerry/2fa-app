package main

import "time"

type SetupState struct {
	HasVault             bool   `json:"hasVault"`
	Unlocked             bool   `json:"unlocked"`
	UserDataPath         string `json:"userDataPath"`
	OSUserScoped         bool   `json:"osUserScoped"`
	Platform             string `json:"platform"`
	BiometricAvailable   bool   `json:"biometricAvailable"`
	BiometricDescription string `json:"biometricDescription"`
	ScreenshotProtection bool   `json:"screenshotProtection"`
}

type SessionState struct {
	Unlocked     bool     `json:"unlocked"`
	AccountCount int      `json:"accountCount"`
	Settings     Settings `json:"settings"`
}

type Settings struct {
	MaskCodes             bool   `json:"maskCodes"`
	AutoLockSeconds       int    `json:"autoLockSeconds"`
	ClipboardClearSeconds int    `json:"clipboardClearSeconds"`
	ScreenshotProtection  bool   `json:"screenshotProtection"`
	Theme                 string `json:"theme"`
}

type Account struct {
	ID        string    `json:"id"`
	Issuer    string    `json:"issuer"`
	Name      string    `json:"name"`
	Secret    string    `json:"secret"`
	Category  string    `json:"category"`
	Notes     string    `json:"notes"`
	Algorithm string    `json:"algorithm"`
	Digits    int       `json:"digits"`
	Period    int       `json:"period"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type AccountView struct {
	ID        string    `json:"id"`
	Issuer    string    `json:"issuer"`
	Name      string    `json:"name"`
	Category  string    `json:"category"`
	Notes     string    `json:"notes"`
	Algorithm string    `json:"algorithm"`
	Digits    int       `json:"digits"`
	Period    int       `json:"period"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type CodeView struct {
	AccountView
	Code          string `json:"code"`
	TimeRemaining int    `json:"timeRemaining"`
}

type AccountInput struct {
	Issuer    string `json:"issuer"`
	Name      string `json:"name"`
	Secret    string `json:"secret"`
	Category  string `json:"category"`
	Notes     string `json:"notes"`
	Algorithm string `json:"algorithm"`
	Digits    int    `json:"digits"`
	Period    int    `json:"period"`
}

type URIAccountInput struct {
	URI      string `json:"uri"`
	Category string `json:"category"`
	Notes    string `json:"notes"`
}

type VaultData struct {
	Version  int       `json:"version"`
	Created  time.Time `json:"created"`
	Updated  time.Time `json:"updated"`
	Settings Settings  `json:"settings"`
	Accounts []Account `json:"accounts"`
}

type encryptedVault struct {
	Version int       `json:"version"`
	KDF     kdfParams `json:"kdf"`
	Nonce   []byte    `json:"nonce"`
	Data    []byte    `json:"data"`
	Updated time.Time `json:"updated"`
}

type kdfParams struct {
	Name    string `json:"name"`
	Salt    []byte `json:"salt"`
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
	KeyLen  uint32 `json:"keyLen"`
}
