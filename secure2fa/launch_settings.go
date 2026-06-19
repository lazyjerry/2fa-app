package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const launchSettingsFileName = "launch_settings.json"

type LaunchSettings struct {
    ScreenshotProtection bool `json:"screenshotProtection"`
}

func defaultLaunchSettings() LaunchSettings {
    return LaunchSettings{ScreenshotProtection: true}
}

func loadLaunchSettings() (LaunchSettings, error) {
    settings := defaultLaunchSettings()
    path, err := launchSettingsPath()
    if err != nil {
        return settings, err
    }
    raw, err := os.ReadFile(path)
    if err != nil {
        if errors.Is(err, os.ErrNotExist) {
            return settings, nil
        }
        return settings, err
    }
    if err := json.Unmarshal(raw, &settings); err != nil {
        return defaultLaunchSettings(), nil
    }
    return settings, nil
}

func saveLaunchSettings(settings LaunchSettings) error {
    path, err := launchSettingsPath()
    if err != nil {
        return err
    }
    if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
        return err
    }
    raw, err := json.MarshalIndent(settings, "", "  ")
    if err != nil {
        return err
    }
    tmp := path + ".tmp"
    if err := os.WriteFile(tmp, raw, 0600); err != nil {
        return err
    }
    return os.Rename(tmp, path)
}

func launchSettingsPath() (string, error) {
    dir, err := os.UserConfigDir()
    if err != nil {
        return "", err
    }
    return filepath.Join(dir, appDataDirName, launchSettingsFileName), nil
}
