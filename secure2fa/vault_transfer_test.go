package main

import "testing"

const testPassword = "correct horse battery staple"

func newUnlockedApp(t *testing.T) *App {
	t.Helper()
	app := NewAppWithStorage(t.TempDir())
	if _, err := app.CreateVault(testPassword); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}
	if _, err := app.AddAccount(AccountInput{
		Issuer: "Example",
		Name:   "user@example.com",
		Secret: "JBSWY3DPEHPK3PXP",
	}); err != nil {
		t.Fatalf("AddAccount() error = %v", err)
	}
	return app
}

func TestChangePasswordReEncrypts(t *testing.T) {
	app := newUnlockedApp(t)

	if err := app.ChangePassword("wrong password", "brand new password"); err == nil {
		t.Fatal("ChangePassword() should reject an incorrect current password")
	}
	if err := app.ChangePassword(testPassword, "short"); err == nil {
		t.Fatal("ChangePassword() should reject a too-short new password")
	}
	if err := app.ChangePassword(testPassword, "brand new password"); err != nil {
		t.Fatalf("ChangePassword() error = %v", err)
	}

	if err := app.LockVault(); err != nil {
		t.Fatalf("LockVault() error = %v", err)
	}
	if _, err := app.UnlockVault(testPassword); err == nil {
		t.Fatal("UnlockVault() should fail with the old password")
	}
	if _, err := app.UnlockVault("brand new password"); err != nil {
		t.Fatalf("UnlockVault() with new password error = %v", err)
	}
	accounts, err := app.GetAccounts()
	if err != nil {
		t.Fatalf("GetAccounts() error = %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("expected 1 account after re-encrypt, got %d", len(accounts))
	}
}

func TestExportImportRoundTrip(t *testing.T) {
	source := newUnlockedApp(t)

	if _, err := source.ExportVault("wrong password"); err == nil {
		t.Fatal("ExportVault() should reject an incorrect password")
	}
	payload, err := source.ExportVault(testPassword)
	if err != nil {
		t.Fatalf("ExportVault() error = %v", err)
	}

	dest := NewAppWithStorage(t.TempDir())
	if _, err := dest.CreateVault(testPassword); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}

	result, err := dest.ImportVault(payload)
	if err != nil {
		t.Fatalf("ImportVault() error = %v", err)
	}
	if result.Added != 1 || result.Skipped != 0 || result.Total != 1 {
		t.Fatalf("unexpected import result: %#v", result)
	}

	// Re-importing the same payload must skip the duplicate.
	again, err := dest.ImportVault(payload)
	if err != nil {
		t.Fatalf("ImportVault() second call error = %v", err)
	}
	if again.Added != 0 || again.Skipped != 1 {
		t.Fatalf("expected duplicate to be skipped, got: %#v", again)
	}

	accounts, err := dest.GetAccounts()
	if err != nil {
		t.Fatalf("GetAccounts() error = %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("expected 1 account after import, got %d", len(accounts))
	}

	codes, err := dest.GetCodes()
	if err != nil {
		t.Fatalf("GetCodes() error = %v", err)
	}
	if len(codes) != 1 || len(codes[0].Code) != 6 {
		t.Fatalf("imported account should produce a 6-digit code: %#v", codes)
	}
}

func TestImportRejectsCorruptPayload(t *testing.T) {
	app := newUnlockedApp(t)
	if _, err := app.ImportVault("{not a real export}"); err == nil {
		t.Fatal("ImportVault() should reject a corrupt payload")
	}
}

func TestImportAccountsFromBatchText(t *testing.T) {
	app := NewAppWithStorage(t.TempDir())
	if _, err := app.CreateVault(testPassword); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}

	payload := `
otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub
otpauth://totp/Google:user@example.com?secret=JBSWY3DPEHPK3PXQ&issuer=Google
`

	result, err := app.ImportAccounts(payload)
	if err != nil {
		t.Fatalf("ImportAccounts() error = %v", err)
	}
	if result.Total != 2 || result.Added != 2 || result.Skipped != 0 {
		t.Fatalf("unexpected import result: %#v", result)
	}

	again, err := app.ImportAccounts(payload)
	if err != nil {
		t.Fatalf("ImportAccounts() second call error = %v", err)
	}
	if again.Total != 2 || again.Added != 0 || again.Skipped != 2 {
		t.Fatalf("unexpected re-import result: %#v", again)
	}
}

func TestImportAccountsFromBatchJSON(t *testing.T) {
	app := NewAppWithStorage(t.TempDir())
	if _, err := app.CreateVault(testPassword); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}

	payload := `{
	  "accounts": [
	    {
	      "issuer": "Dropbox",
	      "name": "me@example.com",
	      "secret": "JBSWY3DPEHPK3PXR",
	      "algorithm": "SHA1",
	      "digits": 6,
	      "period": 30
	    },
	    {
	      "type": "hotp",
	      "issuer": "Unsupported",
	      "name": "ignored",
	      "secret": "JBSWY3DPEHPK3PXS"
	    }
	  ]
	}`

	result, err := app.ImportAccounts(payload)
	if err != nil {
		t.Fatalf("ImportAccounts() error = %v", err)
	}
	if result.Total != 1 || result.Added != 1 || result.Skipped != 0 {
		t.Fatalf("unexpected import result: %#v", result)
	}
}

func TestImportAccountsRejectsUnsupportedFormat(t *testing.T) {
	app := newUnlockedApp(t)
	if _, err := app.ImportAccounts("{\"accounts\":[{\"foo\":\"bar\"}]}"); err == nil {
		t.Fatal("ImportAccounts() should reject unsupported payload")
	}
}
