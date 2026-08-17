# iOS Share Extension, manual setup

This is the one piece of the native capability layer that is **not** automated,
and this document is the honest reason why plus the exact steps to finish it.

## Why this is not scripted

A Share Extension is a second **target** in the Xcode project. Adding a target
means writing new `PBXNativeTarget`, `PBXBuildFile`, `PBXFileReference`,
`PBXSourcesBuildPhase`, `PBXContainerItemProxy`, `PBXTargetDependency` and
`XCConfigurationList` objects into `App.xcodeproj/project.pbxproj`, each keyed
by a 24-character identifier that must be unique and cross-referenced
consistently in six places. There is no first-party CLI for it: `xcodebuild`
cannot create targets, and `cap sync` never touches `project.pbxproj`'s target
graph.

Getting one of those references wrong does not fail loudly. It produces a
project file that Xcode refuses to open at all, or worse, one that opens and
silently drops the app target's build settings. That is a strictly worse
outcome than five minutes of clicking, and it would be invisible until the next
release build.

The Android half of the share target **is** fully automated (see
`android/app/src/main/AndroidManifest.xml` and `AlphaSharePlugin.java`), because
there a share target is a manifest entry, not a build target.

## What you are building

```
Other app's share sheet
  -> Alpha Workspace extension  (this document)
  -> opens alphaworkspace://share?text=<encoded>
  -> Capacitor fires appUrlOpen
  -> src/components/native/runtime.tsx  sharedTextFromUrl()
  -> quick-add opens with the text prefilled
```

The app half is already done and committed:

- `ios/App/App/Info.plist` registers the `alphaworkspace` URL scheme.
- `sharedTextFromUrl()` in `src/components/native/runtime.tsx` accepts only
  `alphaworkspace://share?text=`, and nothing else.
- `normalizeSharedText()` in `src/lib/shell.ts` cleans the text before it
  reaches the quick-add input.

## Steps

### 1. Add the target

1. Open `ios/App/App.xcworkspace` in Xcode (the **workspace**, not the
   `.xcodeproj`).
2. **File -> New -> Target...**
3. Choose **iOS -> Share Extension**. Next.
4. Product Name: `ShareExtension`
   Team: your team
   Language: **Swift**
   Embed in Application: **App**
5. Finish. When Xcode offers to activate the new scheme, choose **Cancel** (you
   want to keep building the app scheme).

### 2. Fix the bundle identifier

Select the `ShareExtension` target -> **General** and confirm the bundle
identifier is:

```
za.co.alphaworkspace.app.ShareExtension
```

It **must** be a suffix of the app's identifier (`za.co.alphaworkspace.app`) or
the extension will not install.

Set **Minimum Deployments** to the same iOS version as the App target.

### 3. Delete the generated UI

Xcode's template ships a `ShareViewController.swift` and a
`MainInterface.storyboard`. We want no UI at all: the extension should read the
text, open the app and get out of the way, because the app's own quick-add is
where the user confirms. In the Project Navigator, delete
`MainInterface.storyboard` (**Move to Trash**).

Then select the `ShareExtension` target -> **Info**, and under
`NSExtension` **remove** the `NSExtensionMainStoryboard` row. Add a row
`NSExtensionPrincipalClass` (type String) with the value:

```
$(PRODUCT_MODULE_NAME).ShareViewController
```

### 4. Declare what we accept

Still in the `ShareExtension` target -> **Info**, replace the
`NSExtensionActivationRule` value (it defaults to `TRUEPREDICATE`) with a
Dictionary containing:

| Key                                       | Type   | Value |
| ----------------------------------------- | ------ | ----- |
| `NSExtensionActivationSupportsText`        | Boolean | YES |
| `NSExtensionActivationSupportsWebURLWithMaxCount` | Number | 1 |

Text and links only. We do not accept images or files here: an attachment
belongs on a task that already exists, and offering it in the share sheet would
promise a flow that does not exist.

If you prefer editing source, that is this block in the extension's
`Info.plist`:

