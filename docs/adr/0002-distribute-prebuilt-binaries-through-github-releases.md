# Distribute Prebuilt Binaries Through GitHub Releases

We will make GitHub Releases the source of truth for redistributable artifacts. Each release should publish prebuilt binaries for supported OS/architecture pairs, plus checksums and provenance evidence, so users and package-manager wrappers do not need a local toolchain or language runtime to install the hook. Package-manager integrations such as Homebrew, Scoop, and winget should consume these release assets rather than rebuilding from source.

**Consequences**

Release automation must build and verify platform artifacts, at minimum `darwin-arm64`, `darwin-amd64`, `linux-amd64`, `linux-arm64`, and `windows-amd64.exe`. The release pipeline becomes part of the product surface because install reliability depends on asset naming, checksums, and upgrade compatibility.
