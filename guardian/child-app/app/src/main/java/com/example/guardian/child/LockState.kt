package com.example.guardian.child

import org.json.JSONObject
import java.time.Instant

/**
 * What the device should enforce. [untilMillis] null while locked means
 * "until a parent unlocks".
 */
data class LockState(
    val locked: Boolean,
    val untilMillis: Long? = null,
    val message: String? = null,
) {
    companion object {
        val UNLOCKED = LockState(false)

        /** Parses the `lock` object of a heartbeat response. */
        fun fromJson(lock: JSONObject?): LockState {
            if (lock == null || !lock.optBoolean("locked", false)) return UNLOCKED
            val until = lock.optString("lockedUntil", "").takeIf { it.isNotEmpty() && it != "null" }
            val message = lock.optString("message", "").takeIf { it.isNotEmpty() && it != "null" }
            return LockState(true, until?.let { Instant.parse(it).toEpochMilli() }, message)
        }

        /**
         * The state to enforce when the server can't be reached: keep the last
         * known lock, but let a timed lock end on time even while offline.
         */
        fun effectiveOffline(cached: LockState, nowMillis: Long): LockState {
            val until = cached.untilMillis
            return if (cached.locked && until != null && until <= nowMillis) UNLOCKED else cached
        }
    }
}
