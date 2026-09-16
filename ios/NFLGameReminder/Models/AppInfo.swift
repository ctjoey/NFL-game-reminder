import Foundation

/// The product name, in one place.
///
/// It surfaces in a share message, an email signature, a notification title, an instruction that
/// tells you what to look for in iOS Settings, and the wordmark. Renaming to GameDial meant
/// editing all five by hand and hoping none were missed, which is precisely how an app ends up
/// half-renamed with one screen still saying something else.
///
/// This lives in Models rather than next to the views because the widget target compiles Models
/// and Services but not Views, so anything in Services that needs the name has to find it here.
enum AppInfo {
    static let name = "GameDial"
}
