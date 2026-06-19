package main

import "testing"

func addNamed(t *testing.T, app *App, issuer string) string {
	t.Helper()
	view, err := app.AddAccount(AccountInput{Issuer: issuer, Name: issuer + "@example.com", Secret: "JBSWY3DPEHPK3PXP"})
	if err != nil {
		t.Fatalf("AddAccount(%s) error = %v", issuer, err)
	}
	return view.ID
}

func order(t *testing.T, app *App) []string {
	t.Helper()
	accounts, err := app.GetAccounts()
	if err != nil {
		t.Fatalf("GetAccounts() error = %v", err)
	}
	ids := make([]string, len(accounts))
	for i, acc := range accounts {
		ids[i] = acc.Issuer
	}
	return ids
}

func TestMoveAndPinAccounts(t *testing.T) {
	app := NewAppWithStorage(t.TempDir())
	if _, err := app.CreateVault("correct horse battery staple"); err != nil {
		t.Fatalf("CreateVault() error = %v", err)
	}
	addNamed(t, app, "A")
	bID := addNamed(t, app, "B")
	cID := addNamed(t, app, "C")

	// A,B,C -> move B up -> B,A,C
	if err := app.MoveAccount(bID, "up"); err != nil {
		t.Fatalf("MoveAccount up error = %v", err)
	}
	if got := order(t, app); got[0] != "B" || got[1] != "A" || got[2] != "C" {
		t.Fatalf("after move up: %v", got)
	}

	// Pin C: it should keep array position but report pinned.
	if _, err := app.SetAccountPinned(cID, true); err != nil {
		t.Fatalf("SetAccountPinned error = %v", err)
	}
	accounts, _ := app.GetAccounts()
	var cPinned bool
	for _, acc := range accounts {
		if acc.Issuer == "C" {
			cPinned = acc.Pinned
		}
	}
	if !cPinned {
		t.Fatal("C should be pinned")
	}

	// C is the only pinned account; moving it within its group is a no-op.
	if err := app.MoveAccount(cID, "up"); err != nil {
		t.Fatalf("MoveAccount pinned error = %v", err)
	}
	if got := order(t, app); got[0] != "B" || got[1] != "A" || got[2] != "C" {
		t.Fatalf("pinned move should not cross groups: %v", got)
	}

	// Moving B down swaps with the next non-pinned account (A), since C is pinned.
	bAfterID := bID
	if err := app.MoveAccount(bAfterID, "down"); err != nil {
		t.Fatalf("MoveAccount down error = %v", err)
	}
	if got := order(t, app); got[0] != "A" || got[1] != "B" || got[2] != "C" {
		t.Fatalf("after move down within non-pinned group: %v", got)
	}

	if err := app.MoveAccount(bID, "sideways"); err == nil {
		t.Fatal("invalid direction should error")
	}
}
