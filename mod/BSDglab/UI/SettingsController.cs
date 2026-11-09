using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using BeatSaberMarkupLanguage.Attributes;
using BeatSaberMarkupLanguage.Settings;
using Zenject;

namespace BSDglab.UI
{
    /// <summary>設定 → Mod 設定 → DG-LAB。改了馬上套用並同步給 PC 程式。</summary>
    internal class SettingsController : IInitializable, IDisposable, INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler PropertyChanged;

        const string Resource = "BSDglab.UI.Views.settings.bsml";

        public void Initialize()
        {
            BSMLSettings.Instance.AddSettingsMenu("DG-LAB", Resource, this);
            if (Plugin.Runner != null) Plugin.Runner.Second += RefreshStatus;
        }

        public void Dispose()
        {
            if (Plugin.Runner != null) Plugin.Runner.Second -= RefreshStatus;
            if (BSMLSettings.Instance != null) BSMLSettings.Instance.RemoveSettingsMenu(this);
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
                if (e == null) return "mod disabled";
                if (!e.LinkConnected) return "PC app: not connected (is it running?)";
                var s = e.Status;
                if (s == null) return "PC app: connected, waiting for status";
                if (!s.Paired) return "PC app: connected | phone: waiting for QR scan";
                return "PC app: connected | phone: connected | app limit " + s.Limit + " | ceiling " + s.Ceiling;
            }
        }

        [UIValue("enabled")]
        public bool Enabled { get { return Plugin.Cfg.Enabled; } set { Plugin.Cfg.Enabled = value; } }

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

        [UIValue("ox")]
        public float OverlayX { get { return Plugin.Cfg.OverlayX; } set { Plugin.Cfg.OverlayX = value; } }

        [UIValue("oy")]
        public float OverlayY { get { return Plugin.Cfg.OverlayY; } set { Plugin.Cfg.OverlayY = value; } }

        [UIValue("oz")]
        public float OverlayZ { get { return Plugin.Cfg.OverlayZ; } set { Plugin.Cfg.OverlayZ = value; } }

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
