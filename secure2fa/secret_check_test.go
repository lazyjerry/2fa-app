package main

import "testing"

func TestValidateSecret(t *testing.T) {
	app := newUnlockedApp(t)

	if got := app.ValidateSecret("   "); !got.Empty {
		t.Fatalf("blank secret should be empty: %#v", got)
	}
	if got := app.ValidateSecret("not base32!!"); got.Valid {
		t.Fatalf("invalid secret should not be valid: %#v", got)
	}
	if got := app.ValidateSecret("JBSWY3DPEHPK3PXQ"); !got.Valid || got.Duplicate {
		t.Fatalf("fresh valid secret should be valid and unique: %#v", got)
	}

	// newUnlockedApp already stores JBSWY3DPEHPK3PXP for Example/user@example.com.
	dup := app.ValidateSecret("jbswy3dp ehpk3pxp")
	if !dup.Valid || !dup.Duplicate {
		t.Fatalf("matching secret should be flagged duplicate: %#v", dup)
	}
	if dup.DuplicateLabel != "Example / user@example.com" {
		t.Fatalf("unexpected duplicate label: %q", dup.DuplicateLabel)
	}
}
