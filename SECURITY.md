# Security

Please do not publish exploitable details or customer files in public issues. Use **Security → Advisories → Report a vulnerability** in this repository when private vulnerability reporting is available. If it is unavailable, open a minimal issue asking for a private reporting channel without disclosing the vulnerability. Do not send credentials or customer data.

There is no guaranteed response time or security support agreement. Operators are responsible for updates and their own hosting/integration security.

Default download mode sends no artwork to a backend. Files and object URLs stay in the tab until closed or replaced. Models/runtime are served by your deployment. Your host still receives ordinary HTTP requests and may keep access logs.

For an intake endpoint, add authentication/session controls, CSRF protection, exact-origin CORS, abuse/rate limits, bounded uploads, private storage, malware scanning, retention rules, and access-controlled downloads. Recalculate prices and validate options on the server. Treat every supplied artifact and manifest as untrusted. Never render uploaded SVG/HTML inline on your shop origin. Avoid public buckets. Browser configuration is not a secret store.
