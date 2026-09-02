# NFL Game Reminder — iOS (SwiftUI)

Native port of the web app. Same engine (ZIP → market → station → channel, regional coverage,
access check, two-clock alerts, flex detection), running on-device with local notifications.

## Open in Xcode (macOS)

```bash
brew install xcodegen
cd ios
xcodegen generate
open NFLGameReminder.xcodeproj
```

Select the `NFLGameReminder` scheme, pick a simulator (iPhone 15 or newer, iOS 17+), Run.
Set your Team under Signing & Capabilities to run on a device (needed for real notifications
timing and background refresh).

This code was written without access to Xcode, so expect a first-build pass to fix small
compiler nits. The architecture, data and logic mirror the tested Node version.

## Layout

```
project.yml                     XcodeGen spec (app, widget extension, unit tests)
NFLGameReminder/
  App/        NFLGameReminderApp (entry, notification delegate), AppState (source of truth)
  Models/     Game, Market, Provider, UserProfile, GameCard, PlannedAlert, ScheduleChange
  Services/   Teams, BroadcastWindows (pregame rules), TimeFormat, Catalog (markets/providers,
              channel + access resolution), CoverageEngine, ScheduleStore (+ ESPNAdapter, diff),
              CardBuilder, AlertPlanner, NotificationManager (UNUserNotificationCenter),
              CalendarService (EventKit)
  App/BackgroundRefresh.swift   BGAppRefreshTask registration (app target only)
  Views/      OnboardingView, WeekView (+ GameCardView, GameDetailView), AlertsView, SettingsView
  Resources/  seed-2026.json, markets.json, providers.json, overrides-2026.json (shared with web)
NFLGameReminderWidget/  Next-game widget (home + lock screen)
NFLGameReminderTests/   XCTest for coverage, channels, access, planner, diff, ESPN normalization
```

## How alerts work on iOS

- Alerts are planned from the schedule (never from live scores) and scheduled as local
  notifications: the next 60, re-planned on every foreground, settings change and background
  refresh. Time-sensitive interruption level for coverage/kickoff; quiet hours shift the rest.
- Background refresh re-syncs the ESPN feed; any time/network change on a followed game fires a
  "Schedule change" notification immediately and re-arms the reminders.
- The Game detail sheet has a DEBUG-only "Simulate a flex" button to see this end to end.

See `docs/05-ios-tiers.md` for the plan to App Store release.
