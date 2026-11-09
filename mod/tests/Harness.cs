// 在沙盒用 Mono 編譯的測試:Core 單元測試 + (給參數時)連到真正的 PC 程式跑一輪
using System;
using System.Collections.Generic;
using System.Threading;
using BSDglab.Core;

class Settings : IEngineSettings
{
    public bool Enabled { get { return true; } }
    public string AppHost { get { return "127.0.0.1"; } }
    public int AppPort = 9977;
    int IEngineSettings.AppPort { get { return AppPort; } }
    public float Coefficient = 0.5f;
    float IEngineSettings.Coefficient { get { return Coefficient; } }
    public float HealFactor { get { return 1f; } }
    public int PlayCapPercent { get { return 85; } }
    public float MaxRisePerSecond { get { return 15f; } }
    public float FailSeconds { get { return 2f; } }
    public bool ZeroOnPause { get { return true; } }
}

class FakeLink : IAppLink
{
    public List<string> Sent = new List<string>();
    public bool IsConnected { get { return true; } }
    public event Action Connected;
    public event Action Disconnected;
    public event Action<Dictionary<string, object>> Message;
    public void Start() { }
    public bool Send(string l) { Sent.Add(l); return true; }
    public void Dispose() { }
    public void FireConnected() { Connected(); }
    public void FireMessage(string json) { Message(Json.Parse(json)); }
}

