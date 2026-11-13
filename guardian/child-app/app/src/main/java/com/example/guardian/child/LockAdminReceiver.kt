package com.example.guardian.child

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Device admin with one policy, force-lock (see res/xml/device_admin.xml).
 * Turning it on or off triggers a heartbeat so the parent can see whether
 * locking is available.
 */
class LockAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) = GuardianService.syncNow(context)
    override fun onDisabled(context: Context, intent: Intent) = GuardianService.syncNow(context)

    companion object {
        fun component(context: Context) = ComponentName(context, LockAdminReceiver::class.java)

        private fun dpm(context: Context) = context.getSystemService(DevicePolicyManager::class.java)

        fun isActive(context: Context): Boolean = dpm(context).isAdminActive(component(context))

        /** Locks the screen now (same as pressing the power button). */
        fun lockNow(context: Context): Boolean {
            if (!isActive(context)) return false
            dpm(context).lockNow()
            return true
        }
    }
}
