package mx.coffeemap.merida

import android.os.Bundle
import com.getcapacitor.BridgeActivity

/**
 * Native Android entry point for Coffee Map.
 *
 * The product UI is shared with the web and iOS targets through Capacitor;
 * keeping the entry point in Kotlin gives us a native home for Android-only
 * integrations such as notifications, app links and location in later phases.
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }
}
