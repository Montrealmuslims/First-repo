package com.example.guardian.child

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class ApiException(val status: Int, message: String) : IOException(message)

/** Minimal client for the two device endpoints this app uses. Call off the main thread. */
object Api {
    data class Paired(val deviceToken: String, val displayName: String)

    fun normalizeBaseUrl(url: String): String = url.trim().trimEnd('/')

    fun pair(baseUrl: String, code: String, model: String, appVersion: String): Paired {
        val body = JSONObject()
            .put("code", code)
            .put("platform", "android")
            .put("model", model.take(100))
            .put("appVersion", appVersion)
        val json = request("POST", "$baseUrl/v1/device/pair", null, body)
        return Paired(json.getString("deviceToken"), json.getString("displayName"))
    }

    /** Reports whether we can lock the screen; returns { displayName, scopes, lock }. */
    fun heartbeat(baseUrl: String, token: String, lockCapable: Boolean, appVersion: String): JSONObject {
        val body = JSONObject().put("lockCapable", lockCapable).put("appVersion", appVersion)
        return request("POST", "$baseUrl/v1/device/heartbeat", token, body)
    }

    private fun request(method: String, url: String, token: String?, body: JSONObject?): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("accept", "application/json")
            token?.let { conn.setRequestProperty("authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("content-type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = if (text.isNotBlank()) JSONObject(text) else JSONObject()
            if (status !in 200..299) throw ApiException(status, json.optString("error", "HTTP $status"))
            return json
        } finally {
            conn.disconnect()
        }
    }
}
