package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestUnlockRejectsWrongPassword(t *testing.T) {
	app := newUnlockedApp(t)
	if err := app.LockVault(); err != nil {
		t.Fatalf("LockVault() error = %v", err)
	}

	if _, err := app.UnlockVault("wrong password"); err == nil {
		t.Fatal("UnlockVault() should reject an incorrect password")
	}
	if app.isUnlocked() {
		t.Fatal("vault should remain locked after incorrect password")
	}
}

func TestUnlockRejectsDamagedVaultFile(t *testing.T) {
	dir := t.TempDir()
	app := NewAppWithStorage(dir)
	if _, err := app.CreateVault(testPassword); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}
	if err := app.LockVault(); err != nil {
		t.Fatalf("LockVault() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, vaultFileName), []byte("{not valid vault json"), 0600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	if _, err := app.UnlockVault(testPassword); err == nil {
		t.Fatal("UnlockVault() should reject a damaged vault file")
	}
	if app.isUnlocked() {
		t.Fatal("vault should remain locked after damaged vault file")
	}
}

func TestSaveSettingsNormalizesBoundaries(t *testing.T) {
	setTestUserConfigDir(t)
	app := newUnlockedApp(t)

	got, err := app.SaveSettings(Settings{
		MaskCodes:             true,
		AutoLockSeconds:       1,
		ClipboardClearSeconds: -5,
		ScreenshotProtection:  true,
		Theme:                 "unknown",
	})
	if err != nil {
		t.Fatalf("SaveSettings() low boundary error = %v", err)
	}
	if got.AutoLockSeconds != 30 {
		t.Fatalf("AutoLockSeconds = %d, want 30", got.AutoLockSeconds)
	}
	if got.ClipboardClearSeconds != 0 {
		t.Fatalf("ClipboardClearSeconds = %d, want 0", got.ClipboardClearSeconds)
	}
	if got.Theme != "system" {
		t.Fatalf("Theme = %q, want system", got.Theme)
	}

	got, err = app.SaveSettings(Settings{
		MaskCodes:             true,
		AutoLockSeconds:       3600,
		ClipboardClearSeconds: 999,
		ScreenshotProtection:  true,
		Theme:                 "dark",
	})
	if err != nil {
		t.Fatalf("SaveSettings() high boundary error = %v", err)
	}
	if got.AutoLockSeconds != 3600 {
		t.Fatalf("AutoLockSeconds = %d, want 3600", got.AutoLockSeconds)
	}
	if got.ClipboardClearSeconds != 300 {
		t.Fatalf("ClipboardClearSeconds = %d, want 300", got.ClipboardClearSeconds)
	}
	if got.Theme != "dark" {
		t.Fatalf("Theme = %q, want dark", got.Theme)
	}
}

func TestDeleteAccountRemovesOnlyMatchingAccount(t *testing.T) {
	app := newUnlockedApp(t)
	second, err := app.AddAccount(AccountInput{
		Issuer: "Second",
		Name:   "second@example.com",
		Secret: "JBSWY3DPEHPK3PXQ",
	})
	if err != nil {
		t.Fatalf("AddAccount() second error = %v", err)
	}

	if err := app.DeleteAccount(second.ID); err != nil {
		t.Fatalf("DeleteAccount() error = %v", err)
	}
	accounts, err := app.GetAccounts()
	if err != nil {
		t.Fatalf("GetAccounts() error = %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("expected 1 account after delete, got %d", len(accounts))
	}
	if accounts[0].Issuer != "Example" {
		t.Fatalf("deleted wrong account: %#v", accounts)
	}

	if err := app.DeleteAccount(second.ID); err == nil {
		t.Fatal("DeleteAccount() should reject a missing account")
	}
}
