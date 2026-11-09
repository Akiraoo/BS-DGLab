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
            var link = new TcpAppLink(() => Cfg.AppHost, () => Cfg.AppPort);
            Engine = new Engine(Cfg, link, "1.40.8");
            Engine.Start();
            runnerGo = new GameObject("BSDglab");
            Object.DontDestroyOnLoad(runnerGo);
            Runner = runnerGo.AddComponent<EngineRunner>();
            Log.Info("BSDglab enabled");
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
