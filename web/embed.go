// Package web embeds the Vite production build. Run `npm --prefix web run build` before `go build`.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist returns the build output rooted at index.html.
func Dist() fs.FS {
	root, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return root
}
