import SwiftUI
import UIKit

/// Puts away whatever keyboard is on screen.
@MainActor func dismissKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                    to: nil, from: nil, for: nil)
}

extension View {
    /// The ZIP field uses `.numberPad`, which has no return key, so once it is focused there is
    /// nothing on the keyboard that puts it away and it covers the rest of the form. Every form
    /// with a text field gets a Done button above the keyboard and drag-to-dismiss.
    func dismissableKeyboard() -> some View {
        self
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { dismissKeyboard() }
                    .fontWeight(.semibold)
                }
            }
    }
}

/// A form picker that gives the selected value the whole row instead of whatever is left over
/// after the label. Market names are long — a standard menu picker renders
/// "West Palm Beach-Fort Pierce, FL" as "West Palm B…ort Pierce, FL".
struct WidePicker<Selection: Hashable, Content: View>: View {
    let title: String
    @Binding var selection: Selection
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Picker(title, selection: $selection, content: content)
                .labelsHidden()
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 2)
    }
}
