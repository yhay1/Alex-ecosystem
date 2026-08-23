# Alex Studio

Alex Studio is an independent product in the Alex ecosystem.

## Status

The product currently exposes a basic status response at `/studio`. Product
features are not implemented yet.

## Architecture

This product owns only its manifest and handler. Shared runtime services remain
under `Alex/` and are provided by the ecosystem entrypoint and router.

Future Alex Studio work should remain isolated to this directory unless it
requires an existing shared ecosystem service.