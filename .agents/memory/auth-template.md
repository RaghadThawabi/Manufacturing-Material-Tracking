---
name: Auth template setup
description: Workspace integration gaps encountered in the browser auth template and generated API clients.
---
Copied browser-auth templates may omit composite build options and Vite ImportMeta typing. A filtered package install may not link the newly copied library until a full workspace install.

**Why:** Initial integration exposed missing dependencies and types despite the template's documented copy-and-use flow.

**How to apply:** When adding such a library, verify references, declaration settings, environment typing, and package links. Generated API clients using Headers.entries also need dom.iterable in their library target; fix configuration rather than generated output.
