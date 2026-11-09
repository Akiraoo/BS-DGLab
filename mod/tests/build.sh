#!/bin/sh
# 用 Mono 編譯 mod 的核心(不含遊戲相關檔案)並跑單元測試;`sh build.sh live [clear|fail]` 會連到 PC 程式跑一輪
cd "$(dirname "$0")"
mcs -out:harness.exe -r:System.Core.dll ../BSDglab/Core/*.cs Harness.cs || exit 1
mono harness.exe "$@"
