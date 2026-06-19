package main

import "runtime"

func contentProtectionAvailable() bool {
	return runtime.GOOS == "darwin" || runtime.GOOS == "windows"
}
