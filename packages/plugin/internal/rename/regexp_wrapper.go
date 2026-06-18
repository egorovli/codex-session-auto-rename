package rename

import "regexp"

type regexpWrapper struct {
	*regexp.Regexp
}

func mustRegexp(pattern string) *regexpWrapper {
	return &regexpWrapper{Regexp: regexp.MustCompile(pattern)}
}
