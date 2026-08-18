#!/bin/sh
# Xcode Cloud: runs after clone, BEFORE Xcode resolves Swift packages.
#
# That ordering is the whole reason this file exists. The iOS project's SPM
# packages point INTO node_modules (ios/App/CapApp-SPM/Package.swift references
# ../../../node_modules/@capacitor/*), so package resolution fails on a bare
# clone. Apple's runners ship no Node, so install it, install the JS deps, and
# run the Capacitor sync that copies capacitor.config into the iOS project.
#
# Scripts must live in a ci_scripts directory NEXT TO the .xcodeproj, be named
# exactly ci_post_clone.sh / ci_pre_xcodebuild.sh, and be executable, or Xcode
# Cloud silently skips them and the build fails at package resolution with a
# misleading error about missing packages.
set -e
set -x

# Homebrew is preinstalled on Xcode Cloud runners.
brew install node@22
brew link --overwrite node@22

cd "$CI_PRIMARY_REPOSITORY_PATH"
node --version
npm ci --no-audit --no-fund

# sync, not copy: sync also regenerates the SPM package list from the installed
# Capacitor plugins, which is exactly what package resolution is about to read.
npx cap sync ios
