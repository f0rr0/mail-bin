# Security

## Supported Versions

Security fixes target the latest code on `main`.

## Reporting a Vulnerability

Do not open a public issue with exploit details, API tokens, email addresses, or Cloudflare resource IDs.

Use GitHub private vulnerability reporting if it is enabled for the repository. If it is not enabled, open a public issue asking for a private security contact and include only a short, non-sensitive summary.

## Secret Handling

Never commit:

- `.dev.vars`
- `.env`
- `wrangler.local.jsonc`
- Cloudflare API tokens
- Cloudflare account, zone, or D1 database IDs for a private deployment
- Real destination inbox addresses from a personal deployment

Rotate any secret that is accidentally exposed in a pull request, issue, log, or screenshot.
