using System.Collections.Generic;

namespace BSDglab.Core
{
    /// <summary>郊狼 App 的經典波形清單:{ PC 程式用的名稱, English, 繁體中文, 简体中文 }</summary>
    public static class Waveforms
    {
        public static readonly string[][] All =
        {
            new[] { "EXTRUSTION", "Extrusion", "擠壓", "挤压" },
            new[] { "BUBBLE", "Bubble", "氣泡", "气泡" },
            new[] { "RHYTHM", "Rhythm", "律動", "律动" },
            new[] { "AIR_WAVES", "Air Waves", "電波", "电波" },
            new[] { "DANCE", "Dance", "舞步", "舞步" },
            new[] { "CLIMB", "Climb", "攀登", "攀登" },
            new[] { "SHADE", "Shade", "樹蔭", "树荫" },
            new[] { "PULSE", "Pulse", "脈衝", "脉冲" },
            new[] { "BREATHING", "Breathing", "呼吸", "呼吸" },
            new[] { "TIDE", "Tide", "潮汐", "潮汐" },
            new[] { "PULSATING", "Pulsating", "連擊", "连击" },
            new[] { "QUICK_RUB", "Quick Rub", "快速按捏", "快速按捏" },
            new[] { "GRADUALRUB", "Gradual Rub", "按捏漸強", "按捏渐强" },
            new[] { "HEARTBEAT", "Heartbeat", "心跳節奏", "心跳节奏" },
            new[] { "COMPRESS", "Compress", "壓縮", "压缩" },
            new[] { "RHYTHMIC", "Rhythmic", "節奏步伐", "节奏步伐" },
            new[] { "GRAINY", "Grainy", "顆粒摩擦", "颗粒摩擦" },
            new[] { "BOUNCY", "Bouncy", "漸變彈跳", "渐变弹跳" },
            new[] { "RIPPLE", "Ripple", "波浪漣漪", "波浪涟漪" },
            new[] { "RAINFALL", "Rainfall", "雨水沖刷", "雨水冲刷" },
            new[] { "TEMPO_TAP", "Tempo Tap", "變速敲擊", "变速敲击" },
            new[] { "SIGNAL", "Signal", "信號燈", "信号灯" },
            new[] { "TEASE_1", "Tease 1", "挑逗1", "挑逗1" },
            new[] { "TEASE_2", "Tease 2", "挑逗2", "挑逗2" },
        };

        static string Pick(string[] w)
        {
            int i = 1 + L.Index;
            return i < w.Length ? w[i] : w[1];
        }

        /// <summary>目前語言的波形名稱清單(下拉選單用):官方 24 個,接著是導入的 .pulse(用檔名)</summary>
        public static List<object> Labels()
        {
            var list = new List<object>(All.Length + PulseLibrary.Items.Count);
            Fill(list);
            return list;
        }

        /// <summary>把清單內容換成目前語言的名稱(保留同一個 List 物件,下拉選單綁的是它)</summary>
        public static void Fill(List<object> list)
        {
            list.Clear();
            foreach (var w in All) list.Add(Pick(w));
            foreach (var p in PulseLibrary.Items)
                if (!list.Contains(p.Name)) list.Add(p.Name);
        }

        /// <summary>名稱 → 目前語言的顯示名稱(導入的波形 = 檔名;其他不認得的名稱回傳 fallback 或原樣)</summary>
        public static string LabelOf(string key, string fallback = null)
        {
            if (PulseLibrary.IsKey(key)) return PulseLibrary.NameOf(key);
            foreach (var w in All) if (string.Equals(w[0], key, System.StringComparison.OrdinalIgnoreCase)) return Pick(w);
            if (!string.IsNullOrEmpty(fallback)) return fallback;
            return string.IsNullOrEmpty(key) ? Pick(All[1]) : key;
        }

        /// <summary>顯示名稱(任何語言)→ 名稱;導入的波形 → "pulse:檔名"</summary>
        public static string KeyOf(string label)
        {
            foreach (var w in All)
                for (int i = 1; i < w.Length; i++)
                    if (w[i] == label) return w[0];
            var p = PulseLibrary.Find(label);
            if (p != null) return PulseLibrary.KeyPrefix + p.Name;
            return label;
        }

        /// <summary>這個代號目前選得到嗎(內建,或資料夾裡還有這個 .pulse)</summary>
        public static bool Exists(string key)
        {
            if (PulseLibrary.IsKey(key)) return PulseLibrary.Find(PulseLibrary.NameOf(key)) != null;
            foreach (var w in All) if (string.Equals(w[0], key, System.StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }
    }
}
