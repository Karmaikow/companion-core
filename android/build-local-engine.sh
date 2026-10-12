#!/usr/bin/env bash
set -euo pipefail
# Required: Android NDK r27c, CMake, git. Outputs the statically linked ARM64 engine.
: "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME}"
engine_root="${1:-android/build/llama-source}"
engine_build="${2:-android/build/llama-arm64}"
engine_commit=74d4f5b041ad837153b0e90fc864b8290e01d8d5
if [ ! -d "$engine_root/.git" ]; then git clone --depth 1 --branch b5046 https://github.com/ggml-org/llama.cpp.git "$engine_root"; fi
[ "$(git -C "$engine_root" rev-parse HEAD)" = "$engine_commit" ] || { echo 'Unexpected llama.cpp revision'; exit 1; }
cmake -S "$engine_root" -B "$engine_build" \
 -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" \
 -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-26 -DCMAKE_BUILD_TYPE=Release \
 -DANDROID_STL=c++_static -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF \
 -DGGML_OPENMP=OFF -DGGML_LLAMAFILE=OFF -DLLAMA_CURL=OFF \
 -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=ON -DLLAMA_BUILD_SERVER=ON
cmake --build "$engine_build" --target llama-server -j 4
printf 'Set LLAMA_ANDROID_SERVER=%s/bin/llama-server before building the APK.\n' "$engine_build"
