package main

import (
	"os"

	"github.com/egorovli/codex-session-auto-rename/packages/plugin/internal/rename"
)

func main() {
	if err := rename.Run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		_, _ = os.Stderr.WriteString(err.Error() + "\n")
		os.Exit(1)
	}
}
