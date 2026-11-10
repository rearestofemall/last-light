//go:build !windows

// Other systems: serve the game and print the address (used to test the launcher).
package main

import (
	"fmt"
	"os"
)

func main() {
	url, err := serve()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("The Last Light is running at", url)
	select {}
}
