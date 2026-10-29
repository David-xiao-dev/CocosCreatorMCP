# Security

This local bridge has editor privileges. Advanced script/message endpoints run with the Creator process's access; they are not a sandbox. The loopback RPC uses a per-instance token and rejects browser Origin headers. Keep the connection descriptor private, and run only trusted MCP clients and project extensions.

Do not post tokens, credentials, private game assets or a complete connection descriptor in public issues. If the repository has GitHub private vulnerability reporting enabled, use its **Security → Report a vulnerability** form. The maintainer should enable that feature before public launch. Ordinary reproducible bugs belong in Issues with sanitized evidence.

Only the current development preview receives fixes. OS/editor compatibility and recovery boundaries are recorded in docs/COVERAGE.md; a test pass is not a guarantee for arbitrary projects or third-party plugins.
