# Import URL Security

Recipe and product imports share `app/api/_lib/import-url.ts`. They accept only
HTTP(S), canonicalize numeric IPv4 through the URL parser, reject non-public IP
literals and local hostnames, and revalidate each manual redirect before fetching
its destination. IPv4-mapped IPv6 literals are rejected, including public mappings.
The existing four-request redirect limit and import response contracts are retained.

This is address-literal validation, not DNS or connection validation. Permitted
hostnames can resolve to private addresses or change their DNS answers between
requests. Workers fetch does not expose an address-pinning step to this helper;
a separate DNS lookup would not prove the actual destination used by fetch.
Local Wrangler runs can reach the desktop's network, making the limitation
particularly relevant there. The owner accepted this residual local desktop risk
on 2026-10-10. No egress controls or hostname allowlist were added.
