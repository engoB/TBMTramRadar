// Plugin Capacitor : relie l'app web au widget et à la Live Activity.
import Foundation
import Capacitor
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(TramActivityPlugin)
public class TramActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TramActivityPlugin"
    public let jsName = "TramActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWidget", returnType: CAPPluginReturnPromise)
    ]

    private func date(_ call: CAPPluginCall, _ key: String) -> Date {
        Date(timeIntervalSince1970: (call.getDouble(key) ?? Date().timeIntervalSince1970 * 1000) / 1000)
    }

    @objc func saveWidget(_ call: CAPPluginCall) {
        let data = TramWidgetData(
            station: call.getString("station") ?? "",
            stopPoints: call.getArray("stopPoints", String.self) ?? [],
            line: call.getString("line") ?? "",
            lineRef: call.getString("lineRef") ?? "",
            directionRef: call.getString("directionRef") ?? "0",
            color: call.getString("color") ?? "#0f172a",
            destination: call.getString("destination") ?? "",
            destStopPoints: call.getArray("destStopPoints", String.self) ?? [],
            arrivals: (call.getArray("arrivals", Double.self) ?? []).map { Date(timeIntervalSince1970: $0 / 1000) },
            walkSeconds: call.getInt("walkSeconds") ?? 0,
            apiBase: call.getString("apiBase") ?? "",
            apiKey: call.getString("apiKey") ?? "",
            updatedAt: Date())
        data.save()
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private func state(_ call: CAPPluginCall) -> TramActivityAttributes.ContentState {
        TramActivityAttributes.ContentState(
            arrival: date(call, "arrival"), leaveBy: date(call, "leaveBy"),
            verdict: call.getString("verdict") ?? "none", headline: call.getString("headline") ?? "",
            detail: call.getString("detail") ?? "", delayMinutes: call.getInt("delayMinutes") ?? 0)
    }
    #endif

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.reject("iOS 16.2 requis"); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.reject("Activités en direct désactivées"); return }
        let attrs = TramActivityAttributes(line: call.getString("line") ?? "", color: call.getString("color") ?? "#0f172a",
                                           destination: call.getString("destination") ?? "", station: call.getString("station") ?? "")
        let st = state(call)
        Task {
            for a in Activity<TramActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            do {
                _ = try Activity.request(attributes: attrs, content: ActivityContent(state: st, staleDate: st.arrival.addingTimeInterval(120)), pushType: nil)
                call.resolve()
            } catch { call.reject(error.localizedDescription) }
        }
        #else
        call.unavailable("ActivityKit indisponible")
        #endif
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let st = state(call)
        Task {
            for a in Activity<TramActivityAttributes>.activities {
                await a.update(ActivityContent(state: st, staleDate: st.arrival.addingTimeInterval(120)))
            }
            call.resolve()
        }
        #else
        call.resolve()
        #endif
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task {
            for a in Activity<TramActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            call.resolve()
        }
        #else
        call.resolve()
        #endif
    }
}
