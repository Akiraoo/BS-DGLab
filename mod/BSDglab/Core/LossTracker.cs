using System;

namespace BSDglab.Core
{
    /// <summary>
    /// 累計扣血 Loss(單位:血量百分點)。扣血增加、回血減少(乘 HealFactor),最低 0。
    /// 第一筆讀數只當基準,所以譜面一開始 50% 血量不會被當成已扣血。
    /// </summary>
    public sealed class LossTracker
    {
        bool hasLast;
        float lastHealth;

        public float Loss { get; private set; }
        public float HealFactor = 1f;

        public void Reset()
        {
            hasLast = false;
            Loss = 0f;
        }

        /// <param name="energy01">遊戲內血量 0~1</param>
        /// <returns>這次扣掉的百分點(沒扣血回 0)</returns>
        public float Update(float energy01)
        {
            if (float.IsNaN(energy01) || float.IsInfinity(energy01)) return 0f;
            float h = Math.Max(0f, Math.Min(100f, energy01 * 100f));
            if (!hasLast)
            {
                hasLast = true;
                lastHealth = h;
                return 0f;
            }
            float d = h - lastHealth;
            lastHealth = h;
            if (d < 0f) { Loss += -d; return -d; }
            if (d > 0f) Loss = Math.Max(0f, Loss - d * HealFactor);
            return 0f;
        }

        /// <summary>累計值上限(碰牆瞬間扣光血也只算到「剛好頂到天花板」,之後回血才會馬上降)</summary>
        public void ClampTo(float max)
        {
            if (max >= 0f && Loss > max) Loss = max;
        }
    }
}
