using System.Runtime.CompilerServices;
using BSDglab.Core;

[assembly: InternalsVisibleTo(IPA.Config.Stores.GeneratedStore.AssemblyVisibilityTarget)]

namespace BSDglab.Configuration
{
    /// <summary>存在 Beat Saber\UserData\BSDglab.json。所有屬性都必須是 virtual(BSIPA 的設定產生器要求)。</summary>
    public class PluginConfig : IEngineSettings
    {
        public virtual bool Enabled { get; set; } = true;

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
        /// <summary>開了 No Fail(血量歸零也不會失敗)就整關不輸出</summary>
        public virtual bool DisableOnNoFail { get; set; } = true;

        /// <summary>在遊戲 log 記錄血量變化(排查「還沒打到就加強度」之類的問題用)</summary>
        public virtual bool DebugLog { get; set; } = true;

        public virtual bool ShowOverlay { get; set; } = true;
        public virtual float OverlayX { get; set; } = -2.0f;
        public virtual float OverlayY { get; set; } = 1.0f;
        public virtual float OverlayZ { get; set; } = 2.5f;
    }
}
