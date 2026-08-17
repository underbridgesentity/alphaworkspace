#!/usr/bin/env bash
# Build the native shells. Source this or run it; it exists because the JDK and
# Android SDK on this machine are installed but not on PATH, and `java -version`
# reports "Unable to locate a Java Runtime" until JAVA_HOME is set, which reads
# like a missing dependency when nothing is actually missing.
#
# Nothing here needs installing or a password. Homebrew's openjdk@21 is already
# present; Android Studio also bundles a JBR at
#   /Applications/Android Studio.app/Contents/jbr/Contents/Home
# which works equally well if the Homebrew one is ever removed.
#
# iOS needs no CocoaPods: Capacitor 8 uses Swift Package Manager, so Xcode opens
# ios/App/App.xcodeproj directly (there is no .xcworkspace, and that is correct).
set -euo pipefail

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "$(dirname "$0")/.."

case "${1:-help}" in
  sync)
    # Copies capacitor.config.ts and plugin changes into both native projects.
    # Run after ANY change to the config or to installed Capacitor plugins.
    npx cap sync
    ;;
  android-debug)
    # Installable APK for testing on a real phone over USB. Not for the store.
    ( cd android && ./gradlew assembleDebug )
    echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  android-release)
    # The Play upload artifact. Requires the signing config to be filled in
    # (see store/README.md); an unsigned bundle will be rejected on upload.
    ( cd android && ./gradlew bundleRelease )
    echo "AAB: android/app/build/outputs/bundle/release/app-release.aab"
    ;;
  ios-open)
    # iOS archiving happens in Xcode because it needs the signing identity and
    # provisioning profile tied to the Apple Developer account, which lives in
    # Xcode's keychain and cannot be scripted meaningfully from here.
    open ios/App/App.xcodeproj
    ;;
  doctor)
    java -version
    echo "ANDROID_HOME=$ANDROID_HOME"
    ( cd android && ./gradlew --version | grep -E "^Gradle" )
    xcodebuild -version | head -1
    ;;
  *)
    echo "usage: scripts/native-build.sh {sync|android-debug|android-release|ios-open|doctor}"
    exit 1
    ;;
esac
