# Patch 1.007.000 enemy data

## Patch-owned changes

Arrowhead's Devoid of Liberty 7.0.0 notes identify Crusher and Wretch as new
Illuminate enemies. The same notes raise the MD-17 Anti-Tank Mines' demolition
strength from 30 to 40. This is a demolition-only change; ordinary damage,
durable damage, armor penetration, stagger, and push are unchanged.

Source: [Arrowhead patch notes](https://arrowhead.zendesk.com/hc/en-us/articles/29543746599964-Devoid-of-Liberty-7-0-0)

PlayStation's launch post independently identifies and describes both enemies.

Source: [PlayStation Blog](https://blog.playstation.com/2026/08/12/helldivers-2-joins-playstation-plus-game-catalog-today-devoid-of-liberty-update-out-now/)

## Vote Snatchers

The official notes do not name the Vote Snatchers subfaction. The wiki's
revision 130005 identifies Crusher and Wretch as its two unique enemies.

Source: [wiki.gg revision 130005](https://helldivers.wiki.gg/api.php?action=query&prop=revisions&revids=130005&rvprop=ids%7Ctimestamp%7Ccomment%7Ccontent&rvslots=main&format=json&formatversion=2)

Crusher's checked-in static anatomy matches wiki revision 130272. Arrowhead
states that Crusher regenerates, but Supercalc does not model regeneration.
The wiki reports 30 HP/s after a 0.5-second delay for most Crusher zones; these
exact values remain secondary-source data and should be verified from a current
game-data extraction before regeneration is implemented.

Source: [wiki.gg Crusher revision 130272](https://helldivers.wiki.gg/api.php?action=query&prop=revisions&revids=130272&rvprop=ids%7Ctimestamp%7Ccomment%7Ccontent&rvslots=main&format=json&formatversion=2)

Wretch's checked-in sidecar predated wiki revision 130076, which corrected Main
explosion damage resistance to 0%. In Supercalc, an omitted `ExMult` means full
explosion damage, while `ExMult: 0` means complete explosion immunity. The
production enemy record and sidecar therefore remove Main's stale `ExMult: 0`.

Source: [wiki.gg Wretch revision 130076](https://helldivers.wiki.gg/api.php?action=query&prop=revisions&revids=130076&rvprop=ids%7Ctimestamp%7Ccomment%7Ccontent&rvslots=main&format=json&formatversion=2)

## Reload scope

Patch 1.007.000 also changes assisted reload behavior, several magazine counts,
and some reload times. Supercalc has no magazine or reload columns. Its modeled
TTK uses shot count and RPM and explicitly excludes reload time, so these
changes do not affect current calculations.
