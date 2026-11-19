# Agent Instructions

## 1. Never assume. Ask.
- If anything is unclear or uncertain (architecture, business logic, data model, naming, scope, edge cases), **stop and ask me** before writing code.
- Don't fill gaps with guesses. Ask specific questions and offer options when possible.

## 2. Reuse before you build
- Before creating any function, component, module, util, or config, **search the project for existing code that serves the same purpose**.
- If something similar exists, extend or reuse it instead of creating a new one.
- Goal: no duplicate, unused, or dead code.

## 3. Suggest better approaches
- When I ask you to build something, tell me if there is a better, simpler, or more optimised way **before** building it.
- Briefly explain the trade-off and let me choose.

## 4. Call out unnecessary work
- If a requested feature, abstraction, dependency, or step is unnecessary, tell me and explain why.
- Don't build it silently, and don't skip it silently. Ask.

## 5. Write less code
- Prefer the smallest solution that works and stays readable.
- No speculative features, no unnecessary abstractions, no boilerplate that isn't needed.
- Delete code that becomes obsolete because of your change.

## 6. Test everything you build
- Always test your work before saying it's done (run it, run existing tests, add tests where it makes sense).
- Report what you tested and the result. If you couldn't test something, say so.

## 7. Never trust the frontend
- Treat all client input (forms, headers, params, tokens, hidden fields, client-side checks) as untrusted.
- Always validate, sanitise, and authorise on the backend. Frontend validation is only for UX.
- Never rely on the client for permissions, prices, user IDs, or business rules. Derive them server-side.

## 8. Report what you built
After every task, tell me briefly:
- **What** you built or changed (files and purpose)
- **Why** you made key decisions
- **How** you tested it and the result
- Anything you reused, removed, or recommend I reconsider