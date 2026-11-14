using System;
using System.Collections.Concurrent;
using System.Collections.Generic;

namespace BSDglab.Core
{
    /// <summary>
    /// mod 的核心:吃遊戲事件(血量、暫停、結束),算出強度,透過 IAppLink 送給 PC 程式。
    /// 不依賴 Unity / Beat Saber,所以可以單獨編譯測試。需要每幀(或至少每 100ms)呼叫 Tick。
    /// </summary>
    public sealed class Engine : IDisposable
    {
        public sealed class AppStatus
        {
            public string Phase = "";
            public bool Paired;      // 手機 App 是否已連上
            public bool Emergency;
            public int Current;      // 目前實際輸出的強度
            public int Ceiling;      // 一般遊玩的強度天花板
            public int Limit;        // 手機 App 設定的強度上限
            public ChannelStatus[] Channels = new ChannelStatus[0]; // 各通道(A / B)的狀態,給疊層用
            public string Wave = "";            // 波形名稱(PC 程式給的英文名)
            public string WaveKey = "";         // 波形代號(內建波形可用來查翻譯)
            public int[] Shape = new int[0];    // 波形強度輪廓:每 100ms 一個值(0~100)
        }

        public sealed class ChannelStatus
        {
            public string Name = "A";
            public int Current, Ceiling, Limit;
        }

        const float SendInterval = 0.1f;   // 遊玩中每 100ms 送一次強度(同時是心跳)
        const float PingInterval = 1.0f;   // 選單中每秒一次
        const int FallbackLimit = 40;      // 還沒收到 App 上限時,保守估計

        readonly IEngineSettings cfg;
        readonly IAppLink link;
        readonly LossTracker tracker = new LossTracker();
        readonly ConcurrentQueue<Action> inbox = new ConcurrentQueue<Action>();
        readonly string gameVersion;
        float sendAcc, pingAcc;
        bool playing;
        bool paused;
        bool tracking;   // 音樂開始後才開始算扣血(進場時血量值可能還沒初始化)
        volatile AppStatus status;

        public Engine(IEngineSettings settings, IAppLink link, string gameVersion = "")
        {
            cfg = settings;
            this.link = link;
            this.gameVersion = gameVersion;
            link.Connected += OnLinkConnected;
            link.Disconnected += OnLinkDisconnected;
            link.Message += OnLinkMessage;
        }

        public bool Playing { get { return playing; } }
        public bool Tracking { get { return tracking; } }
        public bool LinkConnected { get { return link.IsConnected; } }
        public float Loss { get { return tracker.Loss; } }
        /// <summary>最近一次 PC 程式回報的狀態(沒連線時為 null)</summary>
        public AppStatus Status { get { return link.IsConnected ? status : null; } }

        public void Start()
        {
            link.Start();
        }

        // ---------- 遊戲事件 ----------

        public void OnLevelStart()
        {
            if (!cfg.Enabled) return;
            tracker.Reset();
            tracker.HealFactor = cfg.HealFactor;
            playing = true;
            paused = false;
            tracking = false;
            sendAcc = 0f;
            link.Send(Json.Build("t", "state", "s", "start"));
        }

        /// <summary>音樂開始後呼叫:以當下血量當基準,從這裡開始才算扣血</summary>
        public void BeginTracking(float energy01)
        {
            if (!playing) return;
            tracker.Reset();
            tracker.HealFactor = cfg.HealFactor;
            tracker.Update(energy01);
            tracking = true;
        }

        /// <summary>遊戲血量變化(0~1);還沒 BeginTracking 之前的變化一律忽略</summary>
        public void OnEnergy(float energy01)
        {
            if (!playing || !tracking) return;
            tracker.HealFactor = cfg.HealFactor;
            tracker.Update(energy01);
        }

        public void OnPause(bool isPaused)
        {
            if (!playing || paused == isPaused) return;
            paused = isPaused;
            link.Send(Json.Build("t", "state", "s", isPaused ? "pause" : "resume"));
        }

        /// <param name="kind">clear | fail | quit</param>
        public void OnLevelEnd(string kind)
        {
            if (!playing) return;
            playing = false;
            paused = false;
            tracking = false;
            link.Send(Json.Build("t", "state", "s", kind));
        }

        public void EmergencyStop()
        {
            link.Send(Json.Build("t", "estop"));
        }

        public void ResumeOutput()
        {
            link.Send(Json.Build("t", "resume"));
        }

        /// <summary>設定頁改了值之後呼叫,立刻同步給 PC 程式</summary>
        public void PushSettings()
        {
            link.Send(Json.Build(
                "t", "cfg",
                "playCapPercent", cfg.PlayCapPercent,
                "maxRisePerSecond", cfg.MaxRisePerSecond,
                "failDurationMs", (int)Math.Round(cfg.FailSeconds * 1000f),
                "zeroOnPause", cfg.ZeroOnPause,
                "waveform", cfg.Waveform ?? "",
                "channels", (cfg.ChannelA ? "A" : "") + (cfg.ChannelA && cfg.ChannelB ? "," : "") + (cfg.ChannelB ? "B" : "")));
        }