```xml
<key>NSExtension</key>
<dict>
	<key>NSExtensionAttributes</key>
	<dict>
		<key>NSExtensionActivationRule</key>
		<dict>
			<key>NSExtensionActivationSupportsText</key>
			<true/>
			<key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
			<integer>1</integer>
		</dict>
	</dict>
	<key>NSExtensionPointIdentifier</key>
	<string>com.apple.share-services</string>
	<key>NSExtensionPrincipalClass</key>
	<string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
</dict>
```

### 5. Paste the source

Replace the whole contents of the generated
`ShareExtension/ShareViewController.swift` with this:

```swift
import UIKit
import Social
import UniformTypeIdentifiers

/// Hands text from the iOS share sheet to the Alpha Workspace app.
///
/// There is deliberately no UI. The extension resolves the shared item, opens
/// `alphaworkspace://share?text=...` and completes. The confirm step lives in
/// the app's quick-add dialog, where the user can see the whole workspace
/// context (projects, people, dates) that a share sheet cannot show.
class ShareViewController: UIViewController {

    /// The app's registered scheme, see ios/App/App/Info.plist.
    private static let scheme = "alphaworkspace"

    /// Matches MAX_SHARED_TEXT in src/lib/shell.ts. The web layer truncates
    /// too; this just keeps an absurd paste out of a URL in the first place.
    private static let maxLength = 500

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await handleShare() }
    }

    private func handleShare() async {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let providers = item.attachments
        else {
            finish()
            return
        }

        // The subject is folded in ahead of the body for the same reason as on
        // Android: sharing an email puts the useful half in the subject.
        var parts: [String] = []
        if let subject = item.attributedContentText?.string,
           !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(subject)
        }

        for provider in providers {
            if let text = await load(provider, as: UTType.plainText) {
                parts.append(text)
            } else if let url = await load(provider, as: UTType.url) {
                parts.append(url)
            }
        }

        // Deduplicate: iOS often supplies the same string as both the
        // attributed content text and a plain-text attachment.
        var seen = Set<String>()
        let combined = parts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .joined(separator: " ")

        guard !combined.isEmpty else {
            finish()
            return
        }
        open(String(combined.prefix(Self.maxLength)))
        finish()
    }

    /// The shared value for one type, as a string, or nil.
    private func load(
        _ provider: NSItemProvider,
        as type: UTType
    ) async -> String? {
        guard provider.hasItemConformingToTypeIdentifier(type.identifier) else {
            return nil
        }
        return await withCheckedContinuation { continuation in
            provider.loadItem(
                forTypeIdentifier: type.identifier,
                options: nil
            ) { value, _ in
                if let string = value as? String {
                    continuation.resume(returning: string)
                } else if let url = value as? URL {
                    continuation.resume(returning: url.absoluteString)
                } else if let data = value as? Data,
                          let string = String(data: data, encoding: .utf8) {
                    continuation.resume(returning: string)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func open(_ text: String) {
        var components = URLComponents()
        components.scheme = Self.scheme
        components.host = "share"
        components.queryItems = [URLQueryItem(name: "text", value: text)]
        guard let url = components.url else { return }

        // An extension cannot call UIApplication.shared.open, so walk the
        // responder chain to the hosting application. This is the documented
        // shape of the workaround and it is stable across iOS versions.
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = current.next
        }
    }

    private func finish() {
        extensionContext?.completeRequest(
            returningItems: [],
            completionHandler: nil
        )
    }
}
```

### 6. Build and verify

1. Select the **App** scheme and a real device or simulator, then **Product ->
   Run**. The extension is embedded in the app, so building the app builds it.
2. Open Safari, tap Share, and confirm **Alpha Workspace** is in the row of app
   icons (you may have to scroll right and use **More** to enable it once).
3. Tap it. The app should come forward with quick-add open and the page title
   and URL in the field.

## After any `npx cap sync ios`

`cap sync` updates the app target's plugins and copies web assets. It does not
remove targets, so the extension survives. If you ever regenerate the iOS
project from scratch (`rm -rf ios && npx cap add ios`), this document has to be
replayed.

## Checklist for the reviewer

- [ ] Extension appears in the share sheet from Safari, Mail and WhatsApp
- [ ] Sharing a link opens quick-add with the title and URL
- [ ] Sharing selected text opens quick-add with that text
- [ ] Sharing with the app already open does not create a second instance
- [ ] Cancelling the share sheet leaves the app untouched
