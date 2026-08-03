# EventoTron

EventoTron is a local event-operations suite containing the Calendar, Tabletron, Foodotron, Scheduluotron, Settings, and master-report routes beneath one application origin.

## Local Development

```bash
npm install
npm run dev
```

Open the URL printed by Vinext. The default development address is `http://localhost:3000`.

## Local Production

```bash
npm run build
npm start
```

`npm start` runs the built application in Cloudflare's local Workers runtime so the D1 database is available. It begins at port 3000 and automatically selects the next available port when another local process is already using it. Set `EVENTOTRON_PORT` to choose a different starting port.

Development and local production both persist their database under `.wrangler/state`, so events and applet records remain available between restarts.

The system-readiness response is available at `/api/health`. The same database and routes are intended to be reused when EventoTron is packaged as a desktop application.

## Verification

```bash
npm run lint
npm test
```
