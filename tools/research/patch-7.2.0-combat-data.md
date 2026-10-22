# Patch 7.2.0 combat data

## Release scope

This audit covers the releases after the checked-in 7.0.0 data through Devoid
of Liberty 7.2.0, released October 20, 2026.

| Release | Modeled changes |
| --- | --- |
| 7.0.1 | None. Crash and UI fixes |
| 7.0.2 | Eagle Gas Airstrike campaign reward, added permanently September 7 |
| 7.1.0 | None. Ammo, recoil, cooldown, spawn, and behavior changes |
| 7.1.1 | None. Crash fixes |
| 7.2.0 | Weapon balance changes, Scope of Authority equipment, and Crescent Overseer backpack |

The Eagle Gas Airstrike addition has its own earlier commit and
[source audit](patch-7.0.2-eagle-gas.md). This patch changes its explosion
demolition strength from 50 to 40.

Official patch sources:

- [7.0.1](https://store.steampowered.com/news/app/553850/view/1840944183785447)
- [7.0.2](https://store.steampowered.com/news/app/553850/view/1841579228677702)
- [7.1.0](https://arrowhead.zendesk.com/hc/en-us/articles/30492249897756-Devoid-of-Liberty-7-1-0)
- [7.1.1](https://store.steampowered.com/news/app/553850/view/1844751498220713)
- [7.2.0](https://arrowhead.zendesk.com/hc/en-us/articles/31176395885596-Devoid-of-Liberty-7-2-0)

Arrowhead uses the release label 7.2.0. The wiki labels the same release
1.007.200. The new weapon pages record their addition under that build.

## Weapon balance

The official 7.2.0 notes establish the balance changes. The CSV retains
per-pellet damage for shotguns rather than storing a full-shot total.

| Weapon | CSV DMG / DUR | Pellets | Full-shot DMG / DUR |
| --- | --- | --- | --- |
| M90A | 66 / 24 | 11 | 726 / 264 |
| SG-8 Punisher | 54 / 15 | 9 | 486 / 135 |
| SG-225 Breaker | 36 / 8 | 11 | 396 / 88 |
| SG-225SP Breaker Spray&Pray | 18 / 5 | 16 | 288 / 80 |
| SG-22 Bushwhacker | 54 / 15 | 9 | 486 / 135 |

**Bushwhacker source correction:** The official notes say 450 -> 540 damage.
The wiki detailed attack table reports 54 damage per pellet and nine pellets.
Its change history explicitly records the actual increase as 405 -> 486.
The runtime data follows that actual attack value, not the incorrect total.
Durable damage increases from 108 to 135 in both sources.

Source: [Bushwhacker revision 139396](https://helldivers.wiki.gg/wiki/SG-22_Bushwhacker?oldid=139396).

The other reviewed changes are:

| Weapon or attack | Accepted change |
| --- | --- |
| MA5C | DUR 16 -> 20 |
| StA-11 | DMG 90 -> 100, DUR 18 -> 20 |
| PLAS-39 projectile | ST 20 -> 15. The separate explosion is unchanged |
| M-1000 Maxigun | ST 15 -> 20, PF 12 -> 24 |
| EXO-51 flamethrower | DMG / DUR 3 / 3 -> 8 / 8 |
| A/FLAM-40 Flame Sentry | DMG / DUR 3 / 3 -> 8 / 8 |
| Eagle Gas Airstrike explosion | DF 50 -> 40 |

The Maxigun detailed table calls the changed impulse field Push Force.
The CSV therefore records the new value in `PF`.

Source: [Maxigun revision 139214](https://helldivers.wiki.gg/wiki/M-1000_Maxigun?oldid=139214).

The official flame notes specify particle damage 3 -> 8 without a separate
durable-damage bullet. The detailed tables independently report 8 standard
and 8 durable damage for both flame attacks. Their other fields stay unchanged.

Sources:
[Lumberer revision 139219](https://helldivers.wiki.gg/wiki/EXO-51_Lumberer_Exosuit?oldid=139219),
[Flame Sentry revision 139220](https://helldivers.wiki.gg/wiki/A/FLAM-40_Flame_Sentry?oldid=139220).

Eagle Gas Airstrike is not an alias for Orbital Gas Strike. Its current
projectile and explosion both have demolition 40. Orbital Gas Strike retains
demolition 50 on both rows.

Sources:
[Eagle Gas revision 139358](https://helldivers.wiki.gg/wiki/Eagle_Gas_Airstrike?oldid=139358),
[Orbital Gas revision 134393](https://helldivers.wiki.gg/wiki/Orbital_Gas_Strike?oldid=134393).

StA-52 receives no damage change. Its magazine and recoil changes do not
require a CSV edit.

## Scope of Authority equipment

The official announcement supplies names and descriptions, not the detailed
attack numbers. The revision-pinned wiki tables supply the numeric rows.
These new pages carry a work-in-progress notice.

| Item | DMG / DUR | AP | RPM | DF / ST / PF | Wiki revision |
| --- | --- | --- | --- | --- | --- |
| R-40 Sightliner | 350 / 205 | 4 | 40 | 10 / 20 / 25 | [139340](https://helldivers.wiki.gg/wiki/R-40_Sightliner?oldid=139340) |
| P-44 Mist | 110 / 18 | 2 | 400 | 10 / 10 / 4 | [139371](https://helldivers.wiki.gg/wiki/P-44_Mist?oldid=139371) |
| AMW-20 Apex | 1550 / 930 | 5 | 50 | 15 / 40 / 25 | [139495](https://helldivers.wiki.gg/wiki/AMW-20_Apex?oldid=139495) |
| LAS-44 Nova | 880 / 880 | 5 | 30 | 17 / 20 / 20 | [139392](https://helldivers.wiki.gg/wiki/LAS-44_Nova?oldid=139392) |
| G-11 Caltrops explosion | 50 / 10 | 3 | Not applicable | 10 / 30 / 0 | [139419](https://helldivers.wiki.gg/wiki/G-11_Caltrops?oldid=139419) |

The AP labels map to the existing numeric convention: Light 2, Medium 3,
Heavy 4, and Anti-Tank I 5.

Source: [Damage revision 138884](https://helldivers.wiki.gg/wiki/Damage?oldid=138884).

The Apex uses the detailed Anti-Tank I value, not its misleading armory
description of Heavy penetration. The Nova is a Support weapon with one
non-explosive projectile, not a primary weapon or a continuous beam.

The rows use the existing weapon taxonomy. The Mist follows the automatic
sidearm category. The Apex and Nova follow the precision support category.

Caltrops has one explosion row with `Stun Small`. The calculator does not
assume that every mine in a deployed field hits one target. The attack table
supplies peak inner-explosion values, consistent with existing grenade rows.

The Nova keeps the detailed table's nominal RPM of 30. Its modeled TTK starts
with the first immediate shot, as with existing discrete weapons. It does not
include the 1.6-second initial charge, heat, cooling, or weather effects.

### Falloff profiles

The detailed projectile tables supply these physical values:

| Weapon | Caliber (mm) | Mass (g) | Velocity (m/s) | Drag |
| --- | --- | --- | --- | --- |
| Sightliner | 8 | 11 | 950 | 0.2 |
| Mist | 9 | 7 | 375 | 1.2 |
| Apex | 60 | 70 | 1500 | 0.1 |
| Nova | 10 | 8 | 1500 | 0 |

The CSV stores the physical values for the existing falloff model.
Its observed-distance columns stay blank because these are not measurements.
Zero drag preserves the Nova's documented absence of ballistic falloff.

## Crescent Overseer backpack

The official patch notes make the backpack destructible and fatal.
The wiki anatomy table supplies its detailed values.

Source: [Crescent Overseer revision 139398](https://helldivers.wiki.gg/wiki/Crescent_Overseer?oldid=139398).

| Field | Accepted value |
| --- | --- |
| Health | 300 |
| AV | 2 |
| Durable | 0% |
| Transfer to Main | 50% |
| Main overflow cap | True |
| Fatal | True |
| Constitution | None |
| Explosion target | Main |

The source reports 100% explosion resistance for the backpack. The existing
ingest convention routes explosions to Main instead of damaging that part.
The new zone does not set Main's `ExMult` to zero.

The runtime and sidecar both contain the new zone. The sidecar records a
revision-specific browser override for this zone. Its older fetch timestamp
still describes the original full-unit import. Other anatomy remains intact.

## Excluded mechanics

The refresh does not change calculator formulas. Recoil, ergonomics, magazine
counts, reloads, charge delay, heat, status duration, regeneration, and
stratagem cooldowns remain outside the current model.

The Sickle timing changes, StA-52 changes, enemy spawn changes, and player
hazard fixes therefore require no runtime stat edits. Armor passives and
cosmetics are also excluded.

## Source access and review

The raw wiki module and API requests failed with HTTP 502. A browser request
to the raw module returned HTTP 403. Normal rendered wiki pages remained
accessible through Playwright.

The audit reads the detailed tables and their revision IDs through the
browser. It does not bypass the unavailable raw endpoints. A failed request
does not prove that the source lacks data.

The report-first orchestrator reads existing source artifacts. It does not
fetch fresh game data. The older attack artifact and anatomy sidecar remain
comparison inputs, not instructions to overwrite curated runtime data.
Hive Guard and Vox Engine protections remain unchanged.
