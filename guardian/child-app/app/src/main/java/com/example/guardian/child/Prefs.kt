package com.example.guardian.child

import android.content.Context
import android.content.SharedPreferences

/** App-private storage (sandboxed per app; not readable by other apps). */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("guardian", Context.MODE_PRIVATE)

    var apiUrl: String?
        get() = sp.getString("api_url", null)
        set(v) = sp.edit().putString("api_url", v).apply()

    var deviceToken: String?
        get() = sp.getString("device_token", null)
        set(v) = sp.edit().putString("device_token", v).apply()

    var displayName: String?
        get() = sp.getString("display_name", null)
        set(v) = sp.edit().putString("display_name", v).apply()

    /** Whether the parent's consent covers locking (scope device_lock). */
    var lockConsented: Boolean
        get() = sp.getBoolean("lock_consented", false)
        set(v) = sp.edit().putBoolean("lock_consented", v).apply()

    var lastCheckMillis: Long
        get() = sp.getLong("last_check", 0)
        set(v) = sp.edit().putLong("last_check", v).apply()

    var lastCheckOk: Boolean
        get() = sp.getBoolean("last_check_ok", false)
        set(v) = sp.edit().putBoolean("last_check_ok", v).apply()

    var lock: LockState
        get() = LockState(
            locked = sp.getBoolean("lock_locked", false),
            untilMillis = sp.getLong("lock_until", -1).takeIf { it >= 0 },
            message = sp.getString("lock_message", null),
        )
        set(v) = sp.edit()
            .putBoolean("lock_locked", v.locked)
            .putLong("lock_until", v.untilMillis ?: -1)
            .putString("lock_message", v.message)
            .apply()

    val isPaired: Boolean get() = deviceToken != null && apiUrl != null

    /** Set when the parent removed this device, so the child is told why. */
    var wasDisconnected: Boolean
        get() = sp.getBoolean("was_disconnected", false)
        set(v) = sp.edit().putBoolean("was_disconnected", v).apply()

    fun unpair() {
        sp.edit().clear().putBoolean("was_disconnected", true).apply()
    }
}
