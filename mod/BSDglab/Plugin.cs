using BSDglab.Configuration;
using BSDglab.Core;
using BSDglab.Game;
using BSDglab.UI;
using IPA;
using IPA.Config;
using IPA.Config.Stores;
using SiraUtil.Zenject;
using UnityEngine;
using IPALogger = IPA.Logging.Logger;

namespace BSDglab
{
    [Plugin(RuntimeOptions.DynamicInit)]
    public class Plugin
    {
        internal static IPALogger Log { get; private set; }
        internal static PluginConfig Cfg { get; private set; }
        internal static Engine Engine { get; private set; }
        internal static EngineRunner Runner { get; private set; }

        GameObject runnerGo;

        [Init]
        public Plugin(IPALogger logger, Config conf, Zenjector zenjector)
        {
            Log = logger;
            Cfg = conf.Generated<PluginConfig>();
            zenjector.Install<MenuInstaller>(Location.Menu);
            zenjector.Install<GameInstaller>(Location.StandardPlayer); // 只在單人關卡啟用
        }

        [OnEnable]
        public void OnEnable()
        {
            BSDglab.Core.L.Set(Cfg.Language);
            LoadPulses();
            var link = new TcpAppLink(() => Cfg.AppHost, () => Cfg.AppPort);
            Engine = new Engine(Cfg, link, "1.40.8");
            Engine.Start();
            runnerGo = new GameObject("BSDglab");
            Object.DontDestroyOnLoad(runnerGo);
            Runner = runnerGo.AddComponent<EngineRunner>();
            Log.Info("BSDglab enabled");
        }

        /// <summary>導入的波形資料夾:Beat Saber\UserData\BSDglab\Waveforms</summary>
        internal static string PulseFolder
        {
            get { return System.IO.Path.Combine(System.IO.Path.Combine(IPA.Utilities.UnityGame.UserDataPath, "BSDglab"), "Waveforms"); }
        }

        /// <summary>重新掃描導入的波形。設定裡選的導入波形若已不存在,改回 BUBBLE。</summary>
        internal static void LoadPulses()
        {
            var errors = new System.Collections.Generic.List<string>();
            int n = PulseLibrary.Load(PulseFolder, errors);
            Log.Info("imported waveforms: " + n + " (" + PulseFolder + ")");
            foreach (var e in errors) Log.Warn("waveform skipped: " + e);
            if (!Waveforms.Exists(Cfg.Waveform)) Cfg.Waveform = "BUBBLE";
        }

        [OnDisable]
        public void OnDisable()
        {
            if (Engine != null && Engine.Playing) Engine.OnLevelEnd("quit");
            if (runnerGo != null) Object.Destroy(runnerGo);
            Runner = null;
            if (Engine != null) Engine.Dispose();
            Engine = null;
        }
    }
}
