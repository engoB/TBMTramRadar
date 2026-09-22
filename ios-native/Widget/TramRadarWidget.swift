// Extension widget : widget d'écran d'accueil / verrouillé + Live Activity.
// Remplace le fichier généré par Xcode (File > New > Target > Widget Extension, « Include Live Activity » coché).
// Cible minimale de l'extension : iOS 16.2.
import WidgetKit
import SwiftUI
#if canImport(ActivityKit)
import ActivityKit
#endif

// MARK: - Données

struct TramEntry: TimelineEntry {
    let date: Date
    let data: TramWidgetData?
    let live: Bool
    var upcoming: [Date] { (data?.arrivals ?? []).filter { $0 > date.addingTimeInterval(-20) } }
}

/// Relit l'API temps réel TBM (SIRI Lite) pour la station et la direction enregistrées par l'app.
enum TramFetcher {
    static func arrivals(for d: TramWidgetData) async -> [Date]? {
        guard !d.apiBase.isEmpty, var comp = URLComponents(string: d.apiBase + "estimated-timetable.json") else { return nil }
        comp.queryItems = [URLQueryItem(name: "AccountKey", value: d.apiKey),
                           URLQueryItem(name: "LineRef", value: d.lineRef),
                           URLQueryItem(name: "DirectionRef", value: d.directionRef)]
        guard let url = comp.url else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 12)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (raw, _) = try? await URLSession.shared.data(for: req),
              let root = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
              let siri = root["Siri"] as? [String: Any],
              let sd = siri["ServiceDelivery"] as? [String: Any],
              let etd = (sd["EstimatedTimetableDelivery"] as? [[String: Any]])?.first else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let isoFrac = ISO8601DateFormatter()
        isoFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func parse(_ v: Any?) -> Date? { guard let s = v as? String else { return nil }; return iso.date(from: s) ?? isoFrac.date(from: s) }
        let stops = Set(d.stopPoints), dests = Set(d.destStopPoints)
        var out: [Date] = []
        for frame in (etd["EstimatedJourneyVersionFrame"] as? [[String: Any]]) ?? [] {
            for j in (frame["EstimatedVehicleJourney"] as? [[String: Any]]) ?? [] {
                if (j["Cancellation"] as? Bool) == true { continue }
                let calls = ((j["EstimatedCalls"] as? [String: Any])?["EstimatedCall"] as? [[String: Any]]) ?? []
                let refs = calls.map { (($0["StopPointRef"] as? [String: Any])?["value"] as? String) ?? "" }
                guard let i = refs.firstIndex(where: { stops.contains($0) }) else { continue }
                if !dests.isEmpty, !refs[(i + 1)...].contains(where: { dests.contains($0) }) { continue }
                let c = calls[i]
                if let t = parse(c["ExpectedArrivalTime"]) ?? parse(c["AimedArrivalTime"]) ?? parse(c["ExpectedDepartureTime"]) { out.append(t) }
            }
        }
        return out.filter { $0 > Date().addingTimeInterval(-30) }.sorted()
    }
}

struct TramProvider: TimelineProvider {
    func placeholder(in context: Context) -> TramEntry { TramEntry(date: Date(), data: nil, live: false) }
    func getSnapshot(in context: Context, completion: @escaping (TramEntry) -> Void) {
        completion(TramEntry(date: Date(), data: TramWidgetData.load(), live: false))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TramEntry>) -> Void) {
        Task {
            var data = TramWidgetData.load()
            var live = false
            if let d = data, let fresh = await TramFetcher.arrivals(for: d) {
                data?.arrivals = fresh
                data?.updatedAt = Date()
                live = true
                data?.save()
            }
            // Une entrée à chaque passage : le widget avance tout seul au tram suivant.
            let now = Date()
            var entries = [TramEntry(date: now, data: data, live: live)]
            for t in (data?.arrivals ?? []).filter({ $0 > now }).prefix(4) {
                entries.append(TramEntry(date: t.addingTimeInterval(30), data: data, live: live))
            }
            let next = min(now.addingTimeInterval(10 * 60), (data?.arrivals.first(where: { $0 > now }) ?? now.addingTimeInterval(600)))
            completion(Timeline(entries: entries, policy: .after(max(next, now.addingTimeInterval(120)))))
        }
    }
}

// MARK: - Vues du widget

struct LineBadge: View {
    let line: String, color: String, size: CGFloat
    var body: some View {
        Text(line).font(.system(size: size * 0.55, weight: .heavy)).foregroundColor(.white)
            .frame(width: size, height: size).background(RoundedRectangle(cornerRadius: size * 0.28).fill(Color(hex: color)))
    }
}

