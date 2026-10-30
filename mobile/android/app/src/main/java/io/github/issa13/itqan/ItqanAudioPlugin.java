package io.github.issa13.itqan;

import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Keeps the recitation playing when the person leaves the app or locks the
 * phone. Android freezes apps in the background after a few seconds —
 * unless they show a "playing" notification (a foreground service), which
 * is exactly what music / podcast apps do. See ItqanAudioService.java.
 *
 * Called from mobile/native/native-app.js:
 *   Capacitor.Plugins.ItqanAudio.update({ playing: true, title: "…", text: "…" })
 *   Capacitor.Plugins.ItqanAudio.stop()
 * and it sends back { action: "toggle" | "stop" } as the "action" event when
 * the notification's buttons are pressed.
 */
@CapacitorPlugin(name = "ItqanAudio")
public class ItqanAudioPlugin extends Plugin {

    private static ItqanAudioPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Notification button pressed → tell the page (see ItqanAudioService). */
    static void emitAction(String action) {
        ItqanAudioPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("action", data, true);
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "إتقان");
        String text = call.getString("text", "");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", true));

        ItqanAudioService running = ItqanAudioService.current();
        if (running != null) {
            // Already showing — just refresh it. (Starting the service again
            // from the background isn't allowed on Android 12+.)
            getActivity().runOnUiThread(() -> running.show(title, text, playing));
            call.resolve();
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, ItqanAudioService.class);
        intent.setAction(ItqanAudioService.ACTION_SHOW);
        intent.putExtra(ItqanAudioService.EXTRA_TITLE, title);
        intent.putExtra(ItqanAudioService.EXTRA_TEXT, text);
        intent.putExtra(ItqanAudioService.EXTRA_PLAYING, playing);
        try {
            ContextCompat.startForegroundService(context, intent);
            call.resolve();
        } catch (Exception e) {
            // e.g. the app is already in the background (Android 12+): the
            // recitation still plays while the app is open, just not after.
            call.reject("could not start the playback service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        ItqanAudioService running = ItqanAudioService.current();
        if (running != null) {
            getActivity().runOnUiThread(running::stopNow);
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        // The page (and its audio) is gone — don't leave a dead notification.
        ItqanAudioService running = ItqanAudioService.current();
        if (running != null) running.stopNow();
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }
}
