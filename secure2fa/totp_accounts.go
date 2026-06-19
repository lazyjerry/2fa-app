package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

func accountFromInput(input AccountInput) (Account, error) {
	issuer := strings.TrimSpace(input.Issuer)
	name := strings.TrimSpace(input.Name)
	secret := normalizeSecret(input.Secret)
	if issuer == "" {
		return Account{}, errors.New("issuer is required")
	}
	if name == "" {
		return Account{}, errors.New("account name is required")
	}
	if secret == "" {
		return Account{}, errors.New("secret is required")
	}
	digits := input.Digits
	if digits == 0 {
		digits = 6
	}
	if digits != 6 && digits != 8 {
		return Account{}, errors.New("digits must be 6 or 8")
	}
	period := input.Period
	if period == 0 {
		period = 30
	}
	if period < 10 || period > 120 {
		return Account{}, errors.New("period must be between 10 and 120 seconds")
	}
	algorithm := normalizeAlgorithm(input.Algorithm)
	if _, err := generateTOTP(secret, algorithm, digits, period, time.Now()); err != nil {
		return Account{}, fmt.Errorf("invalid secret: %w", err)
	}
	now := time.Now()
	return Account{
		ID:        newID(),
		Issuer:    issuer,
		Name:      name,
		Secret:    secret,
		Category:  strings.TrimSpace(input.Category),
		Notes:     strings.TrimSpace(input.Notes),
		Algorithm: algorithm,
		Digits:    digits,
		Period:    period,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func accountFromURI(input URIAccountInput) (Account, error) {
	key, err := otp.NewKeyFromURL(strings.TrimSpace(input.URI))
	if err != nil {
		return Account{}, err
	}
	if key.Type() != "totp" {
		return Account{}, errors.New("only TOTP otpauth URLs are supported")
	}
	digits := key.Digits().Length()
	period := int(key.Period())
	if period == 0 {
		period = 30
	}
	algorithm := key.Algorithm().String()
	now := time.Now()
	return Account{
		ID:        newID(),
		Issuer:    strings.TrimSpace(key.Issuer()),
		Name:      strings.TrimSpace(key.AccountName()),
		Secret:    key.Secret(),
		Category:  strings.TrimSpace(input.Category),
		Notes:     strings.TrimSpace(input.Notes),
		Algorithm: normalizeAlgorithm(algorithm),
		Digits:    digits,
		Period:    period,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func accountViews(accounts []Account) []AccountView {
	views := make([]AccountView, 0, len(accounts))
	for _, account := range accounts {
		views = append(views, viewForAccount(account))
	}
	return views
}

func codeViews(accounts []Account, now time.Time) ([]CodeView, error) {
	views := make([]CodeView, 0, len(accounts))
	for _, account := range accounts {
		code, err := generateTOTP(account.Secret, account.Algorithm, account.Digits, account.Period, now)
		if err != nil {
			return nil, err
		}
		remaining := account.Period - int(now.Unix()%int64(account.Period))
		views = append(views, CodeView{
			AccountView:   viewForAccount(account),
			Code:          code,
			TimeRemaining: remaining,
		})
	}
	return views, nil
}

func codeForAccountID(accounts []Account, id string, now time.Time) (string, error) {
	for _, account := range accounts {
		if account.ID == id {
			return generateTOTP(account.Secret, account.Algorithm, account.Digits, account.Period, now)
		}
	}
	return "", errors.New("account not found")
}

func viewForAccount(account Account) AccountView {
	return AccountView{
		ID:        account.ID,
		Issuer:    account.Issuer,
		Name:      account.Name,
		Category:  account.Category,
		Notes:     account.Notes,
		Algorithm: account.Algorithm,
		Digits:    account.Digits,
		Period:    account.Period,
		CreatedAt: account.CreatedAt,
		UpdatedAt: account.UpdatedAt,
	}
}

func generateTOTP(secret, algorithm string, digits, period int, at time.Time) (string, error) {
	return totp.GenerateCodeCustom(secret, at, totp.ValidateOpts{
		Period:    uint(period),
		Digits:    otpDigits(digits),
		Algorithm: otpAlgorithm(algorithm),
	})
}

func normalizeSecret(secret string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(secret), " ", ""))
}

func normalizeAlgorithm(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "SHA256":
		return "SHA256"
	case "SHA512":
		return "SHA512"
	default:
		return "SHA1"
	}
}

func otpAlgorithm(value string) otp.Algorithm {
	switch normalizeAlgorithm(value) {
	case "SHA256":
		return otp.AlgorithmSHA256
	case "SHA512":
		return otp.AlgorithmSHA512
	default:
		return otp.AlgorithmSHA1
	}
}

func otpDigits(value int) otp.Digits {
	if value == 8 {
		return otp.DigitsEight
	}
	return otp.DigitsSix
}

func newID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(buf[:])
}
