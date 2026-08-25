# Fun Command Ideas for Cassie

> Additional commands to grow the fun suite beyond `autistic`, `cute`, `gay`, `intelligence`, `rps`, `ship`,
> `simp`, `rizz`, `tictactoe`, `guessthenumber`, `wanted`, and `whowouldwin` (all implemented).
> Sorted by priority tier. Each entry includes usage syntax, key implementation notes, and any
> special cases worth preserving (biases, developer overrides, determinism, etc.), matching the
> conventions already used by the existing rating commands.

---

## Tier 1 — Utility-Adjacent Fun

### `8ball`
**Gap this fills:** Evergreen classic, near-zero implementation cost, good filler command.

```
$8ball <question>
/8ball question:[text]
```

- Pick a random response from a fixed flavor-text pool (~20 entries covering yes/no/maybe)
- No DB or canvas needed — good "quick win" to pad out the category

---

### `fact` / `wouldyourather`
**Gap this fills:** Low-effort conversation-starter commands for idle channels.

```
$fact                       — random fun fact from a static/curated list
$wouldyourather             — random WYR prompt, optionally with 👍/👎 style reactions for voting
```

- Static JSON list bundled with the bot (no external API dependency, consistent with the bot's self-contained style)
- `wouldyourather` can auto-add two reactions so members can vote right on the bot's message
