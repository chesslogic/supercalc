# Patch 7.0.2: Eagle Gas Airstrike

The wiki records the permanent Eagle Gas Airstrike addition on September 7,
2026, during patch 1.007.002. This campaign reward is separate from Orbital Gas
Strike.

Source: [wiki revision 139358](https://helldivers.wiki.gg/wiki/Eagle_Gas_Airstrike?oldid=139358).

The reviewed attack tables give these runtime rows:

| Attack | DMG / DUR | AP | DF | ST | PF | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `S_P6` projectile | 1500 / 1500 | 7 | 40 | 20 | 15 | None |
| `S_P6_IE` explosion | 0 / 0 | 6 | 50 | 10 | 40 | Gas, Gas_Confusion |

The source revision reflects patch 7.2.0. Its change history records an explosion
demolition reduction from 50 to 40 in that patch. This earlier commit retains
the pre-7.2.0 explosion value of 50. The projectile keeps demolition 40.

The gas status is not another immediate damage event. The rows do not invent
a total number of bombs or a firing RPM. Cooldowns, rearm times, gas duration,
and damage over time remain outside the current calculation model.

Orbital Gas Strike retains its separate 300-damage projectile and demolition
50 on both attack rows.
