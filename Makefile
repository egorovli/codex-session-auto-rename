PLUGIN_DIR := packages/plugin
GO_BUILD_CACHE ?= $(CURDIR)/.gocache
GOLANGCI_LINT_CACHE ?= $(CURDIR)/.gocache/golangci-lint
GOLANGCI_LINT ?= golangci-lint
GOLANGCI_LINT_VERSION ?= v2.12.2
GOLANGCI_LINT_MODULE := github.com/golangci/golangci-lint/v2/cmd/golangci-lint

.PHONY: build
build:
	cd $(PLUGIN_DIR) && GOCACHE=$(GO_BUILD_CACHE) go build ./cmd/codex-session-auto-rename

.PHONY: test
test:
	cd $(PLUGIN_DIR) && GOCACHE=$(GO_BUILD_CACHE) go test ./...

.PHONY: lint
lint:
	cd $(PLUGIN_DIR) && GOCACHE=$(GO_BUILD_CACHE) GOLANGCI_LINT_CACHE=$(GOLANGCI_LINT_CACHE) $(GOLANGCI_LINT) run ./...

.PHONY: check
check: lint test build

.PHONY: install-golangci-lint
install-golangci-lint:
	go install $(GOLANGCI_LINT_MODULE)@$(GOLANGCI_LINT_VERSION)
