# Changelog

All notable changes to Controller Notify are documented here.

## [1.0.3] — Live Scores & Formatting Update

### Added
- Real-time live scoreboard & minute updates across all matches in the schedule
- Standardized fixture row element order (`Team Name` `Logo` `Score` `Minute` `Score` `Logo` `Team Name`) across Matches and Pinned Fixtures
- Shared monospace font styling (`score-val`) for score display in both Matches and Pinned Fixtures

### Fixed
- Automatic sanitization of legacy local configuration cache containing null kickoff times
- Stale "TBD" display in pinned fixtures auto-repaired on startup

## [1.0.2] — Football Update

### Added
- ⚽ **Football match notifications & schedule** powered by football-data.org v4 (free tier) with optional keyless ESPN "Live Boost" for faster live scores
- New ⚽ Football settings tab with two sub-tabs:
  - **📅 Matches**: 7-day fixture schedule grouped by day, league filter chips, All/Favorites/Live/Finished filter pills, star-to-pin fixtures
  - **⭐ Favorites & Setup**: favorite teams (works keylessly via bundled big-clubs list), pinned fixtures, free API key setup, pre-match reminder timing, Live Boost toggle
- Corner-popup notifications for watched fixtures: pre-match **Reminder**, **Kickoff**, and **Full-time** score
- Big Match flame badge for elite-club clashes
- Football accent colors added to all five themes
- Unified 📜 History tab now shows both stream and fixture events with type badges

### Changed
- OS system notifications fully deprecated — all notifications are sliding corner popups; tray **Check Now** now reports results via popup as well
- Tray tooltip shows the next/live watched fixture

### Fixed
- Adaptive request throttling following the official football-data.org policy response headers (`X-RequestsAvailable`, `X-RequestCounter-Reset`), including bounded retry on HTTP 429

## [1.0.1]

### Fixed
- URL opening behavior in watchlist

## [1.0.0]

### Added
- Initial release: YouTube live monitoring with corner popups, multi-channel watchlist, Google Takeout CSV import, live hub, notification history, five color themes
