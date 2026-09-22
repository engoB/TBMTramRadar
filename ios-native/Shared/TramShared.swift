// Partagé entre l'app et l'extension widget (cocher les deux cibles dans Xcode).
import Foundation
import SwiftUI
#if canImport(ActivityKit)
import ActivityKit
#endif

enum TramShared {
    /// Groupe d'apps commun à l'app et au widget (Signing & Capabilities > App Groups).
    static let appGroup = "group.fr.tramradar.bordeaux"
    static let widgetKey = "tramWidgetData"
}

/// Données écrites par l'app pour le widget.
struct TramWidgetData: Codable {
    var station: String
    var stopPoints: [String]
    var line: String
    var lineRef: String
    var directionRef: String
    var color: String
    var destination: String
    var destStopPoints: [String]
    var arrivals: [Date]
    var walkSeconds: Int
    var apiBase: String
    var apiKey: String
    var updatedAt: Date

    static func load() -> TramWidgetData? {
        guard let d = UserDefaults(suiteName: TramShared.appGroup)?.data(forKey: TramShared.widgetKey) else { return nil }
        return try? JSONDecoder().decode(TramWidgetData.self, from: d)
    }
    func save() {
        guard let d = try? JSONEncoder().encode(self) else { return }
        UserDefaults(suiteName: TramShared.appGroup)?.set(d, forKey: TramShared.widgetKey)
    }
}

#if canImport(ActivityKit)
/// Live Activity : un tram suivi sur l'écran verrouillé et dans la Dynamic Island.
@available(iOS 16.1, *)
struct TramActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var arrival: Date
        var leaveBy: Date
        var verdict: String      // green, orange, red, none
        var headline: String     // « Vous l'avez »
        var detail: String       // « Place de la Bourse, 3 arrêts avant la station »
        var delayMinutes: Int
    }
    var line: String
    var color: String
    var destination: String
    var station: String
}
#endif

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
    static func verdict(_ v: String) -> Color {
        switch v {
        case "green": return Color(red: 0.08, green: 0.50, blue: 0.24)
        case "orange": return Color(red: 0.96, green: 0.62, blue: 0.04)
        case "red": return Color(red: 0.86, green: 0.15, blue: 0.15)
        default: return Color(red: 0.20, green: 0.25, blue: 0.33)
        }
    }
}
