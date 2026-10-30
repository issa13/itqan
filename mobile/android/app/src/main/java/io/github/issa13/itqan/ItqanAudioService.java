package io.github.issa13.itqan;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * The "🎧 playing" notification while the recitation plays (a foreground
 * service of type mediaPlayback). While it is shown Android keeps the app
 * running, so the recitation continues — from one ayah to the next — when
 * the person switches to another app or locks the phone.
 *
 * The audio itself is still played by the page (quran-reader.js); this
 * service only keeps the app alive and offers ⏯ / ⏹ buttons, which are
 * passed back to the page through ItqanAudioPlugin.
 */
public class ItqanAudioService extends Service {

    static final String ACTION_SHOW = "io.github.issa13.itqan.audio.SHOW";
    static final String ACTION_TOGGLE = "io.github.issa13.itqan.audio.TOGGLE";
    static final String ACTION_STOP = "io.github.issa13.itqan.audio.STOP";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_PLAYING = "playing";

    private static final String CHANNEL_ID = "recitation";
    private static final int NOTIFICATION_ID = 7301;
    private static final long WAKE_LOCK_TIMEOUT_MS = 4L * 60L * 60L * 1000L; // safety net: 4 hours

    private static ItqanAudioService current;
    private PowerManager.WakeLock wakeLock;

    static ItqanAudioService current() {
        return current;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        current = this;
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_TOGGLE.equals(action)) {
            ItqanAudioPlugin.emitAction("toggle");
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            ItqanAudioPlugin.emitAction("stop");
            stopNow();
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
        boolean playing = intent == null || intent.getBooleanExtra(EXTRA_PLAYING, true);
        Notification notification = buildNotification(title, text, playing);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            // Not allowed right now (e.g. started from the background) —
            // give up quietly; the recitation keeps playing while the app is open.
            stopSelf();
            return START_NOT_STICKY;
        }
        holdWakeLock(playing);
        return START_NOT_STICKY;
    }

    /** Refreshes the notification (next ayah, paused / playing). */
    void show(String title, String text, boolean playing) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(title, text, playing));
        holdWakeLock(playing);
    }

    void stopNow() {
        holdWakeLock(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Swiped away from the recent apps: the page is closing, stop too.
        ItqanAudioPlugin.emitAction("stop");
        stopNow();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        holdWakeLock(false);
        if (current == this) current = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // Keeps the processor awake while reciting with the screen off (the next
    // ayah is fetched and started by the page); released when paused.
    private void holdWakeLock(boolean hold) {
        if (hold) {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm == null) return;
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "itqan:recitation");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        } else if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "التلاوة", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("يظهر أثناء الاستماع إلى التلاوة، ليستمر التشغيل خارج التطبيق");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent serviceIntent(String action, int requestCode) {
        Intent intent = new Intent(this, ItqanAudioService.class);
        intent.setAction(action);
        return PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification(String title, String text, boolean playing) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_itqan)
            .setContentTitle(title != null && !title.isEmpty() ? title : "إتقان")
            .setContentText(text != null && !text.isEmpty() ? text : "تلاوة")
            .setContentIntent(openApp)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(0, playing ? "⏸ إيقاف مؤقت" : "▶ متابعة", serviceIntent(ACTION_TOGGLE, 1))
            .addAction(0, "⏹ إنهاء", serviceIntent(ACTION_STOP, 2))
            .build();
    }
}
