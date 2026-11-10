// The Last Light — desktop launcher: the embedded game and its local web server.
package main

import (
	"embed"
	"io/fs"
	"net"
	"net/http"
	"strings"
)

//go:embed all:dist
var dist embed.FS

// serve starts a private localhost server for the embedded build and returns its URL.
// A fixed port keeps the page origin (and therefore the saves) stable between launches;
// any free port is used if it is taken.
func serve() (string, error) {
	site, err := fs.Sub(dist, "dist")
	if err != nil {
		return "", err
	}
	ln, err := net.Listen("tcp", "127.0.0.1:47823")
	if err != nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return "", err
		}
	}
	files := http.FileServer(http.FS(site))
	go http.Serve(ln, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		if strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		}
		files.ServeHTTP(w, r)
	}))
	return "http://" + ln.Addr().String() + "/", nil
}
