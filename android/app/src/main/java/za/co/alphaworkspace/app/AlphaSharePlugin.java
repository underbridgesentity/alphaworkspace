package za.co.alphaworkspace.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives text shared INTO the app from Android's share sheet.
 *
 * WHY THIS EXISTS AT ALL: Capacitor's bridge forwards an incoming Intent to
 * plugins, but its own appUrlOpen event only fires when the Intent carries a
 * URI. ACTION_SEND carries its payload in EXTRA_TEXT with a null data URI, so
 * a manifest intent-filter alone delivers the Intent to the Activity and then
 * nothing at all reaches the web layer. This plugin is the missing 30 lines.
 *
 * TWO WAYS OUT, on purpose:
 *
 *   consumePendingShare()  a PULL, for a cold start. The Intent is handled
 *                          inside BridgeActivity.load(), long before any React
 *                          code exists, so a pushed event would be shouted
 *                          into an empty room. The web layer asks on mount.
 *
 *   "shareReceived" event  a PUSH, for a share arriving while the app is
 *                          already open (launchMode is singleTask, so that
 *                          arrives through onNewIntent rather than a new
 *                          Activity).
 *
 * They cannot double-fire: consuming clears the buffer, and the event is only
 * emitted once a web listener could exist.
 *
 * The text is passed through verbatim. It is untrusted input and the web layer
 * is where it gets normalised (normalizeSharedText) before a human confirms
 * it; sanitising in two places would only make them disagree.
 */
@CapacitorPlugin(name = "AlphaShare")
public class AlphaSharePlugin extends Plugin {

    /**
     * Text from an Intent that arrived before the web layer could ask for it.
     * Static because Android may destroy and recreate the Activity (and with
     * it the plugin instance) between receiving the Intent and the WebView
     * finishing its load, which would otherwise drop the share silently.
     */
    private static String pendingText = null;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String text = extractSharedText(intent);
        if (text == null) {
            return;
        }
        pendingText = text;
        JSObject data = new JSObject();
        data.put("text", text);
        // Harmless when nothing is listening yet; the pull covers that case.
        notifyListeners("shareReceived", data);
    }

    @PluginMethod
    public void consumePendingShare(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pendingText);
        // Cleared on read so a later resume, or a webview reload, does not
        // reopen quick-add with a message the user already dealt with.
        pendingText = null;
        call.resolve(result);
    }

    /**
     * The shared plain text, or null if this Intent is not a text share.
     *
     * EXTRA_TEXT is the body. EXTRA_SUBJECT is folded in ahead of it because
     * sharing an email hands us the subject there and the body in EXTRA_TEXT,
     * and the subject is usually the half that reads like a task.
     */
    private static String extractSharedText(Intent intent) {
        if (intent == null) {
            return null;
        }
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action)) {
            return null;
        }
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) {
            return null;
        }

        CharSequence body = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);

        StringBuilder combined = new StringBuilder();
        if (subject != null && subject.length() > 0) {
            combined.append(subject);
        }
        if (body != null && body.length() > 0) {
            if (combined.length() > 0) {
                combined.append(" ");
            }
            combined.append(body);
        }

        String text = combined.toString().trim();
        return text.isEmpty() ? null : text;
    }
}
