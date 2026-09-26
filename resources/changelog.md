# Territorium — Changelog

## v0.1.5

🏗️ **Building upgrades**

- Click one of your buildings to open its card: its level, what the next level brings, and an Upgrade button with the price.
- Upgraded buildings get a metal frame on the map and on the card: bronze at level 2, silver at level 3, gold from level 4.
- Military buildings now have a level cap, and each level unlocks after a set time, counted from the end of the spawn phase. While a level is locked, the card counts down to it.
  - SAM launcher: up to level 5. Level 2 at 5 min, level 3 at 10 min, level 4 at 15 min, level 5 at 20 min.
  - Missile silo: up to level 3. Level 2 at 5 min, level 3 at 10 min.
  - Radar: it can now be upgraded, up to level 3 (level 2 at 5 min, level 3 at 10 min). Each level adds 25 tiles of range: 100, 125, then 150.
- In ranked games the caps are lower and levels come later: SAM up to level 3, silo and radar up to level 2, level 2 at 8 min and level 3 at 15 min.
- Cities, ports and factories are unchanged: no cap, no wait.

## v0.1.4

⚡ **EMP bomb**

- An EMP now bursts on impact: a white flash, then a ring of blue lightning and crackling sparks that spreads over its whole 20-tile reach. An EMP shot down by a SAM explodes like any other intercepted missile.

🧱 **Control panel**

- The build bar is split into four trays (economy, defense, navy, missiles) and fills the panel's width. Each tile shows its hotkey in the corner and how many you own under the icon, or the price for missiles. The building you're placing is framed in gold.
- On computers, the map objectives now sit next to the attack slider instead of taking a row of their own.

## v0.1.3

🧱 **Build bar**

- Buildings are now grouped: economy (city, factory, port), defense (defense post, missile silo, SAM launcher, radar), navy (warship) and missiles (atom bomb, hydrogen bomb, EMP bomb, MIRV), with a thin separator between each group. The build menu and the hotkey settings follow the same order.
- New default hotkeys: `V` for the radar and `X` for the EMP bomb. The old ones (`=` and `-`) also zoomed the map.

⚡ **EMP**

- A structure hit by an EMP is now shown in steady red for as long as it is disabled, instead of pulsing.

🛡️ **Reports and game history**

- Player reports now reach the moderation team, who review each one with the game's replay.
- Your game history and replays are kept for 30 days (subscribers keep theirs longer, as before). A game that is under review is kept until the review is done.

## v0.1.2

⚡ **EMP bomb**

- A new missile fired from a missile silo, for 1,500,000 gold (fixed price). Hotkey: `-`.
- It does no damage and takes no land. On impact it disables every enemy defense post, SAM launcher, missile silo, port and radar within 20 tiles for 15 seconds. Disabled structures pulse electric blue.
- A disabled SAM doesn't fire, a disabled silo can't launch, a disabled port sends no ships and a disabled defense post gives no defense bonus.
- Once a structure recovers, it is immune to EMPs for 30 seconds, so it can't be kept down forever.
- Your own and your allies' structures are never affected. SAM launchers can shoot an EMP down like any other missile.

📡 **Radar**

- A new structure: 250,000 gold for the first, +250,000 for each one you own, capped at 1,000,000. It takes 5 seconds to build. Hotkey: `=`.
- It sweeps twice per second and spots enemy boats, warships and missiles within 100 tiles. You get a message and a sonar ping, once per unit. Your own and allied units are ignored.
- An EMP blinds a radar while it is disabled.

## v0.1.1

🛍️ **Store**

- 22 new items: 5 patterns (Battlements, Cross, Lattice, Braid, Mosaic), 3 palettes (Copper, Ruby, Glacier), 5 flags, 3 crowns and 4 effects.
- Two new packs: Ruby Empire and Golden Dawn.
- Every item, pack and emerald pack name is now translated into every language.

🎥 **Creators**

- New "Support a creator" button in the store header, next to your currencies. Enter a creator's code and part of your real-money purchases goes to them, at no extra cost to you.
- Creators get a creator space in their account: their share, supporters, sales, balances and withdrawals.
- Creators also get every perk of the top subscription.

🕶️ **Hidden name**

- Seigneur and Souverain subscribers (and creators) can play under a random fake name, without clan tag or badge. Handy for streaming. Turn it on, draw another name or turn it off from the name bar on the home page.

📅 **Challenges**

- Daily, weekly and monthly challenges, and ranked seasons, now reset at midnight French time.

✨ **More**

- The verified badge no longer shows over the map during a game. It stays in the in-game scoreboard.
- The clan map and the clan leaderboard only count public games.

