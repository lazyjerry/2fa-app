package main

import "errors"

func (a *App) BiometricEnabled() bool {
	return biometricAvailable() && biometricEnrolled()
}

func (a *App) EnableBiometricUnlock(password string) error {
	if !biometricAvailable() {
		return errors.New("biometrics are not available on this device")
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.requireUnlockedLocked(); err != nil {
		return err
	}
	path, err := a.vaultPath()
	if err != nil {
		return err
	}
	if err := a.verifyPasswordLocked(path, password); err != nil {
		return errors.New("password is incorrect")
	}
	return biometricStoreSecret(password)
}

func (a *App) DisableBiometricUnlock() error {
	return biometricDeleteSecret()
}

func (a *App) UnlockWithBiometrics() (SessionState, error) {
	if !biometricAvailable() {
		return SessionState{}, errors.New("biometrics are not available on this device")
	}
	password, err := biometricLoadSecret("解鎖 Secure 2FA")
	if err != nil {
		return SessionState{}, err
	}
	return a.UnlockVault(password)
}
