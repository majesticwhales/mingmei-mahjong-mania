# Yaku overview

A brief overview of the yaku (winning patterns) currently scored by `analyzeHand`. Each yaku adds the listed **han** value when it fires. Multiple yaku stack additively, except for the precedence rules noted below; the scoring orchestrator (`server/src/scoring/orchestrator.ts`) walks every valid decomposition (standard / chiitoitsu / kokushi) and picks the best-scoring interpretation.

Detectors live in `server/src/scoring/yaku/`.

## 1 han

| Yaku | Description |
| --- | --- |
| **All Simples** | Every tile is a 2–8 of man, pin, or sou (no terminals, no honours). |
| **Red Dragon** | Triplet of red dragons (中). |
| **White Dragon** | Triplet of white dragons (白). |
| **Green Dragon** | Triplet of green dragons (發). |
| **Round Wind** | Triplet of the current round wind. |
| **Seat Wind** | Triplet of this team's seat wind. |
| **All Sequences** ("pinfu") | All four melds are runs, the pair is non-yakuhai, and the winning tile completes a two-sided (ryanmen) wait. |
| **Pure Double Sequence** ("iipeikou") | Two identical runs in the same suit. |

## 2 han

| Yaku | Description |
| --- | --- |
| **Three Colour Straight** | The same numerical run (e.g. 3-4-5) in each of man, pin, and sou. |
| **Pure Straight** | Runs 1-2-3, 4-5-6, and 7-8-9 all present in the same numbered suit. |
| **All Triplets** | All four melds are triplets — no runs anywhere. |
| **Three Colour Triplets** | The same numerical triplet in each of man, pin, and sou. |
| **All Terminals and Honours** | Every tile is a 1, 9, wind, or dragon, with at least one terminal *and* at least one honour. |
| **Outside Hand** ("chanta") | Every meld and the pair contains a terminal or honour, with at least one run and at least one honour. |
| **Little Three Dragons** | Two dragon triplets plus the third dragon as the pair (stacks on top of the two yakuhai that fire automatically). |
| **Seven Pairs** ("chiitoitsu") | Seven distinct pairs — only fires on the chiitoitsu decomposition. |

## 3 han

| Yaku | Description |
| --- | --- |
| **Half Flush** ("honitsu") | Exactly one numbered suit plus at least one honour. |
| **Pure Outside Hand** ("junchan") | Every meld and the pair touches a terminal (1 or 9), no honours, with at least one run. |
| **Twice Pure Double Sequence** ("ryanpeikou") | The four melds partition into two distinct pairs of identical runs. |

## 6 han

| Yaku | Description |
| --- | --- |
| **Full Flush** ("chinitsu") | Every tile is in a single numbered suit, no honours. |

## Yakuman

Yakuman pay a flat base regardless of fu. Co-firing yakuman stack (e.g. Big Three Dragons + All Honours = double yakuman). Red fives and dora do not contribute on top of a yakuman.

| Yaku | Description |
| --- | --- |
| **Big Three Dragons** ("daisangen") | Triplets of all three dragons. |
| **Thirteen Orphans** ("kokushi musou") | One of each terminal and honour, with one of them paired — only fires on the kokushi decomposition. |
| **All Honours** ("tsuuiisou") | Every tile is a wind or dragon. |
| **All Terminals** ("chinroutou") | Every tile is a 1 or 9 of a numbered suit. |
| **All Green** ("ryuuiisou") | Every tile is sou 2/3/4/6/8 or green dragon. |
| **Big Four Winds** ("daisuushii") | Four wind triplets. |
| **Little Four Winds** ("shousuushii") | Three wind triplets plus the fourth wind as the pair. |
| **Nine Gates** ("chuuren poutou") | One numbered suit only, with the canonical `1112345678999` core plus any one additional tile in the same suit. |

## Precedence

When two yaku overlap on the same decomposition, only the higher-value form is kept:

- **Twice Pure Double Sequence** supersedes **Pure Double Sequence**.
- **Full Flush** supersedes **Half Flush**.
- **Pure Outside Hand** supersedes **Outside Hand**.

A hand that decomposes as both standard (e.g. ryanpeikou) and chiitoitsu is scored on whichever decomposition yields the higher total points.

## Bonuses (not yaku)

These add han only when paired with at least one real yaku — they do not qualify a hand for a win on their own.

- **Red Five** — han equal to the number of red-five tiles in the hand (when the rule is enabled).
- **Dora** — han equal to the number of dora tiles in the hand, derived from the dora indicators.