struct TramWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: TramEntry

    var body: some View {
        if let d = entry.data {
            switch family {
            case .accessoryRectangular: rectangular(d)
            case .accessoryInline: inline(d)
            case .systemMedium: medium(d)
            default: small(d)
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Tram Radar").font(.headline)
                Text("Ouvrez l\u{2019}app et choisissez une direction.").font(.caption).foregroundColor(.secondary)
            }
        }
    }

    @ViewBuilder func countdown(_ t: Date?) -> some View {
        if let t = t { Text(t, style: .timer).monospacedDigit() } else { Text("—") }
    }
    func leaveLine(_ d: TramWidgetData, _ t: Date?) -> String {
        guard let t = t, d.walkSeconds > 0 else { return d.station }
        let leave = t.addingTimeInterval(-Double(d.walkSeconds))
        let f = DateFormatter(); f.dateFormat = "HH:mm"
        return leave > entry.date ? "Partez à \(f.string(from: leave))" : "Trop juste à pied"
    }

    func small(_ d: TramWidgetData) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                LineBadge(line: d.line, color: d.color, size: 22)
                Text(d.destination).font(.system(size: 13, weight: .bold)).lineLimit(2)
            }
            Spacer(minLength: 0)
            countdown(entry.upcoming.first).font(.system(size: 34, weight: .heavy))
            Text(leaveLine(d, entry.upcoming.first)).font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
            Text(d.station).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
        }
    }

    func medium(_ d: TramWidgetData) -> some View {
        HStack(alignment: .top, spacing: 14) {
            small(d)
            VStack(alignment: .leading, spacing: 8) {
                Text("Ensuite").font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
                ForEach(Array(entry.upcoming.dropFirst().prefix(3)), id: \.self) { t in
                    Text(t, style: .time).font(.system(size: 17, weight: .bold)).monospacedDigit()
                }
                Spacer(minLength: 0)
                Text(entry.live ? "Temps réel TBM" : "Dernières données connues").font(.system(size: 10)).foregroundColor(.secondary)
            }
        }
    }

    func rectangular(_ d: TramWidgetData) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(d.line) · \(d.destination)").font(.headline).lineLimit(1)
            countdown(entry.upcoming.first).font(.system(size: 20, weight: .bold))
            Text(leaveLine(d, entry.upcoming.first)).font(.caption).lineLimit(1)
        }
    }

    func inline(_ d: TramWidgetData) -> some View {
        if let t = entry.upcoming.first { return Text("\(d.line) \(d.destination) ") + Text(t, style: .timer) }
        return Text("\(d.line) \(d.destination)")
    }
}

struct TramRadarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TramRadarWidget", provider: TramProvider()) { entry in
            if #available(iOS 17.0, *) {
                TramWidgetView(entry: entry).containerBackground(.background, for: .widget)
            } else {
                TramWidgetView(entry: entry).padding()
            }
        }
        .configurationDisplayName("Mon tram")
        .description("Le prochain tram de votre direction habituelle, en temps réel.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Live Activity

#if canImport(ActivityKit)
struct TramLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TramActivityAttributes.self) { ctx in
            // Écran verrouillé
            HStack(spacing: 14) {
                LineBadge(line: ctx.attributes.line, color: ctx.attributes.color, size: 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text(ctx.state.headline).font(.system(size: 20, weight: .heavy)).foregroundColor(Color.verdict(ctx.state.verdict))
                    Text("vers \(ctx.attributes.destination)").font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text(ctx.state.detail).font(.system(size: 12)).foregroundColor(.secondary).lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(timerInterval: Date()...max(Date(), ctx.state.arrival), countsDown: true)
                        .font(.system(size: 30, weight: .heavy)).monospacedDigit().multilineTextAlignment(.trailing).frame(width: 96)
                    if ctx.state.delayMinutes != 0 {
                        Text(ctx.state.delayMinutes > 0 ? "retard +\(ctx.state.delayMinutes) min" : "avance \(-ctx.state.delayMinutes) min").font(.caption2)
                    }
                }
            }
            .padding(16)
            .activityBackgroundTint(Color(.systemBackground))
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { LineBadge(line: ctx.attributes.line, color: ctx.attributes.color, size: 34) }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...max(Date(), ctx.state.arrival), countsDown: true).font(.title2.bold()).monospacedDigit().frame(width: 80)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(ctx.state.headline).font(.headline).foregroundColor(Color.verdict(ctx.state.verdict))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(ctx.attributes.station) → \(ctx.attributes.destination)").font(.caption).lineLimit(1)
                }
            } compactLeading: {
                LineBadge(line: ctx.attributes.line, color: ctx.attributes.color, size: 22)
            } compactTrailing: {
                Text(timerInterval: Date()...max(Date(), ctx.state.arrival), countsDown: true).monospacedDigit().frame(width: 44)
                    .foregroundColor(Color.verdict(ctx.state.verdict))
            } minimal: {
                LineBadge(line: ctx.attributes.line, color: ctx.attributes.color, size: 20)
            }
        }
    }
}
#endif

@main
struct TramRadarWidgets: WidgetBundle {
    var body: some Widget {
        TramRadarWidget()
        TramLiveActivity()
    }
}
