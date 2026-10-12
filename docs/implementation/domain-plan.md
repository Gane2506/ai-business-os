# Platform domains

The user selected `connectxmedia.com` on 2026-10-11. Cloudflare reports the zone
active. The intended service names are recorded in `config/deployment-inputs.json`.

| Service | Hostname |
| --- | --- |
| Twenty and operating-system entry point | os.connectxmedia.com |
| Ringee web app | calls.connectxmedia.com |
| Ringee API and callbacks | calls-api.connectxmedia.com |
| Mautic | marketing.connectxmedia.com |

The user confirmed the existing server and Nginx Proxy Manager on 2026-10-11.
All four hostnames now have Cloudflare-proxied A records pointing to
`203.0.113.10`, with automatic TTL. Exact-name API read-back verified all four
records; their IDs are recorded in `config/deployment-inputs.json`.

Nginx Proxy Manager's admin login is reachable at `http://203.0.113.10:81/`
(version displayed: 2.13.5). Admin sign-in succeeded. Existing hosts use Docker service names
(`connectxmedia:3000`, `rdpv-web:3000`) and a gateway address
(`172.18.0.1:9119`). AI Business OS application upstream discovery
remains pending. Proxy hosts and origin certificates have not been configured.

The existing `api.connectxmedia.com` belongs to a separate hosted service.

DNS routing alone does not provision applications, reverse-proxy virtual hosts,
origin TLS, Clerk origins, provider callbacks or CORS. Configure those for these
hostnames during deployment, then verify each service independently.
