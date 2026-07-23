# Security policy

## Supported versions

Security fixes are applied to the latest commit on `main`. This project does
not currently maintain older release branches.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** button in the repository Security tab
to open a private report:

https://github.com/tzachbon/claude-cursor/security/advisories/new

Include:

- the affected commit or version
- a minimal reproduction
- the expected and observed impact
- relevant operating-system, Node.js, client, and Cursor Agent versions
- any suggested mitigation

You can expect an initial acknowledgement within seven days. Disclosure timing
will be coordinated after the impact and fix are understood.

## Security boundaries

The server is designed for loopback-only use. It has no downstream
authentication or TLS. Binding it to a non-loopback interface without adding a
separate security layer is unsupported.

Cursor Agent is launched non-interactively with `--force` and `--trust` in a
dedicated workspace. The workspace is not an operating-system sandbox.

Prompt bodies are excluded from normal logs. Enabling `DEBUG_DUMP_OUTPUT`
writes raw model output to local disk and can expose sensitive content.

Private Cursor transports, desktop-token extraction, and reverse-engineered
wire protocols are outside this project's supported scope.
