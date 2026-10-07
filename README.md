# Mines

Web demo (no backend, mock server). Working title.

- Rules/emulator: https://polishchuk.com/projects/jgame/#/mnf1
- Design: https://www.figma.com/design/DguVpT99kmgeVsB2GvEfD7/mines (in progress)
- Plan and checklist: [docs/new-game-playbook.md](docs/new-game-playbook.md); status: [PROGRESS.md](PROGRESS.md)

## Run

```bash
npx http-server public -p 5173 -c-1 --cors
```

Only `public/` is deployed (Cloudflare Workers static assets, `wrangler.jsonc`).
