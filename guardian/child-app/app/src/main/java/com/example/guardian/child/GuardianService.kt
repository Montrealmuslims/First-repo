package com.example.guardian.child

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.text.DateFormat
import java.util.Date

/**
 * Keeps the parent's lock in sync and enforces it.
 *
 * - Asks the server every 30 s while the screen is on, every 5 min while off,
 *   and immediately when the screen turns on or the phone is unlocked.
 * - While locked: shows a notification on the lock screen saying who locked
 *   the phone and until when, and re-locks the screen whenever it is unlocked.
 *   Emergency calls stay available from the lock screen (Android guarantees it).
 * - Runs as a visible foreground service: its notification is always shown.
 */
class GuardianService : Service() {
    private lateinit var prefs: Prefs
    private lateinit var worker: Handler
    private val main = Handler(Looper.getMainLooper())

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_USER_PRESENT && prefs.lock.locked) {
                // The child unlocked the phone during a lock: lock it again
                // right away, then confirm with the server.
                enforce(LockState.effectiveOffline(prefs.lock, System.currentTimeMillis()))
            }
            scheduleCheck(0)
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        createChannels(this)
        val notification = statusNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID_STATUS, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID_STATUS, notification)
        }
        worker = Handler(HandlerThread("guardian-sync").apply { start() }.looper)
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, filter, RECEIVER_NOT_EXPORTED)
        else registerReceiver(screenReceiver, filter)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!prefs.isPaired) {
            stopSelf()
            return START_NOT_STICKY
        }
        scheduleCheck(0)
        return START_STICKY
    }

    override fun onDestroy() {
        unregisterReceiver(screenReceiver)
        worker.looper.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun scheduleCheck(delayMillis: Long) {
        worker.removeCallbacksAndMessages(null)
        worker.postDelayed(::check, delayMillis)
    }

    /** Runs on the worker thread. */
    private fun check() {
        val base = prefs.apiUrl
        val token = prefs.deviceToken
        if (base == null || token == null) {
            main.post { stopSelf() }
            return
        }
        val now = System.currentTimeMillis()
        val state = try {
            val json = Api.heartbeat(base, token, LockAdminReceiver.isActive(this), BuildConfig.VERSION_NAME)
            val scopes = json.optJSONArray("scopes")
            prefs.lockConsented = (0 until (scopes?.length() ?: 0)).any { scopes!!.getString(it) == "device_lock" }
            prefs.displayName = json.optString("displayName", prefs.displayName ?: "")
            prefs.lastCheckOk = true
            LockState.fromJson(json.optJSONObject("lock"))
        } catch (e: ApiException) {
            if (e.status == 401) {
                // The parent removed this device: stop everything and forget the token.
                prefs.unpair()
                main.post {
                    getSystemService(NotificationManager::class.java).cancel(ID_LOCK)
                    notifyListener()
                    stopSelf()
                }
                return
            }
            prefs.lastCheckOk = false
            LockState.effectiveOffline(prefs.lock, now)
        } catch (e: Exception) {
            prefs.lastCheckOk = false
            LockState.effectiveOffline(prefs.lock, now)
        }
        prefs.lastCheckMillis = now
        prefs.lock = state
        main.post {
            enforce(state)
            notifyListener()
        }

        val interactive = getSystemService(PowerManager::class.java).isInteractive
        var delay = if (interactive) 30_000L else 5 * 60_000L
        // Re-check exactly when a timed lock ends.
        state.untilMillis?.let { until -> delay = minOf(delay, maxOf(1_000L, until - now)) }
        scheduleCheck(delay)
    }

    /** Main thread. */
    private fun enforce(state: LockState) {
        val nm = getSystemService(NotificationManager::class.java)
        if (!state.locked) {
            nm.cancel(ID_LOCK)
            return
        }
        nm.notify(ID_LOCK, lockNotification(state))
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (!keyguard.isKeyguardLocked) LockAdminReceiver.lockNow(this)
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
    )

    private fun statusNotification(): Notification =
        Notification.Builder(this, CHANNEL_STATUS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notif_active))
            .setContentIntent(openAppIntent())
            .setOngoing(true)
            .build()

    private fun lockNotification(state: LockState): Notification {
        val until = state.untilMillis?.let { getString(R.string.notif_locked_until, formatTime(it)) }
            ?: getString(R.string.notif_locked_forever)
        val text = listOfNotNull(until, state.message).joinToString(" · ")
        return Notification.Builder(this, CHANNEL_LOCK)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.notif_locked_title))
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setVisibility(Notification.VISIBILITY_PUBLIC) // readable on the lock screen
            .setCategory(Notification.CATEGORY_STATUS)
            .setContentIntent(openAppIntent())
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL_STATUS = "status"
        private const val CHANNEL_LOCK = "lock"
        private const val ID_STATUS = 1
        private const val ID_LOCK = 2

        /** Set by MainActivity while visible, to refresh its screen. */
        @Volatile var listener: (() -> Unit)? = null
        private fun notifyListener() = listener?.invoke()

        fun start(context: Context) {
            context.startForegroundService(Intent(context, GuardianService::class.java))
        }

        fun syncNow(context: Context) {
            if (Prefs(context).isPaired) start(context)
        }

        fun formatTime(millis: Long): String {
            val sameDay = DateFormat.getDateInstance().format(Date(millis)) == DateFormat.getDateInstance().format(Date())
            val fmt = if (sameDay) DateFormat.getTimeInstance(DateFormat.SHORT)
            else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
            return fmt.format(Date(millis))
        }

        fun createChannels(context: Context) {
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_STATUS, context.getString(R.string.channel_status), NotificationManager.IMPORTANCE_LOW),
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_LOCK, context.getString(R.string.channel_lock), NotificationManager.IMPORTANCE_HIGH).apply {
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                },
            )
        }
    }
}
