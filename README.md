# BS-DGLab:Beat Saber 扣血 → DG-LAB 郊狼

在 Beat Saber 裡扣血,郊狼 3.0 的輸出強度就跟著上升;回血則下降。由一個遊戲 mod 加一個 PC 程式組成:

```
 Beat Saber 1.40.8 ── BSDglab mod ──(本機 TCP 9977)──▶ PC 程式 ──(內建中轉,埠 9999)──▶ 手機 DG-LAB App ──▶ 郊狼 3.0
   讀血量、算強度、                                       黑框 + QR code、安全邏輯、
   設定頁、遊戲內疊層                                      天花板、上升限速、失敗滿檔、斷線歸零
```

- **mod**(`mod/`):直接讀遊戲血量、累計扣血、換算強度,提供設定頁與遊戲內疊層。
- **PC 程式**(根目錄,Node.js):內建中轉伺服器、印 QR code 給手機掃、接收 mod 資料、套安全規則後送到郊狼。
- 遊戲崩潰或 mod 沒回應時,PC 程式會自己歸零。

> ⚠️ 請從低強度開始試,並確認自己知道緊急停止的方法(見下方「安全機制」)。本專案依 GPL-3.0 授權「按現狀」提供,不附任何保證。

## 規則

- 累計扣血 `Loss`:扣血增加、回血減少;開局 50% 血量只是基準。
- 強度 = `floor(係數 × Loss)`,預設係數 0.5 → **每累計扣 2% 血 +1 強度**。
- 一般遊玩最高輸出 = **手機 App 的強度上限 × 天花板 %**(預設 85%;上限 100 → 最高 85)。
- 過關 / 離開 / 暫停 → 歸零。失敗 → **App 上限滿檔 2 秒**,然後歸零。
- 開了 No Fail 的關卡整關不輸出(可在設定頁關閉這個行為)。
- 強度上升有速率限制(預設每秒最多 +15),下降立刻。送出的值永遠不會超過 App 回報的上限。

## 安裝

### 需要的東西

