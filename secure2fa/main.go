package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	launchSettings, err := loadLaunchSettings()
	if err != nil {
		println("Warning: load launch settings:", err.Error())
		launchSettings = defaultLaunchSettings()
	}

	// Create an instance of the app structure
	app := NewApp()
	app.SetLaunchScreenshotProtection(launchSettings.ScreenshotProtection)

	// Create application with options
	err = wails.Run(&options.App{
		Title:     "Secure 2FA",
		Width:     980,
		Height:    760,
		MinWidth:  980,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Mac: &mac.Options{
			ContentProtection: launchSettings.ScreenshotProtection,
		},
		Windows: &windows.Options{
			ContentProtection: launchSettings.ScreenshotProtection,
			Theme:             windows.SystemDefault,
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
