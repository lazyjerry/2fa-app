package main

import "runtime"

func contentProtectionAvailable() bool {
	return runtime.GOOS == "darwin" || runtime.GOOS == "windows"
}

func biometricStatus() string {
	switch runtime.GOOS {
	case "darwin":
		return "第一版使用密碼登入；可後續接 macOS LocalAuthentication。"
	case "windows":
		return "第一版使用密碼登入；可後續接 Windows Hello。"
	default:
		return "此平台目前僅支援密碼登入。"
	}
}
