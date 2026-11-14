using System.Collections.Generic;

namespace BSDglab.Core
{
    /// <summary>介面文字的多語系表:English / 繁體中文 / 简体中文</summary>
    public static class L
    {
        public static readonly string[] Codes = { "en", "zh-TW", "zh-CN" };
        public static readonly string[] Names = { "English", "繁體中文 (Traditional Chinese)", "简体中文 (Simplified Chinese)" };

        /// <summary>目前語言在 Codes 裡的索引</summary>
        public static int Index;

        public static void Set(string code)
        {
            Index = 0;
            for (int i = 0; i < Codes.Length; i++)
                if (string.Equals(Codes[i], code, System.StringComparison.OrdinalIgnoreCase)) Index = i;
        }

        public static string NameOf(string code)
        {
            for (int i = 0; i < Codes.Length; i++)
                if (string.Equals(Codes[i], code, System.StringComparison.OrdinalIgnoreCase)) return Names[i];
            return Names[0];
        }

        public static string CodeOf(string name)
        {
            for (int i = 0; i < Names.Length; i++) if (Names[i] == name) return Codes[i];
            return Codes[0];
        }

        /// <summary>取目前語言的文字;找不到 key 就回傳 key 本身</summary>
        public static string T(string key)
        {
            string[] v;
            if (!Table.TryGetValue(key, out v)) return key;
            return v[Index < v.Length ? Index : 0];
        }

        public static string T(string key, params object[] args)
        {
            return string.Format(T(key), args);
        }

        public static IEnumerable<string> Keys { get { return Table.Keys; } }

