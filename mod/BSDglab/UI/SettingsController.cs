using System;
using System.Collections.Generic;
using BSDglab.Core;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using BeatSaberMarkupLanguage.Attributes;
using BeatSaberMarkupLanguage.Components.Settings;
using BeatSaberMarkupLanguage.Settings;
using Zenject;

namespace BSDglab.UI
{
    /// <summary>設定 → Mod 設定 → DG-LAB。改了馬上套用並同步給 PC 程式。</summary>
    internal partial class SettingsController : IInitializable, IDisposable, ITickable, INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler PropertyChanged;

        const string Resource = "BSDglab.UI.Views.settings.bsml";

        public void Initialize()
        {
            L.Set(Plugin.Cfg.Language);
            BSMLSettings.Instance.AddSettingsMenu("DG-LAB", Resource, this);
            if (Plugin.Runner != null) Plugin.Runner.Second += RefreshStatus;
        }

        public void Dispose()
        {
            if (Plugin.Runner != null) Plugin.Runner.Second -= RefreshStatus;
            if (BSMLSettings.Instance != null) BSMLSettings.Instance.RemoveSettingsMenu(this);
            HudEditor.Close();
        }

        // ---------- 疊層編輯模式(在選單裡拖動) ----------

        public void Tick()
        {
            var ed = HudEditor.Active;
            if (ed == null) return;
            // 面板被拖動 → 位置已寫進設定,讓滑桿跟著更新
            if (ed.Tick(UnityEngine.Time.unscaledDeltaTime)) NotifyHud();
        }

        void NotifyHud()
        {
            Notify("HudX"); Notify("HudY"); Notify("HudZ"); Notify("HudScale");
        }

        /// <summary>滑桿改的值:和目前值差不到半格就當成是拖動後回寫造成的捨入,不理它(否則拖動時會被吸到整格)</summary>
        static bool Changed(float current, float value)
        {
            return Math.Abs(current - value) > 0.051f;
        }

        static void MoveEditor()
        {
            if (HudEditor.Active != null) HudEditor.Active.ApplyFromConfig();
        }

        static void Push()
        {
            var e = Plugin.Engine;
            if (e != null) e.PushSettings();
        }

        void Notify([CallerMemberName] string name = null)
        {
            var h = PropertyChanged;
            if (h != null) h(this, new PropertyChangedEventArgs(name));
        }

        void RefreshStatus()
        {
            Notify("StatusText");
        }

        [UIValue("status")]
        public string StatusText
        {
            get
            {
                var e = Plugin.Engine;
                if (e == null) return L.T("st_disabled");
                if (!e.LinkConnected) return L.T("st_noapp");
                var s = e.Status;
                if (s == null) return L.T("st_wait");
                if (!s.Paired) return L.T("st_nophone");
                return L.T("st_ok", s.Limit, s.Ceiling);
            }
        }

        [UIValue("enabled")]
        public bool Enabled { get { return Plugin.Cfg.Enabled; } set { Plugin.Cfg.Enabled = value; } }

        [UIValue("cha")]
        public bool ChannelA { get { return Plugin.Cfg.ChannelA; } set { Plugin.Cfg.ChannelA = value; Push(); } }

        [UIValue("chb")]
        public bool ChannelB { get { return Plugin.Cfg.ChannelB; } set { Plugin.Cfg.ChannelB = value; Push(); } }

        [UIValue("langs")]
        public List<object> LangChoices = new List<object>(L.Names);

        [UIValue("lang")]
        public string Language
        {
            get { return L.NameOf(Plugin.Cfg.Language); }
            set
            {
                Plugin.Cfg.Language = L.CodeOf(value);
                L.Set(Plugin.Cfg.Language);
                RefreshWaveList();
                NotifyTexts();
            }
        }

        [UIValue("waves")]
        public List<object> WaveChoices = Waveforms.Labels();

        [UIComponent("wave-list")]
        DropDownListSetting waveList = null;

