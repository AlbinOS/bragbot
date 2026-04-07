<p align="center">
  <img src="assets/bragbot_logo_light.png" alt="BragBot" width="200">
</p>

# BragBot

Your software engineering hype machine — because "I've been busy" isn't a performance review. Crawls your GitHub, Jira & Confluence and turns it into receipts.

Built with [Electrobun](https://electrobun.dev) + React + Recharts.

## Installing

Download the latest `.dmg` from [Releases](https://github.com/AlbinOS/bragbot/releases), open it, and drag BragBot to your Applications folder.

Since the app is not code-signed, macOS will block it on first launch. Run this once:

```bash
xattr -cr /Applications/BragBot.app
```

## Development

```bash
cd app
bun install
bun run dev
```

## Building

```bash
cd app
npx electrobun build --env=stable
# Output: app/artifacts/stable-macos-arm64-BragBot.dmg
```

## Releases

Releases are automated via [release-please](https://github.com/googleapis/release-please). Use [conventional commits](https://www.conventionalcommits.org/):

- `feat: ...` → minor version bump
- `fix: ...` → patch version bump
- `chore:`, `ci:`, `docs:` → no release

A release PR is auto-created/updated on push to main. Merging it triggers a build and GitHub Release with the `.dmg`.

## License

[MIT](LICENSE)
