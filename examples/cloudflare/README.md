# Optional Cloudflare intake example

This is **not required** to run Stickonfig or generate PDFs. It demonstrates how an operator-owned backend can receive the generic multipart package and quarantine it in private R2 storage.

The example fails closed until you provide:

1. An `AUTH` service binding to your own authentication service. Its `/authorize` endpoint must verify the forwarded session/authorization, CSRF origin, and abuse/rate limits, returning **204** only when authorized. Never put a shared server secret in the browser config.
2. A `FILES` R2 binding to your own private bucket, with retention/access controls. No bucket/account identifiers are supplied.
3. `ALLOWED_ORIGIN` set to your exact frontend origin. Prefer same-origin reverse proxying for sessions; third-party iframe cookies can be blocked. Cross-origin cookie credentials are not enabled by this sample.
4. A production review/scanning process before any quarantined artifact is printed or shared.

Install/configure Wrangler separately in your integration workspace, then adapt `wrangler.jsonc`; generate binding types with `wrangler types` if moving to TypeScript. Do not deploy the example unchanged and expect an order system. No actual Cloudflare credentials belong in this repository.

The shared receiver bounds the combined request to 24 MB, validates the manifest and recalculates example pricing. It does not trust client prices. It stores artifacts under generated IDs and fixed kind names, as attachments, plus a separate validated manifest. The file inputs still require content validation/malware scanning and operator review. Failed partial storage may need lifecycle cleanup. Add idempotency before retries can create duplicate business orders.

Example binding structure (replace names in your deployment, not with credentials in public config):

```json
{
  "r2_buckets": [{ "binding": "FILES", "bucket_name": "your-private-bucket" }],
  "services": [{ "binding": "AUTH", "service": "your-session-service" }]
}
```

The helper/Worker handler is exercised locally with mocked bindings. A real Cloudflare authentication/R2 deployment, checkout and production workflow are **not** provided or certified. Consult current [Workers guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) for your production integration.
