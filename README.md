# bs-dglab:Beat Saber 扣血 → DG-LAB 郊狼(mod + PC 程式)

```
 Beat Saber 1.40.8 ── BSDglab mod ──(本機 TCP 9977)──▶ PC 程式 ──(內建 V3 中轉,埠 9999)──▶ 手機 DG-LAB App ──▶ 郊狼 3.0
   讀血量、算強度、                                       黑框 + QR code、安全邏輯、
   設定頁、遊戲內疊層                                      天花板、上升限速、失敗滿檔、斷線歸零
```

- **mod**(`mod/`)負責遊戲端:直接讀遊戲血量、累計扣血、換算強度、設定頁、遊戲內疊層。
- **PC 程式**(本資料夾,`npm start`)負責裝置端:內建中轉伺服器、印 QR code、接收 mod 資料、套安全規則後送到郊狼。
- 遊戲崩潰或 mod 沒回應時,PC 程式會自己歸零(mod 連線中斷立刻歸零;遊玩中超過 `mod.staleMs` 沒資料也歸零)。

## 規則

- 累計扣血 `Loss`:扣血增加、回血減少(對稱);開局 50% 只是基準。
- 強度 = `floor(係數 × Loss)`,預設係數 0.5 → **每累計扣 2% 血 +1 強度**,回血反之。
- 一般遊玩最高輸出 = **手機 App 強度上限 × 天花板%**(預設 85%;上限 100 → 最高 85)。
- 過關 / 離開 → 輸出歸零。失敗 → **App 上限(滿檔)持續 2 秒**,然後歸零。暫停 → 歸零。
- 強度上升有速率限制(預設每秒最多 +15),下降立刻。送出的值永遠不會超過 App 回報的上限。

## 安裝與使用

### 1. PC 程式

```bash
npm install
npm start
```

跑起來會是一個黑框:印出自動偵測到的區網 IP、QR code,等手機掃碼、等遊戲連進來。
用 DG-LAB App 的「SOCKET 控制」掃 QR code(不要用手機相機)。第一次執行 Windows 防火牆會跳出詢問,**要允許(私人網路)**,手機才連得到。

快捷鍵:`x` / 空白鍵 = 緊急停止,`r` = 解除,`q` / Ctrl+C = 結束(先歸零)。

### 2. mod(需要自己編譯,詳見下方「mod 編譯與疑難排解」)

