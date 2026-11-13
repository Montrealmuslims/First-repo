package com.example.guardian.child

import android.Manifest
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

/**
 * One screen, three states: pair → finish setup → status. Built in code to
 * keep the app small; everything the child sees explains what the app does.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private val io = Executors.newSingleThreadExecutor()
    private var pendingCode: String? = null
    private var pendingApi: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        GuardianService.createChannels(this)
        readPairingLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        readPairingLink(intent)
        render()
    }

    override fun onResume() {
        super.onResume()
        GuardianService.listener = { runOnUiThread { render() } }
        if (prefs.isPaired) GuardianService.start(this)
        render()
    }

    override fun onPause() {
        GuardianService.listener = null
        super.onPause()
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    /** guardian://pair?code=12345678&api=https://... from the parent's QR code. */
    private fun readPairingLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "guardian" || data.host != "pair") return
        pendingCode = data.getQueryParameter("code")?.filter(Char::isDigit)?.take(8)
        pendingApi = data.getQueryParameter("api")
    }

    private fun render() {
        val content = column()
        when {
            !prefs.isPaired -> renderPairing(content)
            else -> {
                renderStatus(content)
                renderSetup(content)
            }
        }
        setContentView(ScrollView(this).apply {
            layoutDirection = View.LAYOUT_DIRECTION_LOCALE
            setBackgroundColor(Color.parseColor("#F6F7F9"))
            addView(content)
        })
    }

    // ── Pairing ──

    private fun renderPairing(root: LinearLayout) {
        root.addView(title(getString(R.string.pair_title)))
        if (prefs.wasDisconnected) root.addView(card(getString(R.string.status_disconnected), emphasis = false))
        root.addView(text(getString(R.string.pair_intro)))
        val code = EditText(this).apply {
            hint = getString(R.string.pair_code_hint)
            inputType = InputType.TYPE_CLASS_NUMBER
            textSize = 24f
            gravity = Gravity.CENTER
            setText(pendingCode.orEmpty())
        }
        val server = EditText(this).apply {
            hint = getString(R.string.pair_server_hint)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            textDirection = View.TEXT_DIRECTION_LTR
            setText(pendingApi ?: prefs.apiUrl ?: BuildConfig.DEFAULT_API_URL)
        }
        val error = text("").apply { setTextColor(Color.parseColor("#C0392B")) }
        val button = button(getString(R.string.pair_button))
        button.setOnClickListener {
            val c = code.text.toString().filter(Char::isDigit)
            val base = Api.normalizeBaseUrl(server.text.toString())
            if (c.length != 8 || base.isEmpty()) {
                error.text = getString(R.string.pair_invalid_code)
                return@setOnClickListener
            }
            button.isEnabled = false
            io.execute {
                val result = runCatching { Api.pair(base, c, Build.MODEL, BuildConfig.VERSION_NAME) }
                runOnUiThread {
                    button.isEnabled = true
                    result.onSuccess {
                        prefs.apiUrl = base
                        prefs.deviceToken = it.deviceToken
                        prefs.displayName = it.displayName
                        prefs.wasDisconnected = false
                        pendingCode = null
                        GuardianService.start(this)
                        render()
                    }.onFailure {
                        error.text = if (it is ApiException && it.status == 400) getString(R.string.pair_invalid_code)
                        else getString(R.string.pair_failed, it.message ?: it.javaClass.simpleName)
                    }
                }
            }
        }
        root.addView(code)
        root.addView(server)
        root.addView(error)
        root.addView(button)
    }

    // ── Setup steps ──

    private fun notificationsAllowed(): Boolean =
        Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun renderSetup(root: LinearLayout) {
        val needNotifications = !notificationsAllowed()
        val needAdmin = prefs.lockConsented && !LockAdminReceiver.isActive(this)
        if (!needNotifications && !needAdmin) return

        root.addView(title(getString(R.string.setup_title)))
        root.addView(text(getString(R.string.setup_notifications)))
        if (needNotifications) {
            root.addView(button(getString(R.string.setup_notifications_button)).apply {
                setOnClickListener { requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1) }
            })
        } else root.addView(text(getString(R.string.setup_done)))

        if (prefs.lockConsented) {
            root.addView(text(getString(R.string.setup_admin)))
            if (needAdmin) {
                root.addView(button(getString(R.string.setup_admin_button)).apply {
                    setOnClickListener {
                        startActivity(Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, LockAdminReceiver.component(this@MainActivity))
                            .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, getString(R.string.admin_explanation)))
                    }
                })
            } else root.addView(text(getString(R.string.setup_done)))
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        render()
    }

    // ── Status (what the app does, shown to the child) ──

    private fun renderStatus(root: LinearLayout) {
        root.addView(title(getString(R.string.app_name)))
        root.addView(text(getString(R.string.status_connected, prefs.displayName ?: "")))

        val lock = prefs.lock
        root.addView(card(when {
            !prefs.lockConsented -> getString(R.string.status_no_consent)
            !lock.locked -> getString(R.string.status_unlocked)
            lock.untilMillis != null -> getString(R.string.status_locked_until, GuardianService.formatTime(lock.untilMillis))
            else -> getString(R.string.status_locked_forever)
        } + (lock.message?.takeIf { lock.locked }?.let { "\n«$it»" } ?: ""), emphasis = lock.locked))

        root.addView(title(getString(R.string.status_what_title), small = true))
        root.addView(text(getString(R.string.status_what_lock)))
        root.addView(text(getString(R.string.status_what_not)))
        root.addView(text(getString(R.string.status_emergency)))

        val last = prefs.lastCheckMillis
        if (last > 0) {
            root.addView(text(getString(R.string.status_last_check, GuardianService.formatTime(last)), muted = true))
            if (!prefs.lastCheckOk) root.addView(text(getString(R.string.status_offline), muted = true))
        }
    }

    // ── Tiny view helpers ──

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun column() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(32), dp(20), dp(32))
    }

    private fun <T : View> spaced(view: T): T = view.apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(12) }
    }

    private fun title(s: String, small: Boolean = false) = spaced(TextView(this).apply {
        text = s
        textSize = if (small) 18f else 24f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Color.parseColor("#1B2430"))
    })

    private fun text(s: String, muted: Boolean = false) = spaced(TextView(this).apply {
        text = s
        textSize = if (muted) 14f else 16f
        setTextColor(Color.parseColor(if (muted) "#5B6676" else "#1B2430"))
        setLineSpacing(0f, 1.2f)
    })

    private fun card(s: String, emphasis: Boolean) = spaced(TextView(this).apply {
        text = s
        textSize = 18f
        setPadding(dp(16), dp(16), dp(16), dp(16))
        setTextColor(if (emphasis) Color.WHITE else Color.parseColor("#1B2430"))
        setBackgroundColor(Color.parseColor(if (emphasis) "#C0392B" else "#FFFFFF"))
    })

    private fun button(s: String) = spaced(Button(this).apply { text = s })
}
