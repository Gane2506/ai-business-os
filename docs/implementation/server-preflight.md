# Contabo preflight

Read-only checks on 2026-10-11 succeeded using the existing SSH alias `contabo`.
No server services or files were changed.

- Origin: `203.0.113.10`, host `vmi2938886`, x86_64.
- Capacity: 8 CPU cores, 23 GiB RAM, 388 GiB root filesystem, 357 GiB free.
- Docker 29.1.2; Docker Compose 5.0.0.
- NPM attaches to the existing external Docker network `web`.
- Existing containers: npm, connectxmedia, rdpv-web, critical-crew, critical-crew-voice.
- Observed listening ports: 22, 80, 81, 443, 853, 7880, 7881.
- NPM existing HTTP upstreams: connectxmedia:3000, rdpv-web:3000,
  and 172.18.0.1:9119.

Application containers should have unique names and join `web` only where NPM
needs ingress. Database and queue containers should use private component
networks. Existing services, NPM hosts and port bindings must be preserved.

DNS records for os, calls, calls-api, and marketing.connectxmedia.com are
configured. Application deployment, new proxy hosts, origin certificates,
authentication configuration, and application runtime acceptance remain pending.

## Deployment preparation assignments

| Component | Jev role/confidence | Model | Reason |
| --- | --- | --- | --- |
| Twenty | Executor 0.75 | GPT-6.1 Sol, high | CRM deployment and supported release verification |
| Ringee | Executor 0.55 | GPT-6 Astra, high | Patched source, migrations, auth and provider dependencies |
| Mautic | Executor 0.78 | GPT-6 Luna, high | Bounded official Docker deployment and SMTP prerequisites |

Agents prepare local manifests and prerequisites; the parent reviews their
outputs before any server rollout. Credentials are not stored in this report.
