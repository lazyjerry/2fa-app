package main

import "testing"

func TestVaultRoundTripAndNoSecretInView(t *testing.T) {
	app := NewAppWithStorage(t.TempDir())
	if _, err := app.CreateVault("correct horse battery staple"); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}

	view, err := app.AddAccount(AccountInput{
		Issuer:   "Example",
		Name:     "user@example.com",
		Secret:   "JBSWY3DPEHPK3PXP",
		Category: "Work",
		Notes:    "primary login",
	})
	if err != nil {
		t.Fatalf("AddAccount() error = %v", err)
	}
	if view.Issuer != "Example" || view.Name != "user@example.com" {
		t.Fatalf("unexpected account view: %#v", view)
	}

	codes, err := app.GetCodes()
	if err != nil {
		t.Fatalf("GetCodes() error = %v", err)
	}
	if len(codes) != 1 || len(codes[0].Code) != 6 {
		t.Fatalf("unexpected codes: %#v", codes)
	}

	if err := app.LockVault(); err != nil {
		t.Fatalf("LockVault() error = %v", err)
	}
	if _, err := app.GetAccounts(); err == nil {
		t.Fatal("GetAccounts() should fail while locked")
	}
	if _, err := app.UnlockVault("correct horse battery staple"); err != nil {
		t.Fatalf("UnlockVault() error = %v", err)
	}
	accounts, err := app.GetAccounts()
	if err != nil {
		t.Fatalf("GetAccounts() error = %v", err)
	}
	if len(accounts) != 1 || accounts[0].ID == "" {
		t.Fatalf("unexpected accounts: %#v", accounts)
	}
}

func TestLockClearsKeyMaterial(t *testing.T) {
	app := NewAppWithStorage(t.TempDir())
	if _, err := app.CreateVault("correct horse battery staple"); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}

	app.mu.Lock()
	key := app.sessionKey
	app.lastCopiedCode = "123456"
	app.mu.Unlock()
	if len(key) == 0 {
		t.Fatal("expected non-empty session key after CreateVault")
	}

	if err := app.LockVault(); err != nil {
		t.Fatalf("LockVault() error = %v", err)
	}

	app.mu.Lock()
	defer app.mu.Unlock()
	if app.sessionKey != nil || app.vault != nil {
		t.Fatalf("expected key/vault nil after lock, got key=%v vault=%v", app.sessionKey, app.vault)
	}
	if app.lastCopiedCode != "" {
		t.Fatalf("expected lastCopiedCode cleared after lock, got %q", app.lastCopiedCode)
	}
	for i, b := range key {
		if b != 0 {
			t.Fatalf("session key byte %d not zeroed: %d", i, b)
		}
	}
}

func TestURIImport(t *testing.T) {
	account, err := accountFromURI(URIAccountInput{
		URI: "otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30",
	})
	if err != nil {
		t.Fatalf("accountFromURI() error = %v", err)
	}
	if account.Issuer != "GitHub" || account.Name != "user@example.com" {
		t.Fatalf("unexpected account: %#v", account)
	}
}
