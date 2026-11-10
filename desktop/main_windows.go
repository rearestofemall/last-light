//go:build windows

// Windows: show the game in a native window through Microsoft Edge WebView2 (built into
// Windows 10 and 11). Saves (IndexedDB) live in %APPDATA%\TheLastLight. Without WebView2 the
// game opens in the default browser instead.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	webview "github.com/jchv/go-webview2"
)

func main() {
	url, err := serve()
	if err != nil {
		message("Could not start the game: " + err.Error())
		os.Exit(1)
	}
	dataDir := filepath.Join(os.Getenv("APPDATA"), "TheLastLight")
	_ = os.MkdirAll(dataDir, 0o755)
	w := webview.NewWithOptions(webview.WebViewOptions{
		AutoFocus: true,
		DataPath:  dataDir,
		WindowOptions: webview.WindowOptions{
			Title:  "The Last Light",
			Width:  1280,
			Height: 760,
			IconId: 1,
			Center: true,
		},
	})
	if w == nil {
		_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		message("The Last Light is running in your web browser.\n\nKeep this box open while you play; press OK to quit.\n\n(Install Microsoft Edge WebView2 to play in its own window.)")
		return
	}
	defer w.Destroy()
	w.SetSize(1280, 760, webview.HintNone)
	w.Navigate(url)
	w.Run()
}

// message shows a native message box (blocks until dismissed).
func message(text string) {
	box := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString("The Last Light")
	box.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), 0x40)
}