- Beat Saber **1.40.8**(PC),已用 ModAssistant / BSManager 裝好 **BSIPA**、**BeatSaberMarkupLanguage(BSML)**、**SiraUtil**
- [Node.js](https://nodejs.org/) **22 以上**
- 手機 DG-LAB App + 郊狼 3.0,手機和電腦在同一個區網

### 1. mod

到 [Releases](https://github.com/Akiraoo/BS-DGLab/releases) 下載 `BSDglab.dll`,放進 `Beat Saber\Plugins\`。
(想自己編譯見下方「開發」。)

### 2. PC 程式

下載 Release 裡的 PC 程式壓縮檔(或 clone 本 repo),解壓後雙擊 **`Start.bat`**。第一次會自動 `npm install`。
也可以在命令列執行:

```bash
npm install
npm start
```

跑起來會是一個黑框,印出自動偵測到的區網 IP 和 QR code。
用 DG-LAB App 的「SOCKET 控制」掃 QR code(不要用手機相機)。第一次執行 Windows 防火牆會跳出詢問,**要允許(私人網路)**,手機才連得到。

### 3. 進遊戲

設定 → Mod 設定 → **DG-LAB**。最上面會顯示 PC 程式與手機的連線狀態,都顯示「已連線」就可以開始玩。

## 遊戲內設定頁

| 項目 | 說明 |
|---|---|
| Language | 介面語言:English / 繁體中文 / 简体中文(PC 程式黑框目前固定繁體中文) |
| 啟用 | 整個 mod 的開關 |
| A 通道 / B 通道 | 要輸出的通道 |
| 波形 | 郊狼 App 的 24 個經典波形,後面接著你導入的 `.pulse` 波形 |
| 重新載入導入的波形 | 重新讀取導入波形資料夾(見下方「導入郊狼 App 的波形」) |
| 每扣 1% 血增加的強度 | 係數,預設 0.5 |
| 回血抵銷倍率 | 1 = 回多少血就抵銷多少扣血 |
| 最高輸出(App 上限的 %) | 天花板,預設 85% |
| 上升速度上限 | 每秒最多上升幾點強度 |
| 失敗滿檔秒數 | 預設 2 秒,最長 10 秒 |
| 暫停時歸零 / 開啟 No Fail 時不輸出 | |
| 遊戲內顯示疊層 / 疊層編輯模式 / X・Y・Z・大小 | 疊層位置(見下方) |
| 緊急停止 / 恢復輸出 | |

這些值存在 `Beat Saber\UserData\BSDglab.json`。mod 連上後,通道、波形、天花板、上升速度、失敗秒數、暫停歸零會即時同步給 PC 程式,並蓋過 `config.json` 裡的同名設定。

### 疊層

只在單人關卡顯示,版面仿 DG-LAB App:每個通道一列(通道名、目前強度 / 天花板、App 上限、強度條、會動的波形與波形名稱),上方是累計扣血。

調整位置:打開「疊層編輯模式」,疊層會出現在選單裡,用控制器射線按住把手就能拖動、轉向,放開即儲存;也可以用 X / Y / Z / 大小的滑桿微調,或按「重設疊層位置」還原。

### 導入郊狼 App 的波形(.pulse)

1. 在郊狼 App(3.4.4 以上)把波形導出成 `.pulse` 檔。
2. 放進 `Beat Saber\UserData\BSDglab\Waveforms\`(mod 第一次啟動時會自動建立這個資料夾)。
3. 在設定頁按「重新載入導入的波形」(或重啟遊戲)。導入的波形會接在波形選單的官方 24 個後面,名稱就是檔名(不含 `.pulse`)。

PC 程式的黑框會印出「導入波形「名稱」:N 個影格」;檔案有問題也會印出原因。

轉換方式依社區整理的格式說明(非官方規格),以下細節是自行決定、還沒和 App 實際輸出逐格比對:小節長度不是脈衝元整數倍時,最後一個脈衝元完整播完;頻率漸變以週期(ms)線性內插;2x / 4x 速度把每根竖条縮成 50 / 25 ms,休息時間不受速度影響。一輪最長 60 秒,超過會截斷。

## 安全機制

- **緊急停止**:PC 程式黑框按 `x` 或空白鍵,或設定頁的「緊急停止」按鈕;按 `r` 解除。`q` / Ctrl+C 結束程式(會先歸零)。
- 歸零的觸發:暫停、過關、離開、mod 斷線、遊玩中超過 `mod.staleMs` 沒收到資料、緊急停止、關閉程式。歸零指令會在 0.4 秒與 1.5 秒後各補送一次。
- 手機還沒連上時不下指令;失敗滿檔期間若 mod 斷線,滿檔會被中止。

## config.json(PC 程式)

| 欄位 | 預設 | 說明 |
|---|---|---|
| `input` | `"mod"` | `"mod"` = 遊戲內 mod;`"datapuller"` = 舊做法(見文末附錄) |
| `relay.enabled` | `true` | 使用內建中轉伺服器。`false` 則改連 `dglab.serverUrl`(自己架的官方版) |
| `relay.host` | `""` | 手機要連的電腦 IP。**留空 = 自動偵測區網 IP**;填了就一律照這個走 |
| `relay.port` | `9999` | 中轉伺服器埠。若該埠已被佔用,會當作已有中轉在跑並直接連過去 |
| `mod.host` / `mod.port` | `127.0.0.1` / `9977` | 接收 mod 的位址 |
| `mod.staleMs` | `5000` | 遊玩中超過這麼久沒收到 mod 資料就歸零 |
| `mapping.playCapPercent` | `85` | 一般遊玩最高輸出(App 上限的百分比)。進遊戲後以 mod 設定頁為準 |
| `mapping.maxRisePercentPerSecond` | `15` | 每秒最多上升幾點強度。進遊戲後以 mod 設定頁為準 |
| `mapping.maxStrength` / `fallbackLimit` | `"auto"` / `40` | 強度上限:`auto` 讀 App 回報的上限;還沒讀到時用 fallbackLimit |
| `events.failStrength` / `failDurationMs` | `"max"` / `2000` | 失敗時的強度與毫秒數(`failDurationMs` 以 mod 設定頁為準) |
| `dglab.channels` | `["A"]` | 通道(進遊戲後以設定頁為準) |
| `dglab.waveform` | `"BUBBLE"` | 波形:內建名稱,或 `waveforms/` 裡自訂 JSON 波形的檔名(進遊戲後以設定頁為準) |
| `dglab.qrEncode` | `false` | QR 內的位址是否 URL 編碼。手機掃了連不上時試著改成 `true` |
| `dglab.debug` / `openQrImage` | `false` / `true` | 印出所有中轉訊息;是否自動開啟 `qr.png` |

**區網 IP 自動偵測**:`relay.host` 留空時,會挑第一張「非回送、非 169.254、非虛擬網卡(VMware / Hyper-V / WSL / Docker / VPN 等)」的網卡,優先 192.168.x.x。有多個候選時會一併印出,手機連不上就把正確的 IP 填到 `relay.host`。

### 自訂波形(JSON,進階)

除了導入 App 的 `.pulse`,也可以自己寫波形:在 `waveforms/` 放 `<名稱>.json`,把 `config.json` 的 `dglab.waveform` 設成 `<名稱>`,重啟 PC 程式。範例見 `waveforms/example-ramp.json`:

```json
{
  "name": "Ramp",
  "freq": 25,
  "frames": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, [100, 100, 0, 0], { "strength": 100, "freq": 50 }, 0, 0]
}
```

- `frames` 的每一項是 **100 ms**,播完會從頭循環;最多 300 項(30 秒)。
- 每一項可以是:一個數字(這 100 ms 的強度)、4 個數字的陣列(每 25 ms 一個強度),或 `{ "strength": …, "freq": … }`(另外指定這一格的頻率)。
- 強度是 **0~100,代表「目前通道強度的百分之幾」**,所以波形不會讓輸出超過天花板或 App 上限。
- `freq` 是脈衝頻率(Hz,1~100):數字大偏麻刺感,數字小偏敲擊感。不寫就用最上面的 `freq`(預設 22)。

注意:mod 設定頁的波形選單會蓋過 `config.json`,而 JSON 波形不會出現在選單裡;要用 JSON 波形時,進遊戲後不要再動波形選單。

## 疑難排解

- **設定頁顯示 PC 程式未連線**:確認黑框有在跑;改過 PC 程式後要重開(殘留的舊 node 行程可用 `taskkill /F /IM node.exe` 清掉)。
- **手機掃了 QR code 連不上**:確認防火牆允許了 Node.js(私人網路)、手機和電腦在同一個網段;試試切換 `dglab.qrEncode`(`true` / `false`),或把電腦 IP 填進 `relay.host`。
- **回報問題**:遊戲加 `--verbose` 啟動可看 BSIPA 主控台。`Beat Saber\UserData\BSDglab.json` 的 `DebugLog` 預設為開,會在 `Beat Saber\Logs` 記錄血量變化,回報時請附上該記錄與黑框訊息。

## 開發

### 編譯 mod

1. 安裝 .NET SDK(6 以上即可,目標是 net472)。
2. 把 `mod/BSDglab/BSDglab.csproj.user.example` 複製成 `BSDglab.csproj.user`,改成你的 Beat Saber 路徑(或設環境變數 `BeatSaberDir`)。
3. 執行:

```bash
cd mod
dotnet build BSDglab\BSDglab.csproj -c Release
```

成功後會自動複製到 `Beat Saber\Plugins\`。編譯時參照你本機 Beat Saber 的 dll,這些 dll 不隨本專案發佈。

**遊戲更新後編譯失敗,最可能要修的地方**

- `BSDglab.csproj`:參照的遊戲 dll(`Main`、`GameplayCore`、`BGLib.AppFlow`、`HMLib`、`HMUI` 等)檔名若變動要同步調整;遇到 CS0012 就照錯誤訊息補參照。
- `Game/GameplayTracker.cs`:`IGameEnergyCounter`、`IGamePause`、`ILevelEndActions` 的事件名稱與簽章。
- `Plugin.cs`:`Zenjector.Install<T>(Location.StandardPlayer)` 的 `Location` 列舉。
- `UI/SettingsController.cs`、`UI/Views/settings.bsml`:BSML 的 API 與標籤寫法。
- `manifest.json`:`dependsOn` 的版本下限。

### 測試

```bash
npm test                                   # PC 程式的單元測試
node tools/fake-mod.js --end clear         # 不開遊戲,假裝成 mod 跑一整關(或 --end fail)
sh mod/tests/build.sh                      # 用 Mono 編譯 mod 核心並跑單元測試(需要 Mono)
```

### mod ↔ PC 程式通訊(本機 TCP,一行一個 JSON)

- mod → PC:`hello`、`pulse`(`name`、`data`:導入的 .pulse 原文)、`cfg`、`state`(`start` / `pause` / `resume` / `clear` / `fail` / `quit`)、`level`(`strength`、`loss`,每 100 ms,兼心跳)、`ping`(選單中)、`estop` / `resume`。
- PC → mod:`status`(`paired`、`current`、`ceiling`、`limit`、`emergency`、各通道的 `chans` / `curA` / `ceilA` / `limA`…、波形 `wave` / `waveKey` / `shape`),每 500 ms,給設定頁與疊層顯示。

### 驗證程度

已在 1.40.8 實測:mod 編譯與載入、設定頁、PC 程式 ↔ 手機 ↔ 郊狼連線、疊層顯示、波形選單。
疊層編輯模式、語言即時切換、導入 `.pulse` 波形、No Fail / 暫停 / 過關 / 失敗的實機行為仍待更多實測。

## 附錄:DataPuller 舊模式

不裝本 mod,改從 BSDataPuller 讀血量:`config.json` 的 `input` 設成 `"datapuller"`。一般情況請用 mod 模式。

- **需求**:遊戲端裝 DataPuller(預設 `ws://127.0.0.1:2946/BSDataPuller/…`);支援 DG-LAB **V3(郊狼 3.0)** 與 **V4(DG-LAB 4 App)**。
- **行為**:跟主規則相同,差別是血量與事件來自 DataPuller,由 PC 程式自己累計。
- **不開遊戲先試**:`node tools/fake-datapuller.js --end fail`(也可用 `clear` / `quit`)。

只在此模式有用的設定:

| 項目 | 預設 | 說明 |
|---|---|---|
| `dglab.version` | `"v3"` | 郊狼 3.0 用 `v3`;DG-LAB 4 App 用 `v4` |
| `dglab.serverUrl` / `appServerUrl` | | 本程式連中轉的位址 / 手機連中轉的位址(公網請用 `wss://`) |
| `dglab.slotId` | `null` | V4 的設備插槽 |
| `mapping.scale` | `"absolute"` | `absolute` = 直接加強度數值;`limit` = 依 App 上限等比例 |
| `mapping.coefficient` / `healFactor` / `decayPerSecond` | `0.5` / `1` / `0` | 係數、回血倍率、隨時間衰減 |
| `mapping.mode` / `steps` | `"linear"` | `"steps"` 改用階梯表 `[[累計扣血≥, 強度], …]` |
| `mapping.healthScale` | `"auto"` | `PlayerHealth` 是 0~1 還是 0~100,`auto` 由第一筆讀數判斷 |
| `dataPuller.staleMs` | `8000` | 超過這麼久沒收到資料就歸零(`0` = 停用) |

DataPuller 的實際 JSON 欄位是依文件推測,請先用小強度打一首確認黑框的「累計扣血」合理。

## 授權

[GPL-3.0](LICENSE)。

- 內建中轉伺服器(`src/relay.js`)依 DG-LAB 官方 `dglab-websocket-server` 的協定行為自行重寫,沒有複製其程式碼。
- 內建波形資料來自 npm 套件 `dglab-kit`;`.pulse` 格式的對照表參考社區整理的說明。
- 本專案不包含、也不發佈 Beat Saber 或其他 mod 的 dll。
