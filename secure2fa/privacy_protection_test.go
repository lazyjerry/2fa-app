package main

import (
	"path/filepath"
	"runtime"
	"testing"
)

func setTestUserConfigDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	switch runtime.GOOS {
	case "windows":
		t.Setenv("APPDATA", dir)
	case "darwin":
		t.Setenv("HOME", dir)
	default:
		t.Setenv("XDG_CONFIG_HOME", filepath.Join(dir, "config"))
		t.Setenv("HOME", dir)
	}
	return dir
}

func TestSetupStateReportsLaunchScreenshotProtection(t *testing.T) {
	app := NewAppWithStorage(t.TempDir())

	state, err := app.GetSetupState()
	if err != nil {
		t.Fatalf("GetSetupState() error = %v", err)
	}
	if state.ScreenshotProtection != contentProtectionAvailable() {
		t.Fatalf("ScreenshotProtection = %v, want %v", state.ScreenshotProtection, contentProtectionAvailable())
	}

	app.SetLaunchScreenshotProtection(false)
	state, err = app.GetSetupState()
	if err != nil {
		t.Fatalf("GetSetupState() after disable error = %v", err)
	}
	if state.ScreenshotProtection {
		t.Fatal("ScreenshotProtection should be false when launch protection is disabled")
	}
}

func TestSaveSettingsPersistsScreenshotProtectionForNextLaunch(t *testing.T) {
	setTestUserConfigDir(t)
	app := newUnlockedApp(t)

	settings, err := app.GetSettings()
	if err != nil {
		t.Fatalf("GetSettings() error = %v", err)
	}
	settings.ScreenshotProtection = false
	if _, err := app.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings(false) error = %v", err)
	}
	launchSettings, err := loadLaunchSettings()
	if err != nil {
		t.Fatalf("loadLaunchSettings() after disable error = %v", err)
	}
	if launchSettings.ScreenshotProtection {
		t.Fatal("launch settings should persist screenshot protection disabled")
	}

	settings.ScreenshotProtection = true
	if _, err := app.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings(true) error = %v", err)
	}
	launchSettings, err = loadLaunchSettings()
	if err != nil {
		t.Fatalf("loadLaunchSettings() after enable error = %v", err)
	}
	if !launchSettings.ScreenshotProtection {
		t.Fatal("launch settings should persist screenshot protection enabled")
	}
}

func TestLoadLaunchSettingsDefaultsToEnabled(t *testing.T) {
	setTestUserConfigDir(t)

	settings, err := loadLaunchSettings()
	if err != nil {
		t.Fatalf("loadLaunchSettings() error = %v", err)
	}
	if !settings.ScreenshotProtection {
		t.Fatal("default launch settings should enable screenshot protection")
	}
}
