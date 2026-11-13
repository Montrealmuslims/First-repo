package com.example.guardian.child

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LockStateTest {
    @Test fun unlockedWhenMissingOrFalse() {
        assertEquals(LockState.UNLOCKED, LockState.fromJson(null))
        assertEquals(LockState.UNLOCKED, LockState.fromJson(JSONObject("""{"locked":false,"lockedUntil":null}""")))
    }

    @Test fun timedLockParsesEndTimeAndMessage() {
        val s = LockState.fromJson(JSONObject("""{"locked":true,"lockedUntil":"2026-11-13T20:00:00.000Z","message":"وقت المذاكرة"}"""))
        assertTrue(s.locked)
        assertEquals(1_794_600_000_000L, s.untilMillis)
        assertEquals("وقت المذاكرة", s.message)
    }

    @Test fun untilUnlockedHasNoEndTime() {
        val s = LockState.fromJson(JSONObject("""{"locked":true,"lockedUntil":null,"message":null}"""))
        assertTrue(s.locked)
        assertNull(s.untilMillis)
        assertNull(s.message)
    }

    @Test fun offlineTimedLockEndsOnTime() {
        val s = LockState(true, untilMillis = 1_000)
        assertTrue(LockState.effectiveOffline(s, nowMillis = 999).locked)
        assertFalse(LockState.effectiveOffline(s, nowMillis = 1_000).locked)
    }

    @Test fun offlineIndefiniteLockStaysLocked() {
        assertTrue(LockState.effectiveOffline(LockState(true, null), nowMillis = Long.MAX_VALUE).locked)
    }

    @Test fun baseUrlIsNormalized() {
        assertEquals("https://api.example.com", Api.normalizeBaseUrl("  https://api.example.com/ "))
    }
}