        /// <summary>把導入的波形(.pulse 原文)傳給 PC 程式解碼;連上時與重新掃描資料夾後呼叫</summary>
        public void SendPulses()
        {
            foreach (var p in PulseLibrary.Items)
                link.Send(Json.Build("t", "pulse", "name", p.Name, "data", p.Data));
        }

        // ---------- 每幀 ----------

        public void Tick(float dt)
        {
            Action a;
            while (inbox.TryDequeue(out a)) a();
            if (!cfg.Enabled) return;

            if (playing)
            {
                sendAcc += dt;
                if (sendAcc < SendInterval) return;
                sendAcc = 0f;
                tracker.ClampTo(LossCap());
                int strength = Strength();
                link.Send(Json.Build("t", "level", "strength", strength, "loss", tracker.Loss));
            }
            else
            {
                pingAcc += dt;
                if (pingAcc < PingInterval) return;
                pingAcc = 0f;
                link.Send(Json.Build("t", "ping"));
            }
        }

        int Strength()
        {
            return (int)Math.Max(0.0, Math.Min(200.0, Math.Floor(cfg.Coefficient * tracker.Loss + 1e-4)));
        }

        /// <summary>累計扣血的上限 = 天花板 ÷ 係數:超過這個量對輸出沒有意義,只會讓回血等很久</summary>
        float LossCap()
        {
            var s = status;
            int ceiling = s != null && s.Ceiling > 0
                ? s.Ceiling
                : (int)Math.Floor(cfg.PlayCapPercent / 100f * FallbackLimit + 1e-4);
            if (cfg.Coefficient <= 0f) return float.MaxValue;
            return ceiling / cfg.Coefficient;
        }

        // ---------- 連線 ----------

        void OnLinkConnected()
        {
            inbox.Enqueue(delegate
            {
                link.Send(Json.Build("t", "hello", "v", 1, "game", gameVersion, "mod", "BSDglab"));
                SendPulses();   // 先傳波形,cfg 裡選的導入波形才找得到
                PushSettings();
                if (playing)
                {
                    // 遊戲中途才連上(或重連):補送目前狀態
                    link.Send(Json.Build("t", "state", "s", "start"));
                    if (paused) link.Send(Json.Build("t", "state", "s", "pause"));
                }
            });
        }

        void OnLinkDisconnected()
        {
            inbox.Enqueue(delegate { status = null; });
        }

        void OnLinkMessage(Dictionary<string, object> m)
        {
            if (Json.Str(m, "t") != "status") return;
            var s = new AppStatus
            {
                Phase = Json.Str(m, "phase") ?? "",
                Paired = Json.Bool(m, "paired") ?? false,
                Emergency = Json.Bool(m, "emergency") ?? false,
                Current = (int)(Json.Num(m, "current") ?? 0),
                Ceiling = (int)(Json.Num(m, "ceiling") ?? 0),
                Limit = (int)(Json.Num(m, "limit") ?? 0),
                Wave = Json.Str(m, "wave") ?? "",
                WaveKey = Json.Str(m, "waveKey") ?? "",
                Shape = ParseInts(Json.Str(m, "shape")),
            };
            var names = (Json.Str(m, "chans") ?? "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            if (names.Length > 0)
            {
                s.Channels = new ChannelStatus[names.Length];
                for (int i = 0; i < names.Length; i++)
                {
                    string n = names[i].Trim();
                    s.Channels[i] = new ChannelStatus
                    {
                        Name = n,
                        Current = (int)(Json.Num(m, "cur" + n) ?? 0),
                        Ceiling = (int)(Json.Num(m, "ceil" + n) ?? 0),
                        Limit = (int)(Json.Num(m, "lim" + n) ?? 0),
                    };
                }
            }
            else
            {
                // 舊版 PC 程式沒有通道資訊:當成單一 A 通道
                s.Channels = new[] { new ChannelStatus { Name = "A", Current = s.Current, Ceiling = s.Ceiling, Limit = s.Limit } };
            }
            status = s;
        }

        static int[] ParseInts(string csv)
        {
            if (string.IsNullOrEmpty(csv)) return new int[0];
            var parts = csv.Split(',');
            var list = new List<int>(parts.Length);
            foreach (var p in parts)
            {
                int v;
                if (int.TryParse(p.Trim(), out v)) list.Add(v < 0 ? 0 : (v > 100 ? 100 : v));
            }
            return list.ToArray();
        }

        public void Dispose()
        {
            link.Connected -= OnLinkConnected;
            link.Disconnected -= OnLinkDisconnected;
            link.Message -= OnLinkMessage;
            link.Dispose();
        }
    }
}
