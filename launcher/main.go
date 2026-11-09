//go:build windows

// BoomBrothers.exe: opens the game (index.html next to this file) in its own window.
//
// SauceStore installs apps from a zip and starts them by running their .exe, so this tiny
// launcher is what makes the browser game a "real" app there: Start menu shortcut, Open
// button, desktop icon. It prefers a Microsoft Edge app window (no tabs or address bar,
// so it looks like a game window; Edge comes with Windows 10 and 11) and falls back to
// the default web browser.
//
// Built by .github/workflows/release.yml:  GOOS=windows go build -ldflags "-H windowsgui"
package main

import (
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	page := filepath.Join(filepath.Dir(exe), "index.html")
	game := (&url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(page)}).String()

	for _, edge := range edgePaths() {
		if _, err := os.Stat(edge); err != nil {
			continue
		}
		// A separate profile folder keeps the game window apart from normal browsing,
		// so it always opens as its own window with the game's size and settings.
		profile := filepath.Join(os.Getenv("LOCALAPPDATA"), "BoomBrothers", "EdgeProfile")
		cmd := exec.Command(edge, "--app="+game, "--user-data-dir="+profile, "--window-size=1280,760", "--no-first-run", "--autoplay-policy=no-user-gesture-required")
		if cmd.Start() == nil {
			return
		}
	}
	// No Edge: open it in whatever browser the computer uses.
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", game)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
}

func edgePaths() []string {
	var out []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		if base := os.Getenv(env); base != "" {
			out = append(out, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	return out
}
