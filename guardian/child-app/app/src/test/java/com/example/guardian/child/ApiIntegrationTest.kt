package com.example.guardian.child

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Runs the app's real network client against a live Guardian API.
 * Skipped unless configured:
 *   GUARDIAN_API_URL=http://localhost:3000 GUARDIAN_PAIRING_CODE=12345678 \
 *   GUARDIAN_PARENT_TOKEN=... GUARDIAN_CHILD_ID=... ./gradlew testDebugUnitTest
 * (scripts/child-app-integration.sh in the backend sets all of this up.)
 */
class ApiIntegrationTest {
    private val base = System.getenv("GUARDIAN_API_URL")
    private val code = System.getenv("GUARDIAN_PAIRING_CODE")
    private val parentToken = System.getenv("GUARDIAN_PARENT_TOKEN")
    private val childId = System.getenv("GUARDIAN_CHILD_ID")

    private fun parent(method: String, path: String, body: String? = null) {
        val conn = java.net.URL("$base/v1$path").openConnection() as java.net.HttpURLConnection
        conn.requestMethod = method
        conn.setRequestProperty("authorization", "Bearer $parentToken")
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray()) }
        }
        assertEquals(200, conn.responseCode)
        conn.disconnect()
    }

    @Test fun pairHeartbeatLockUnlock() {
        assumeTrue(base != null && code != null && parentToken != null && childId != null)

        val paired = Api.pair(base!!, code!!, "JVM test", "1.0.0")
        assertEquals("سارة", paired.displayName)

        var hb = Api.heartbeat(base, paired.deviceToken, lockCapable = true, appVersion = "1.0.0")
        assertFalse(LockState.fromJson(hb.getJSONObject("lock")).locked)

        parent("PUT", "/children/$childId/lock", """{"minutes":45,"message":"وقت النوم"}""")
        hb = Api.heartbeat(base, paired.deviceToken, lockCapable = true, appVersion = "1.0.0")
        val locked = LockState.fromJson(hb.getJSONObject("lock"))
        assertTrue(locked.locked)
        assertEquals("وقت النوم", locked.message)
        val minutesLeft = (locked.untilMillis!! - System.currentTimeMillis()) / 60_000.0
        assertTrue("minutes left $minutesLeft", minutesLeft in 44.0..45.0)

        parent("PUT", "/children/$childId/lock", """{}""")
        assertNull(LockState.fromJson(Api.heartbeat(base, paired.deviceToken, true, "1.0.0").getJSONObject("lock")).untilMillis)

        parent("DELETE", "/children/$childId/lock")
        assertFalse(LockState.fromJson(Api.heartbeat(base, paired.deviceToken, true, "1.0.0").getJSONObject("lock")).locked)

        // A wrong pairing code is rejected with 400 (shown to the child as "code wrong or expired").
        val e = runCatching { Api.pair(base, "00000000", "JVM test", "1.0.0") }.exceptionOrNull()
        assertEquals(400, (e as ApiException).status)
    }
}