前置:Beat Saber 1.40.8 已裝 BSIPA、BeatSaberMarkupLanguage(`BSML.dll`)、SiraUtil。
開了 No Fail 的關卡不會輸出(可在設定頁關閉這個行為)。編譯後把 `BSDglab.dll` 放進 `Beat Saber\Plugins\`。遊戲內:設定 → Mod 設定 → DG-LAB。

### 不開遊戲先測 PC 程式

```bash
node tools/fake-mod.js --end clear      # 或 --end fail(測失敗滿檔)
```

## config.json

| 欄位 | 預設 | 說明 |
|---|---|---|
| `input` | `"mod"` | `"mod"` = 遊戲內 mod;`"datapuller"` = 舊做法(見文末「附錄:DataPuller 舊模式」) |
| `relay.enabled` | `true` | 使用內建中轉伺服器。`false` 則改連 `dglab.serverUrl`(自己架的官方版) |
| `relay.host` | `""` | 手機要連的電腦 IP。**留空 = 自動偵測區網 IP**;填了就一律照這個走 |
| `relay.port` | `9999` | 中轉伺服器埠。若該埠已被佔用,會當作已有中轉在跑並直接連過去 |
| `mod.host` / `mod.port` | `127.0.0.1` / `9977` | 接收 mod 的位址 |
| `mod.staleMs` | `5000` | 遊玩中超過這麼久沒收到 mod 資料就歸零 |
| `mapping.playCapPercent` | `85` | 一般遊玩最高輸出(App 上限的百分比)。**進遊戲後以 mod 設定頁為準** |
| `mapping.maxRisePercentPerSecond` | `15` | 每秒最多上升幾點強度。同上,以 mod 設定頁為準 |
| `mapping.maxStrength` / `fallbackLimit` | `"auto"` / `40` | 強度上限:`auto` 讀 App 回報的上限;還沒讀到時用 fallbackLimit |
| `events.failStrength` / `failDurationMs` | `"max"` / `2000` | 失敗時的強度與秒數(`failDurationMs` 以 mod 設定頁為準,最長 10 秒) |
| `dglab.*` | | 協定版本、通道、波形、QR 格式(`qrEncode`)等 |

mod 連上後會把設定頁的值(天花板、上升速度、失敗秒數、暫停歸零)同步給 PC 程式,所以這幾項在遊戲內調整即時生效。
係數、回血倍率只存在 mod(`Beat Saber\UserData\BSDglab.json`)。

### 區網 IP 自動偵測

留空時會挑第一張「非回送、非 169.254、非虛擬網卡(VMware / Hyper-V / WSL / Docker / VPN 等)」的網卡,優先 192.168.x.x。
有多個候選時會把其他候選一併印出,手機連不上就把正確的填到 `relay.host`。

## mod ↔ PC 程式通訊(本機 TCP,一行一個 JSON)

mod → PC:`hello`、`cfg`、`state`(`start` / `pause` / `resume` / `clear` / `fail` / `quit`)、`level`(`strength`、`loss`,每 100 ms 一次,兼心跳)、`ping`(選單中)、`estop` / `resume`。
PC → mod:`status`(`paired`、`current`、`ceiling`、`limit`、`emergency`…),給疊層顯示。

## 安全機制

零輸出的觸發:暫停、過關、離開、mod 斷線、mod 沒資料、緊急停止、關閉程式;歸零指令會在 0.4 秒與 1.5 秒後各補送一次。
失敗滿檔期間若 mod 斷線,滿檔會被中止(寧可提早結束)。

## mod 編譯與疑難排解

### 目前驗證程度

| 部分 | 驗證程度 |
|---|---|
| `mod/BSDglab/Core/`(累計扣血、強度換算、JSON、TCP 連線、引擎) | 用 Mono 編譯並跑過單元測試,也實際連到 PC 程式跑過整關(`mod/tests/build.sh`) |
| `Plugin.cs`、`Game/`、`UI/`、`Configuration/` | 已在 1.40.8 編譯、載入,設定頁可用。遊戲事件(血量、暫停、過關、失敗)與 No Fail 偵測的實機行為仍待更多實測 |

### 編譯

1. 安裝 .NET SDK(6 以上即可,目標是 net472)。
2. 把 `mod/BSDglab/BSDglab.csproj.user.example` 複製成 `BSDglab.csproj.user`,改成你的 Beat Saber 路徑(或設環境變數 `BeatSaberDir`)。
3. `cd mod` 後執行 `dotnet build BSDglab\BSDglab.csproj -c Release`。成功後會自動複製到 `Plugins\`。
4. 遊戲加 `--verbose` 啟動可看 BSIPA 主控台;`Beat Saber\UserData\BSDglab.json` 的 `DebugLog` 預設為開,會在 `Beat Saber\Logs` 記錄血量變化,回報問題時請附上。

### 遊戲更新後編譯失敗,最可能要修的地方

- `BSDglab.csproj`:參照 `Main`、`GameplayCore`、`BGLib.AppFlow`、`HMLib` 等 dll,檔名若變動要同步調整。
- `Game/GameplayTracker.cs`:`IGameEnergyCounter.gameEnergyDidChangeEvent / energy`、`IGamePause.didPauseEvent / didResumeEvent`、`ILevelEndActions.levelFinishedEvent / levelFailedEvent` 的名稱與簽章。
- `Plugin.cs`:`Zenjector.Install<T>(Location.StandardPlayer)` 的 `Location` 列舉名稱。
- `UI/SettingsController.cs`:`BSMLSettings.Instance`(舊版 BSML 是小寫 `instance`)、`RemoveSettingsMenu`。
- `UI/Views/settings.bsml`:`<settings-container>` 與 slider 的屬性寫法。
- `manifest.json`:`dependsOn` 的版本下限,請依你實際裝的 BSML / SiraUtil 版本調整。
- `UI/Hud.cs`:疊層用遊戲字型 `Teko-Medium SDF`;**這個字型沒有中文**,所以 mod 內所有文字都是英文。

### 遊戲內

設定 → Mod 設定 → DG-LAB:可即時調整係數、回血倍率、天花板%、上升速度、失敗滿檔秒數、暫停歸零、No Fail 不輸出、疊層位置,並有緊急停止按鈕。疊層只在單人關卡顯示(強度 / 天花板、App 上限、累計扣血)。

## 測試

```bash
npm test                     # Node 端 38 個單元測試
sh mod/tests/build.sh        # 用 Mono 編譯 mod 的核心並跑單元測試
```

## 相依與參照

- **PC 程式**:Node.js 22+;npm 套件見 `package.json`。中轉伺服器是自行重寫的,沒有使用 DG-LAB 官方函式庫。
- **mod**:編譯時參照你本機 Beat Saber 的 dll(`Main`、`HMLib`、`HMUI`、`GameplayCore`、`BGLib.AppFlow`、Unity、Zenject),以及 mod 框架 BSIPA(`IPA.Loader`)、BSML(`BSML.dll`)、SiraUtil。這些都**不隨本專案發佈**,只在編譯時讀取。

## 附錄:DataPuller 舊模式

不裝 mod,改從 BSDataPuller 讀血量。`config.json` 的 `input` 設成 `"datapuller"` 即可;一般情況請用 mod 模式。

**需求**:Node.js 22 以上;遊戲端裝 DataPuller mod(預設輸出在 `ws://127.0.0.1:2946/BSDataPuller/…`);一個 DG-LAB 中繼伺服器(自己架 [dglab-websocket-server](https://github.com/dungeonlab-open/dglab-websocket-server) 或用內建中轉,`relay.enabled`)。支援 DG-LAB **V3(郊狼 3.0)** 與 **V4(DG-LAB 4 App)**。

