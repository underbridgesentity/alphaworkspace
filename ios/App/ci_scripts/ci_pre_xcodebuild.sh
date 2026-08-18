#!/bin/sh
# Every App Store Connect upload needs a build number higher than the last.
# Xcode Cloud numbers its builds (CI_BUILD_NUMBER); stamping it here means no
# human ever bumps a number by hand and no upload is ever rejected for reusing
# one. Marketing version (1.0) stays in the project and is bumped deliberately.
set -e
cd "$CI_PRIMARY_REPOSITORY_PATH/ios/App"
agvtool new-version -all "$CI_BUILD_NUMBER"