## v0.1.0

🎯 **Map objectives**

- A few round zones appear on the map in every solo, private and public game (a checkbox when you create the game turns them off). Ranked, 1v1, 2v2 and the daily solo race don't have them.
- Hold most of a zone's land for 15 seconds to capture it. Each zone you hold gives +15% worker gold and +5% troop growth, until someone takes it from you.
- Your bonus counts at most half the zones (2 of 3 or 4, 3 of 5 or 6). Holding more keeps them from your rivals but pays nothing extra.
- Each zone has a gold name ("◆ Objective A"). For the first five minutes, zones pulse and show their bonus. You can hide the names in the settings (Objective Names).
- The control panel shows how many zones you hold and your bonus.

🏆 **Ranked seasons**

- Ranked is now a free-for-all of 8 to 16 signed-in players on a fixed pool of maps, with no bots, nations or cosmetics.
- The ranked hub shows the current season, your tier and Elo, your placement games and the tier list.
- The leaderboard has a Ranked tab. Profiles show your standing this season and the badges from past seasons.

📅 **Challenges**

- New Challenges page: daily, weekly and monthly challenges, with progress bars and medal rewards.
- The solo race of the day: everyone plays the same map from the same start. The fastest win ranks first, and the server replays each win to check it.

📊 **Leaderboard and profiles**

- New Solo tab that ranks signed-in players by their solo wins against nations. The old ranked tab is now Multiplayer.
- Profiles show an Admin or Moderator badge for staff.

🔒 **Privacy**

- No more third-party ad script. YouTube videos load (without cookies) only when you click them.

✨ **More**

- Only clan members can wear the clan tag.
- The in-game scoreboard and HUD no longer stay on the home page after you leave a game.
- The home page is lighter: the closed store no longer redraws in the background.

## v0.0.4

💳 **Payments**

- Emeralds bought with money now go through Mollie: card and the other methods Mollie offers, on its secure checkout page.
- Before paying you tick a box to get your emeralds right away (this waives the 14-day withdrawal right), and an order confirmation arrives by email.

📊 **Stats**

- Your profile's Stats and Games tabs now fill in: wins, losses, per-mode stats and your game history.
- The end-of-game screen shows how many medals the game earned you.
- The end-of-game buttons wait 5 seconds, so you get a look at the three featured items before leaving.

🧭 **Menus**

- New top bar: Play, Store, Inventory, Leaderboard and Clans with icons, the version next to the logo, and a clear highlight on the current page.
- The Upcoming lobbies button is bigger and easier to spot.

🌍 **Languages and legal**

- Every text in the game, including the home page tagline, is now translated into every available language (Toki Pona excepted).
- New legal notice, terms of use, terms of sale and privacy policy.

## v0.0.3

🛒 **Store**

- New flags, crowns and effects for every effect type: boat trails, nuke trails, nuke explosions, structures, warships, trains and railroads.
- Bundles: four themed packs that group a pattern, a flag, a crown and matching effects for fewer emeralds.
- Emerald packs: trade your medals for emeralds.
- Subscriptions (Vassal, Lord, Sovereign): 30 days of daily medals and emeralds, bought with medals or emeralds. Buying the same tier again adds 30 days.

🏆 **Leaderboard**

- Public games with a winner now count for ranking: an Elo rating for solo games and another for team games.
- The clan leaderboard ranks clans by their wins over the last 30 days.

🛡️ **Clans**

- Create your own clan from the Clans menu, with its tag, name, description and open or request-only entry.
- Members, requests, bans, roles, donations to the clan treasury and the clan's game history all work.
- Member lists show each player's account name.
- Clan map: every map of the public rotation belongs to the clan with the most wins on it over 30 days, with region groups and held / free / mine filters.
- Clan search shows the popular clans before you type.

🏠 **Home page**

- Territorium's own look: an emblem that claims its tiles one by one, green surfaces and a play rail with Solo, Tutorial, Create, Join and Ranked.

✨ **More**

- Sixteen new nuke, warship, train and railroad effects.
- Emeralds can be bought with money from the Emeralds tab: pick any amount, 20 emeralds per euro or dollar.
- The clan menu next to your name now opens above the announcements.

## v0.0.2

🎨 **Home page**

- Redesigned the home page background: the old blue hex-grid overlay is replaced by a relief world map.
- The background now drifts and zooms very slowly, so the home page no longer feels like a static wallpaper.

## v0.0.1 — First release

- First public release of Territorium, built on the OpenFront.io engine.
- Accounts, a cosmetics store (Boutique), an inventory, a leaderboard and clans.
