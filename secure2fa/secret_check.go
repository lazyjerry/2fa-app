package main

import (
	"strings"
	"time"
)

type SecretCheck struct {
	Empty          bool   `json:"empty"`
	Valid          bool   `json:"valid"`
	Duplicate      bool   `json:"duplicate"`
	DuplicateLabel string `json:"duplicateLabel"`
}

// ValidateSecret reports whether a manually entered secret is a usable Base32
// TOTP key and whether it collides with an account already in the vault.
func (a *App) ValidateSecret(secret string) SecretCheck {
	norm := normalizeSecret(secret)
	if norm == "" {
		return SecretCheck{Empty: true}
	}
	if _, err := generateTOTP(norm, "SHA1", 6, 30, time.Now()); err != nil {
		return SecretCheck{Valid: false}
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if a.vault != nil {
		if acc, ok := findDuplicateSecret(a.vault.Accounts, norm, ""); ok {
			return SecretCheck{Valid: true, Duplicate: true, DuplicateLabel: accountLabel(acc)}
		}
	}
	return SecretCheck{Valid: true}
}

func findDuplicateSecret(accounts []Account, secret, excludeID string) (Account, bool) {
	norm := normalizeSecret(secret)
	for _, acc := range accounts {
		if acc.ID == excludeID {
			continue
		}
		if normalizeSecret(acc.Secret) == norm {
			return acc, true
		}
	}
	return Account{}, false
}

func accountLabel(acc Account) string {
	issuer := strings.TrimSpace(acc.Issuer)
	name := strings.TrimSpace(acc.Name)
	switch {
	case issuer != "" && name != "":
		return issuer + " / " + name
	case issuer != "":
		return issuer
	default:
		return name
	}
}
