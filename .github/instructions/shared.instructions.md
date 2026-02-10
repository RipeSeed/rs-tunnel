---
appliesTo:
  - packages/shared/**/*.ts
---

# Shared Package Instructions

These instructions apply to the shared contracts in `packages/shared`.

## Purpose

This package defines the API contract between the CLI and API using Zod schemas. Both packages import from `@ripeseed/shared` to ensure type safety and runtime validation.

## Schema Patterns

- Use Zod for all request/response schemas
- Export both schema and inferred type: `export const XxxSchema = z.object({...}); export type Xxx = z.infer<typeof XxxSchema>;`
- Group related schemas together (e.g., auth schemas, tunnel schemas)
- Use `.strict()` to disallow additional properties
- Use `.describe()` for schema documentation

## Versioning

- This package MUST be built and published before API or CLI
- Use semantic versioning: patch for fixes, minor for new features, major for breaking changes
- Breaking changes require coordination with both API and CLI
- Update version in `package.json` when making any changes

## Type Safety

- Never use `any` or `unknown` without explicit runtime validation
- Prefer branded types for identifiers (e.g., `UserId`, `TunnelId`)
- Use discriminated unions for variant types
- Export type guards where appropriate: `export const isXxx = (value: unknown): value is Xxx => ...`

## Build Requirements

- Must be buildable without API or CLI dependencies
- Output ESM with `.js` suffix in imports
- Generate `.d.ts` declaration files
- Include source maps for debugging

## Testing

- Test schema validation with valid/invalid inputs
- Test edge cases (empty strings, null, undefined, wrong types)
- Test that `.parse()` throws on invalid input
- Test that inferred types match expected structure
