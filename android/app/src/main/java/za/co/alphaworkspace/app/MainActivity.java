package za.co.alphaworkspace.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered BEFORE super.onCreate, which is what builds the bridge.
        // BridgeActivity.load() replays the launch Intent through the plugins
        // it has at that moment, so a plugin registered afterwards would miss
        // exactly the case it exists for: a share that cold-starts the app.
        registerPlugin(AlphaSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
