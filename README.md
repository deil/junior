# junior

Autonomous code agent orchestrator that iteratively works through tasks using AI. Built on top of Ralph Wiggum loop.

## How It Works

1. **Task Loop** - Runs up to 50 iterations, each time:
   - Agent picks one `ready` task from Beads (`bd`)
   - Implements it, then marks it `closed`
   - Appends learnings to `progress.txt` for context carryover

2. **Components**
   - `index.ts` - CLI entry, orchestration, progress logging
   - `loop.ts` - Iteration engine, task state diffing
   - `prompt.ts` - Agent instruction template
   - `agent/opencode.ts` - Spawns OpenCode CLI as the AI executor
   - `tasks/beads.ts` - Task backend via Beads CLI

3. **Flow**
   ```
   Start → Preflight (reset stale tasks) → Loop iterations → Agent runs → Detect closed/created tasks → Repeat until done
   ```

## Usage

```bash
npm start [directory] [--verbose] [--progress <file>]
```

## Dependencies

- **OpenCode** - AI agent (external CLI)
- **Beads** - Task tracking (`bd` CLI)
