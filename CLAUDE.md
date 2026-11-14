# BS-DGLab 專案說明(給 Claude Code)

回覆一律用**繁體中文**(使用者有時打簡體,仍以繁體回覆)。

## 這是什麼

把 Beat Saber(PC,1.40.8)的扣血換成 DG-LAB 郊狼 3.0 的輸出強度。分兩部分:

```
Beat Saber ── BSDglab mod ──(本機 TCP 9977,一行一個 JSON)──▶ PC 程式 ──(內建 V3 中轉,埠 9999)──▶ 手機 DG-LAB App ──▶ 郊狼 3.0
```

- **mod**(`mod/BSDglab/`,C#,net472,BSIPA + BSML + SiraUtil/Zenject):讀遊戲血量、累計扣血、算強度、設定頁、遊戲內疊層。
- **PC 程式**(`src/`,Node 22+,`npm start`):cmd 黑框印 QR code、內建中轉伺服器、套安全規則後送到郊狼。
- Repo:github.com/Akiraoo/BS-DGLab。使用者的遊戲在本機,編譯與實測都由使用者在這台電腦做。

## 使用者定下的規則(不要改動行為)

- 累計扣血 `Loss`:扣血增加、回血減少(可逆);開局 50% 只是基準。
- 強度 = `floor(係數 × Loss)`,預設係數 0.5 → 每累計扣 2% 血 +1 強度。
- 一般遊玩最高輸出 = 手機 App 強度上限 × `playCapPercent`(預設 85%)。`lossCap` 已刪除,由天花板自動推算。
- 過關 / 離開 / 暫停 → 輸出 0。失敗 → App 上限滿檔 2 秒,然後 0。
- **送出的強度永遠不可超過 App 回報的上限**(超過的指令 App 會直接忽略)。
- 開了 No Fail 的關卡整關不輸出(`DisableOnNoFail`)。
- 進關卡後等 2 幀就開始追蹤血量(不等歌曲時間,否則會漏掉最前面的方塊)。
- `relay.host` 留空 = 自動偵測區網 IP;有填就一律照 config。
- mod 連上後,設定頁的值會蓋過 `config.json`:天花板、上升速度、失敗秒數、暫停歸零、通道(A/B)、波形。

## 安全機制(改 PC 程式時必須保留)

- 歸零的觸發:暫停、過關、離開、mod 斷線、遊玩中超過 `mod.staleMs` 沒資料、緊急停止、關閉程式。
- 歸零指令在 +400 ms、+1500 ms 各補送一次。
- 強度上升有速率限制(預設每秒 +15),下降立刻。
- 手機還沒連上時不下指令;失敗滿檔期間 mod 斷線會中止滿檔。
- 緊急停止:黑框按 `x` / 空白鍵,或 mod 設定頁按鈕;`r` 解除。

## 通訊協定

- mod → PC:`hello`、`pulse {name, data}`(導入的 .pulse 原文,在 `cfg` 之前送)、`cfg {playCapPercent, maxRisePerSecond, failDurationMs, zeroOnPause, waveform, channels}`、`state {s: start|pause|resume|clear|fail|quit}`、`level {strength, loss}`(遊玩中每 100 ms,兼心跳)、`ping`(選單中每秒)、`estop`、`resume`。
- PC → mod:`status {phase, paused, emergency, current, ceiling, limit, paired, loss, chans:"A,B", curA, ceilA, limA, …, wave, waveKey, shape:"0,100,…"}`(每 500 ms)。欄位刻意扁平,因為 mod 端是自寫的簡易 JSON 解析(`Core/Json.cs`)。

## 檔案地圖

PC 程式:
- `src/index.js` 進入點、鍵盤快捷鍵;`src/session.js`(`ModSession`:安全邏輯、狀態回報);`src/modlink.js`(TCP 伺服器)
- `src/dglab.js`(`DglabController`:強度、通道、波形、burst);`src/waveform.js`(內建 / 自訂波形載入與編碼、導入波形登記);`src/pulse.js`(App 導出的 `.pulse` → V3 影格,對照表來自社區文件)
- `src/relay.js`(內建 V3 中轉,**自行重寫**,沒有複製官方 GPL 程式碼);`src/netinfo.js`(區網 IP)
- `src/bridge.js`、`src/penalty.js`:舊的 DataPuller 模式(`input: "datapuller"`),仍可用
- `waveforms/*.json`:自訂波形;`tools/fake-mod.js`:不開遊戲測 PC 程式
- `config.json`:使用者正在用的設定。**只能合併修改,不可整份覆蓋**(裡面有 `qrEncode:false` 等使用者的值)

mod:
- `Core/`:`Engine.cs`(狀態、送訊息)、`PulseLibrary.cs`(讀 `UserData\BSDglab\Waveforms\*.pulse`,代號 `pulse:<檔名>`)、`LossTracker.cs`、`Json.cs`、`TcpAppLink.cs`、`IAppLink.cs`、`Waveforms.cs`(24 個經典波形的代號與三語名稱)、`L.cs`(**所有介面文字的三語對照表**)
- `Game/GameplayTracker.cs`:接遊戲的血量 / 暫停 / 結束事件
- `UI/Hud.cs`(疊層:每通道一列,強度條 + 波形直條)、`UI/HudEditor.cs`(編輯模式,用 BSML 的 `FloatingScreen` 拖動)
- `UI/SettingsController.cs` + `UI/SettingsTexts.cs`(partial,文字綁定)+ `UI/Views/settings.bsml`
- `Configuration/PluginConfig.cs`:存在 `Beat Saber\UserData\BSDglab.json`,屬性都要 `virtual`
- `BSDglab.csproj`:參照使用者本機 Beat Saber 的 dll(不隨 repo 發佈)

## 指令

```
npm test                                             # Node 測試(目前 44 個)
npm start                                            # 啟動 PC 程式
node tools/fake-mod.js --end clear                   # 或 --end fail
cd mod && dotnet build BSDglab\BSDglab.csproj -c Release   # 編譯 mod,成功會自動複製到 Plugins
```

`mod/tests/build.sh` 用 Mono 的 `mcs` 編譯 `Core/*.cs` 跑 `Harness.cs`(Windows 上沒有 Mono 就略過);`mod/tests/stubs/Stubs.cs` 是假的遊戲 / Unity / BSML 型別,只用來在沒有遊戲的環境做型別檢查,**不代表真實 API**。

## 踩過的坑

- BSML 下拉選單切語言 / 換清單:同一個 `List<object>` 換內容後,對 `DropDownListSetting` 設 `Values`、呼叫 `UpdateChoices()` 與 `ReceiveValue()`(`settings.bsml` 的波形選單 id 是 `wave-list`)。
- `.csproj.user` 在專案本體**之後**才匯入,所以 csproj 裡不能用 `BeatSaberDir` 推導其他屬性,只能在項目裡直接寫 `$(BeatSaberDir)`。
- BSML 的 dll 檔名是 `BSML.dll`(不是 `BeatSaberMarkupLanguage.dll`)。
- 用到遊戲型別時常要補參照:目前有 `Main`、`GameplayCore`、`BGLib.AppFlow`、`BeatSaber.ViewSystem`、`HMLib`、`HMUI`、`VRUI`(有才參照)等。遇到 CS0012 就照錯誤訊息補 dll。
- 遊戲的 Teko 字型沒有中文;疊層用反射取 BSML 的 `BeatSaberUI.MainTextFont` 來顯示中文。
- UI 圖片要用遊戲的 `UINoGlow` 材質,否則會過曝發光。
- 改了 PC 程式一定要重啟 `npm start`;殘留的舊 node 行程會讓新功能看起來沒生效(`taskkill /F /IM node.exe`)。
- 使用者手機 App 需要 `qrEncode:false` 的 QR 格式。
- **不要使用 BS_AnotherStatusSocket 的程式碼**(授權禁止用於生成式 AI 工具)。

## 目前狀態

已在真實遊戲驗證:mod 可編譯、載入;設定頁可用;PC 程式、手機、郊狼連線正常;疊層會顯示(A 通道、強度條、直條)。

**已寫完但還沒在遊戲內驗證**(下一步先確認這些):
1. 疊層編輯模式(`HudEditor`,`FloatingScreen` 的 API 是憑記憶寫的)能不能抓把手拖動、位置有沒有存檔。
2. 設定頁的 A / B 通道開關(波形下拉選單用 `options` 已確認可用)。
3. 語言切換:波形選單原本要重進頁面才換語言,已改成切換時即時更新(未驗證);疊層中文會不會變方塊。
4. 疊層是否正確顯示波形名稱與會動的波形(需要新版 PC 程式在跑)。
5. No Fail 不輸出、暫停 / 過關 / 失敗事件的實機行為。
6. FPFC 進譜面後「方塊還沒到強度就上升」是否已解決(`DebugLog` 會在 `Beat Saber\Logs` 記錄血量變化)。
7. 導入 .pulse 波形:放進 `UserData\BSDglab\Waveforms` → 按「重新載入導入的波形」→ 選單出現檔名 → 黑框印出影格數 → 輸出手感是否和 App 一致(轉換細節見 `src/pulse.js` 開頭註解)。

**待辦 / 使用者提過之後要做的**:
- `src/waveform.js` 的頻率換算公式(Hz → 10~240)是憑記憶寫的,只確認過數值範圍,需對照官方 V3 藍牙協定文件。
- PC 程式黑框訊息目前固定繁體中文,尚未做多語系。
- 內建波形資料來自 `dglab-kit`,沒有和 App 實際輸出逐格比對過(「连击」= `PULSATING`)。

## 工作方式

- 改完要跑 `npm test`;動到 mod 就請使用者重新 `dotnet build` 並回報錯誤或截圖。
- 沒在遊戲裡驗證過的東西要明講,不要說成已完成。
- 新增介面文字一律加進 `Core/L.cs` 三種語言,設定頁標籤另外在 `SettingsTexts.cs` 加綁定屬性、在 `settings.bsml` 用 `~t_xxx`。
- README.md 只有一份(根目錄),功能有變就同步更新。