**行為**:跟主規則相同(扣血上升、回血下降、過關歸零、失敗滿檔 2 秒、暫停歸零),差別是血量與事件來自 DataPuller,由 PC 程式自己累計。

**不開遊戲先試**:`node tools/fake-datapuller.js --end fail`(也可用 `clear` / `quit`)。它在 2946 埠假裝成 DataPuller,依序模擬:開局 50% → 回血 → 壞切 → 漏掉 → 回血 → 暫停/繼續 → 結束。

**只在此模式有用的設定**

| 項目 | 預設 | 說明 |
|---|---|---|
| `dglab.version` | `"v3"` | 郊狼 3.0 的 SOCKET 用 `v3`;DG-LAB 4 App 用 `v4` |
| `dglab.serverUrl` / `appServerUrl` | | 本程式連中繼的位址 / 手機 App 連中繼的位址(公網請用 `wss://`) |
| `dglab.channels` / `waveform` / `slotId` | `["A"]` / `"BUBBLE"` / `null` | 通道、內建波形、V4 的設備插槽 |
| `dglab.debug` / `qrEncode` / `openQrImage` | `false` / `true` / `true` | 診斷:印出所有中繼訊息;QR 內 ws 位址是否 URL 編碼(連不上可改 `false`);是否自動開 `qr.png` |
| `mapping.scale` | `"absolute"` | `absolute` = 直接加強度數值;`limit` = 依 App 上限等比例 |
| `mapping.coefficient` / `healFactor` / `decayPerSecond` | `0.5` / `1` / `0` | 係數、回血倍率、隨時間衰減 |
| `mapping.mode` / `steps` | `"linear"` | `"steps"` 改用階梯表 `[[累計扣血≥, 強度], …]` |
| `mapping.healthScale` | `"auto"` | `PlayerHealth` 是 0~1 還是 0~100,`auto` 由第一筆讀數判斷 |
| `dataPuller.staleMs` | `8000` | 超過這麼久沒收到資料就歸零(`0` = 停用) |

**為什麼開局 50% 血量不會有問題**:程式把第一筆血量當作基準,之後只看變化量:扣血累加、回血扣掉、最低 0。一路回血到 80% 後再掉到 70%,算扣了 10%(從歷史高點算起)。

**已測試 / 未測試**:自動化測試涵蓋扣血累計、回血、起始 50%、上限、階梯模式、狀態機(過關、失敗、暫停、逾時、緊急停止、斷線),以及 V3 / V4 的端到端模擬。**未實測**:DataPuller 的實際 JSON(`PlayerHealth` 刻度、`LevelFailed` 欄位型別、是否送 `MapData`)是依文件推測,程式有容錯,但請先用小強度打一首確認 log 的「累計扣血」合理;V4 的 `addIntensity` 是累加,App 端若夾住數值,程式追蹤的強度可能和實際不同(每次歸零會重新對齊)。

## 授權

見 `LICENSE`。內建的中轉伺服器(`src/relay.js`)是依 DG-LAB 官方 `dglab-websocket-server` 的協定行為自行重寫,沒有複製其程式碼。
mod 需要自行編譯,不隨附遊戲或其他 mod 的 dll;編譯時會參照你本機 Beat Saber 資料夾裡的 dll。
