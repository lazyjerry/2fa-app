//go:build !darwin

package main

import "errors"

var errBiometricUnsupported = errors.New("biometric unlock is not supported on this platform")

func biometricAvailable() bool { return false }

func biometricStatus() string { return "此平台目前僅支援密碼登入。" }

func biometricEnrolled() bool { return false }

func biometricStoreSecret(string) error { return errBiometricUnsupported }

func biometricLoadSecret(string) (string, error) { return "", errBiometricUnsupported }

func biometricDeleteSecret() error { return errBiometricUnsupported }
