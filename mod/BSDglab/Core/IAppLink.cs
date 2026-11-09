using System;
using System.Collections.Generic;

namespace BSDglab.Core
{
    public interface IAppLink : IDisposable
    {
        bool IsConnected { get; }
        /// <summary>連線建立 / 中斷 / 收到訊息。注意:可能在背景執行緒觸發</summary>
        event Action Connected;
        event Action Disconnected;
        event Action<Dictionary<string, object>> Message;
        void Start();
        bool Send(string jsonLine);
    }

    public interface IEngineSettings
    {
        bool Enabled { get; }
        string AppHost { get; }
        int AppPort { get; }
        /// <summary>每 1% 累計扣血 = 幾點強度(0.5 = 每 2% +1)</summary>
        float Coefficient { get; }
        float HealFactor { get; }
        /// <summary>一般遊玩最高輸出 = 手機 App 強度上限的百分之幾</summary>
        int PlayCapPercent { get; }
        float MaxRisePerSecond { get; }
        float FailSeconds { get; }
        bool ZeroOnPause { get; }
    }
}