        static readonly Dictionary<string, string[]> Table = new Dictionary<string, string[]>
        {
            { "enabled", new[] { "Enabled", "啟用", "启用" } },
            { "cha", new[] { "Channel A", "A 通道", "A 通道" } },
            { "chb", new[] { "Channel B", "B 通道", "B 通道" } },
            { "wave", new[] { "Waveform", "波形", "波形" } },
            { "wave_hint", new[] { "The classic waveforms from the DG-LAB app, then your imported .pulse files", "郊狼 App 的經典波形,後面接著你導入的 .pulse 檔", "郊狼 App 的经典波形,后面接着你导入的 .pulse 文件" } },
            { "reloadwaves", new[] { "Reload imported waveforms ({0})", "重新載入導入的波形({0} 個)", "重新加载导入的波形({0} 个)" } },
            { "reloadwaves_hint", new[] { "Put .pulse files exported from the DG-LAB app in Beat Saber/UserData/BSDglab/Waveforms, then press this", "把郊狼 App 導出的 .pulse 檔放進 Beat Saber/UserData/BSDglab/Waveforms,再按這個按鈕", "把郊狼 App 导出的 .pulse 文件放进 Beat Saber/UserData/BSDglab/Waveforms,再按这个按钮" } },
            { "coef", new[] { "Strength per 1% HP lost", "每扣 1% 血增加的強度", "每扣 1% 血增加的强度" } },
            { "coef_hint", new[] { "0.5 = +1 strength for every 2% of accumulated HP loss", "0.5 = 每累計扣 2% 血,強度 +1", "0.5 = 每累计扣 2% 血,强度 +1" } },
            { "heal", new[] { "Heal factor", "回血抵銷倍率", "回血抵消倍率" } },
            { "heal_hint", new[] { "1 = healing cancels loss 1:1", "1 = 回多少血就抵銷多少扣血", "1 = 回多少血就抵消多少扣血" } },
            { "cap", new[] { "Max output (% of app limit)", "最高輸出(App 上限的 %)", "最高输出(App 上限的 %)" } },
            { "cap_hint", new[] { "Normal play never exceeds this. Failing still goes to full for a moment.", "一般遊玩不會超過這個值;失敗時仍會短暫滿檔", "一般游玩不会超过这个值;失败时仍会短暂满档" } },
            { "rise", new[] { "Max rise (strength/s)", "上升速度上限(強度/秒)", "上升速度上限(强度/秒)" } },
            { "fail", new[] { "Fail full-power seconds", "失敗滿檔秒數", "失败满档秒数" } },
            { "zeropause", new[] { "Zero output while paused", "暫停時歸零", "暂停时归零" } },
            { "nofail", new[] { "No output when No Fail is on", "開啟 No Fail 時不輸出", "开启 No Fail 时不输出" } },
            { "overlay", new[] { "Show overlay in game", "遊戲內顯示疊層", "游戏内显示叠层" } },
            { "edit", new[] { "Overlay edit mode", "疊層編輯模式", "叠层编辑模式" } },
            { "edit_hint", new[] { "Shows the overlay in the menu. Point at its handle, hold the trigger and drag to move or turn it.", "在選單中顯示疊層。指向把手、按住扳機拖動即可移動或轉向。", "在菜单中显示叠层。指向把手、按住扳机拖动即可移动或转向。" } },
            { "ox", new[] { "Overlay X (left / right)", "疊層 X(左右)", "叠层 X(左右)" } },
            { "oy", new[] { "Overlay Y (height)", "疊層 Y(高度)", "叠层 Y(高度)" } },
            { "oz", new[] { "Overlay Z (distance)", "疊層 Z(距離)", "叠层 Z(距离)" } },
            { "osize", new[] { "Overlay size", "疊層大小", "叠层大小" } },
            { "resethud", new[] { "Reset overlay position", "重設疊層位置", "重置叠层位置" } },
            { "estop", new[] { "EMERGENCY STOP", "緊急停止", "紧急停止" } },
            { "resume", new[] { "Resume output", "恢復輸出", "恢复输出" } },
            { "lang", new[] { "Language", "語言", "语言" } },
            { "lang_hint", new[] { "Reopen this page (or restart the game) if some text does not update", "若部分文字沒有更新,請重新進入此頁或重啟遊戲", "若部分文字没有更新,请重新进入此页或重启游戏" } },
            { "st_disabled", new[] { "mod disabled", "mod 已停用", "mod 已停用" } },
            { "st_noapp", new[] { "PC app: not connected (is it running?)", "PC 程式:未連線(有在執行嗎?)", "PC 程序:未连接(有在运行吗?)" } },
            { "st_wait", new[] { "PC app: connected, waiting for status", "PC 程式:已連線,等待狀態", "PC 程序:已连接,等待状态" } },
            { "st_nophone", new[] { "PC app: connected | phone: waiting for QR scan", "PC 程式:已連線 | 手機:等待掃描 QR code", "PC 程序:已连接 | 手机:等待扫描二维码" } },
            { "st_ok", new[] { "PC app: connected | phone: connected | app limit {0} | ceiling {1}", "PC 程式:已連線 | 手機:已連線 | App 上限 {0} | 天花板 {1}", "PC 程序:已连接 | 手机:已连接 | App 上限 {0} | 天花板 {1}" } },
            { "hud_loss", new[] { "Loss", "扣血", "扣血" } },
            { "hud_max", new[] { "max", "上限", "上限" } },
            { "hud_estop", new[] { "EMERGENCY STOP", "緊急停止", "紧急停止" } },
            { "hud_disabled", new[] { "DG-LAB: mod disabled", "DG-LAB:mod 已停用", "DG-LAB:mod 已停用" } },
            { "hud_noapp", new[] { "DG-LAB: PC app not connected", "DG-LAB:PC 程式未連線", "DG-LAB:PC 程序未连接" } },
            { "hud_wait", new[] { "DG-LAB: waiting for PC app...", "DG-LAB:等待 PC 程式…", "DG-LAB:等待 PC 程序…" } },
            { "hud_nophone", new[] { "DG-LAB: phone not connected", "DG-LAB:手機未連線", "DG-LAB:手机未连接" } },
            { "hud_nofail", new[] { "DG-LAB: No Fail on - output disabled", "DG-LAB:已開啟 No Fail,不輸出", "DG-LAB:已开启 No Fail,不输出" } },
        };
    }
}