static class T
{
    static int fails;
    public static void Eq(object a, object b, string name)
    {
        bool ok = Equals(a, b);
        Console.WriteLine((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  (got " + a + ", want " + b + ")"));
        if (!ok) fails++;
    }
    public static int Fails { get { return fails; } }
}

static class Program
{
    static int Main(string[] args)
    {
        Units();
        if (args.Length > 0 && args[0] == "live") Live(args.Length > 1 ? args[1] : "clear");
        return T.Fails == 0 ? 0 : 1;
    }

    static void Units()
    {
        // Json
        var s = Json.Build("t", "level", "strength", 12, "loss", 24.5f, "ok", true, "q", "a\"b");
        T.Eq(s, "{\"t\":\"level\",\"strength\":12,\"loss\":24.5,\"ok\":true,\"q\":\"a\\\"b\"}", "Json.Build");
        var d = Json.Parse("{\"t\":\"status\",\"current\":7,\"paired\":true,\"x\":null,\"s\":\"hi\\n\",\"f\":-1.5e1}");
        T.Eq(Json.Str(d, "t"), "status", "Json.Parse 字串");
        T.Eq(Json.Num(d, "current"), (double?)7, "Json.Parse 數字");
        T.Eq(Json.Bool(d, "paired"), (bool?)true, "Json.Parse 布林");
        T.Eq(Json.Num(d, "f"), (double?)(-15), "Json.Parse 科學記號");
        T.Eq(Json.Parse("{bad"), null, "Json.Parse 壞資料回 null");
        T.Eq(Json.Parse("{\"a\":[1]}"), null, "Json.Parse 不支援陣列 → null");

        // LossTracker:起始 50% 只是基準;扣血增加、回血減少
        var t = new LossTracker();
        t.Update(0.5f);
        T.Eq(t.Loss, 0f, "起始 50% 不算扣血");
        t.Update(0.4f);
        T.Eq((int)Math.Round(t.Loss), 10, "扣 10%");
        t.Update(0.45f);
        T.Eq((int)Math.Round(t.Loss), 5, "回 5% → 累計 5");
        t.Update(0.9f);
        T.Eq(t.Loss, 0f, "回過頭不會變負");
        t.Update(0.8f);
        T.Eq((int)Math.Round(t.Loss), 10, "從新高點再扣 10%");
        t.ClampTo(6f);
        T.Eq(t.Loss, 6f, "ClampTo");
        t.Update(float.NaN);
        T.Eq(t.Loss, 6f, "NaN 被忽略");

        // Engine:每 2% 扣血 +1 強度、可逆
        var link = new FakeLink();
        var e = new Engine(new Settings(), link, "1.40.8");
        e.OnLevelStart();
        // 還沒 BeginTracking:進場時血量從 1.0 跳到 0.5 不能被當成扣血
        e.OnEnergy(1.0f); e.OnEnergy(0.5f);
        e.Tick(0.11f);
        T.Eq(e.Loss, 0f, "BeginTracking 前的血量變化被忽略");
        T.Eq(Json.Num(Json.Parse(link.Sent[link.Sent.Count - 1]), "strength"), (double?)0, "BeginTracking 前強度為 0");
        e.BeginTracking(0.5f);
        link.Sent.Clear();
        float[] hp = { 0.49f, 0.48f, 0.47f, 0.46f, 0.45f, 0.46f, 0.47f, 0.48f, 0.49f, 0.50f };
        var seen = new List<int>();
        foreach (var h in hp)
        {
            e.OnEnergy(h);
            e.Tick(0.11f);
            var m = Json.Parse(link.Sent[link.Sent.Count - 1]);
            seen.Add((int)Json.Num(m, "strength").Value);
        }
        T.Eq(string.Join(",", seen.ConvertAll(x => x.ToString()).ToArray()), "0,1,1,2,2,2,1,1,0,0", "每 2% 扣血 +1 強度,回血反之");

        // 累計上限 = 天花板 ÷ 係數(沒收到 App 狀態 → 以上限 40 估:34/0.5 = 68)
        e.OnEnergy(1f); e.OnEnergy(0f);
        e.Tick(0.11f);
        T.Eq(Json.Num(Json.Parse(link.Sent[link.Sent.Count - 1]), "strength"), (double?)34, "碰牆暴衝只到天花板 34");
        T.Eq((int)Math.Round(e.Loss), 68, "累計扣血被夾在 68");
        // 收到 App 狀態後改用真實天花板
        link.FireMessage("{\"t\":\"status\",\"phase\":\"playing\",\"paired\":true,\"current\":3,\"ceiling\":85,\"limit\":100,\"emergency\":false}");
        e.Tick(0.11f);
        T.Eq(e.Status != null ? e.Status.Ceiling : -1, 85, "收到 status");
        e.OnEnergy(1f); e.OnEnergy(0f);   // 回滿再瞬間扣光:累計 100 → 強度 50(天花板 85,不受限)
        e.Tick(0.11f);
        T.Eq(Json.Num(Json.Parse(link.Sent[link.Sent.Count - 1]), "strength"), (double?)50, "上限 100(天花板 85)時累計 100 → 強度 50");

        // 事件
        link.Sent.Clear();
        e.OnPause(true); e.OnPause(true); e.OnPause(false);
        e.OnLevelEnd("fail"); e.OnLevelEnd("clear");
        T.Eq(string.Join("|", link.Sent.ToArray()),
            "{\"t\":\"state\",\"s\":\"pause\"}|{\"t\":\"state\",\"s\":\"resume\"}|{\"t\":\"state\",\"s\":\"fail\"}", "暫停/繼續/結束事件(重複的不送)");
        link.Sent.Clear();
        e.Tick(1.1f);
        T.Eq(link.Sent[0], "{\"t\":\"ping\"}", "不在遊玩時送 ping");
        link.Sent.Clear();
        link.FireConnected();
        e.Tick(0f);
        T.Eq(link.Sent.Count, 2, "連線後送 hello + cfg");
    }

    // 連到真正的 PC 程式,模擬一關:血量 50% 起 → 連扣 → 回血 → 結束
    static void Live(string end)
    {
        var cfg = new Settings();
        var link = new TcpAppLink(() => cfg.AppHost, () => cfg.AppPort);
        var e = new Engine(cfg, link, "sim");
        e.Start();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        Action<int> run = ms =>
        {
            long until = sw.ElapsedMilliseconds + ms;
            long last = sw.ElapsedMilliseconds;
            while (sw.ElapsedMilliseconds < until)
            {
                Thread.Sleep(16);
                long now = sw.ElapsedMilliseconds;
                e.Tick((now - last) / 1000f);
                last = now;
            }
        };
        run(1200);
        Console.WriteLine("LIVE connected=" + e.LinkConnected);
        e.OnLevelStart();
        float hp = 0.5f;
        e.BeginTracking(hp);
        run(500);
        for (int i = 0; i < 28; i++) { hp -= 0.01f; e.OnEnergy(hp); run(150); }   // 一路扣 28%
        Console.WriteLine("LIVE 扣到 " + (int)(hp * 100) + "% loss=" + (int)e.Loss);
        e.OnPause(true); run(500); e.OnPause(false);
        for (int i = 0; i < 20; i++) { hp += 0.01f; e.OnEnergy(hp); run(150); }
        run(500);
        e.OnLevelEnd(end);
        Console.WriteLine("LIVE end " + end);
        run(end == "fail" ? 3000 : 800);
        e.Dispose();
    }
}