        /// <summary>波形選單換成目前語言 / 最新的導入清單,並重新顯示目前選的波形</summary>
        void RefreshWaveList()
        {
            Waveforms.Fill(WaveChoices);
            if (waveList == null) return;
            waveList.Values = WaveChoices;
            waveList.UpdateChoices();
            waveList.ReceiveValue();
        }

        [UIAction("reloadwaves")]
        void ReloadWaves()
        {
            Plugin.LoadPulses();
            RefreshWaveList();
            Notify("T_reloadwaves");
            var e = Plugin.Engine;
            if (e != null) { e.SendPulses(); e.PushSettings(); }
        }

        [UIValue("wave")]
        public string Waveform
        {
            get { return Waveforms.LabelOf(Plugin.Cfg.Waveform); }
            set { Plugin.Cfg.Waveform = Waveforms.KeyOf(value); Push(); }
        }

        [UIValue("coef")]
        public float Coefficient { get { return Plugin.Cfg.Coefficient; } set { Plugin.Cfg.Coefficient = value; } }

        [UIValue("heal")]
        public float HealFactor { get { return Plugin.Cfg.HealFactor; } set { Plugin.Cfg.HealFactor = value; } }

        [UIValue("cap")]
        public int PlayCapPercent { get { return Plugin.Cfg.PlayCapPercent; } set { Plugin.Cfg.PlayCapPercent = value; Push(); } }

        [UIValue("rise")]
        public float MaxRise { get { return Plugin.Cfg.MaxRisePerSecond; } set { Plugin.Cfg.MaxRisePerSecond = value; Push(); } }

        [UIValue("fail")]
        public float FailSeconds { get { return Plugin.Cfg.FailSeconds; } set { Plugin.Cfg.FailSeconds = value; Push(); } }

        [UIValue("zeropause")]
        public bool ZeroOnPause { get { return Plugin.Cfg.ZeroOnPause; } set { Plugin.Cfg.ZeroOnPause = value; Push(); } }

        [UIValue("nofail")]
        public bool DisableOnNoFail { get { return Plugin.Cfg.DisableOnNoFail; } set { Plugin.Cfg.DisableOnNoFail = value; } }

        [UIValue("overlay")]
        public bool ShowOverlay { get { return Plugin.Cfg.ShowOverlay; } set { Plugin.Cfg.ShowOverlay = value; } }

        [UIValue("edit")]
        public bool EditMode
        {
            get { return HudEditor.Active != null; }
            set { if (value) HudEditor.Open(); else HudEditor.Close(); }
        }

        [UIValue("ox")]
        public float HudX { get { return Plugin.Cfg.HudX; } set { if (Changed(Plugin.Cfg.HudX, value)) { Plugin.Cfg.HudX = value; MoveEditor(); } } }

        [UIValue("oy")]
        public float HudY { get { return Plugin.Cfg.HudY; } set { if (Changed(Plugin.Cfg.HudY, value)) { Plugin.Cfg.HudY = value; MoveEditor(); } } }

        [UIValue("oz")]
        public float HudZ { get { return Plugin.Cfg.HudZ; } set { if (Changed(Plugin.Cfg.HudZ, value)) { Plugin.Cfg.HudZ = value; MoveEditor(); } } }

        [UIValue("osize")]
        public float HudScale { get { return Plugin.Cfg.HudScale; } set { if (Changed(Plugin.Cfg.HudScale, value)) { Plugin.Cfg.HudScale = value; MoveEditor(); } } }

        [UIAction("resethud")]
        void ResetHud()
        {
            var c = Plugin.Cfg;
            c.HudX = -3.2f; c.HudY = 2.4f; c.HudZ = 7f; c.HudScale = 1f;
            c.HudRotX = 0f; c.HudRotY = 0f; c.HudRotZ = 0f;
            MoveEditor();
            NotifyHud();
        }

        [UIAction("estop")]
        void EmergencyStop()
        {
            var e = Plugin.Engine;
            if (e != null) e.EmergencyStop();
        }

        [UIAction("resume")]
        void ResumeOutput()
        {
            var e = Plugin.Engine;
            if (e != null) e.ResumeOutput();
        }
    }
}
