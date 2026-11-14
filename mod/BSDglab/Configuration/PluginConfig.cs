using System.Runtime.CompilerServices;
using BSDglab.Core;

[assembly: InternalsVisibleTo(IPA.Config.Stores.GeneratedStore.AssemblyVisibilityTarget)]

namespace BSDglab.Configuration
{
    /// <summary>存在 Beat Saber\UserData\BSDglab.json。所有屬性都必須是 virtual(BSIPA 的設定產生器要求)。</summary>
    public class PluginConfig : IEngineSettings
    {
        public virtual bool Enabled { get; set; } = true;
        /// <summary>介面語言:en / zh-TW / zh-CN</summary>
        public virtual string Language { get; set; } = "en";

        // PC 程式的位址(同一台電腦就不用改)
        public virtual string AppHost { get; set; } = "127.0.0.1";
        public virtual int AppPort { get; set; } = 9977;

        /// <summary>每 1% 累計扣血 = 幾點強度。0.5 = 每累計扣 2% 血 +1 強度</summary>
        public virtual float Coefficient { get; set; } = 0.5f;
        /// <summary>回血抵銷的倍率(1 = 回多少抵多少)</summary>
        public virtual float HealFactor { get; set; } = 1f;
        /// <summary>一般遊玩最高輸出 = 手機 App 強度上限的百分之幾(失敗那幾秒不受限)</summary>
        public virtual int PlayCapPercent { get; set; } = 85;
        /// <summary>強度上升速度上限(每秒最多 +幾點強度)</summary>
        public virtual float MaxRisePerSecond { get; set; } = 15f;
        /// <summary>過關失敗時滿檔的秒數</summary>
        public virtual float FailSeconds { get; set; } = 2f;
        public virtual bool ZeroOnPause { get; set; } = true;
        /// <summary>要輸出的通道(進遊戲後以這裡為準,會蓋過 PC 程式 config.json 的 dglab.channels)</summary>
        public virtual bool ChannelA { get; set; } = true;
        public virtual bool ChannelB { get; set; } = false;
        /// <summary>波形(郊狼 App 的經典波形,見 Core/Waveforms.cs 的清單;進遊戲後以這裡為準)</summary>
        public virtual string Waveform { get; set; } = "BUBBLE";
        /// <summary>開了 No Fail(血量歸零也不會失敗)就整關不輸出</summary>
        public virtual bool DisableOnNoFail { get; set; } = true;

        /// <summary>在遊戲 log 記錄血量變化(排查「還沒打到就加強度」之類的問題用)</summary>
        public virtual bool DebugLog { get; set; } = true;

        public virtual bool ShowOverlay { get; set; } = true;
        // 疊層位置(公尺)。預設和遊戲 HUD 同一個深度(Z = 7),在左側 HUD 的上方
        public virtual float HudX { get; set; } = -3.2f;
        public virtual float HudY { get; set; } = 2.4f;
        public virtual float HudZ { get; set; } = 7.0f;
        /// <summary>疊層大小倍率</summary>
        public virtual float HudScale { get; set; } = 1.0f;
        /// <summary>疊層的角度(度)。在設定頁的編輯模式拖動把手時會自動寫入</summary>
        public virtual float HudRotX { get; set; } = 0f;
        public virtual float HudRotY { get; set; } = 0f;
        public virtual float HudRotZ { get; set; } = 0f;
    }
}
