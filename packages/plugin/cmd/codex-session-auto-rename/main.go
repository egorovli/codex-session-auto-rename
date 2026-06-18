package main

import (
	"os"

	"github.com/egorovli/codex-session-auto-rename/packages/plugin/internal/rename"
)

func main() {
	if err := rename.Run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		if _, writeErr := os.Stderr.WriteString(err.Error() + "\n"); writeErr != nil {
			os.Exit(2)
		}
		os.Exit(1)
	}
}
