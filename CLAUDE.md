# CLAUDE.md

@AGENTS.md

## Claude-Specific Instructions

### Quick Reference

```bash
bun install          # Install dependencies
bun run dev          # Start dev servers (frontend + backend)
bun run db:migrate   # Run database migrations
bun run test         # Run tests
bun run lint         # Lint code
bun run typecheck    # Type check
```

### When Making Changes

1. **Read first** - Always read relevant files before modifying
2. **Type safety** - This project uses strict TypeScript; ensure types are correct
3. **Shared types** - Update `packages/shared/` when changing data structures
4. **Test changes** - Run `bun run typecheck` after modifications

### Project Entry Points

- Server: `apps/server/src/index.ts`
- Web: `apps/web/src/main.tsx`
- Shared: `packages/shared/src/index.ts`

### Preferred Patterns

- Use existing service patterns in `apps/server/src/services/`
- Use existing component patterns in `apps/web/src/components/`
- Add new types to `packages/shared/src/types.ts`
- Add validation schemas to `packages/shared/src/validation.ts`
