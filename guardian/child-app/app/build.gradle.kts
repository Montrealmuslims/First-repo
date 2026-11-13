plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.guardian.child"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.guardian.child"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        debug {
            // Android emulator → the API running on the development machine.
            buildConfigField("String", "DEFAULT_API_URL", "\"http://10.0.2.2:3000\"")
        }
        release {
            buildConfigField("String", "DEFAULT_API_URL", "\"https://api.example.com\"")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    // Framework only: no AndroidX, so the app stays small and simple.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814") // real org.json for JVM unit tests
}

// Lets ApiIntegrationTest reach a live API when these are set (otherwise it is skipped).
tasks.withType<Test>().configureEach {
    listOf("GUARDIAN_API_URL", "GUARDIAN_PAIRING_CODE", "GUARDIAN_PARENT_TOKEN", "GUARDIAN_CHILD_ID")
        .forEach { key -> System.getenv(key)?.let { environment(key, it) } }
}
