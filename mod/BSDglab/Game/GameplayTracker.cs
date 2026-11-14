using System;
using BSDglab.Core;
using BSDglab.UI;
using Zenject;

namespace BSDglab.Game
{
    /// <summary>單人關卡內:把遊戲的血量、暫停、結束事件轉給 Engine,並顯示疊層</summary>
    internal class GameplayTracker : IInitializable, IDisposable, ITickable
    {
        readonly IGameEnergyCounter energyCounter;
        readonly IGamePause pause;
        readonly ILevelEndActions levelEnd;
        readonly GameplayCoreSceneSetupData setupData;
        bool suppressed; // 開了 No Fail → 整關不輸出
        Hud hud;
        float hudAcc;
        float sinceStart;
        int frames;
        bool began;
        int logged;

        public GameplayTracker(IGameEnergyCounter energyCounter, [InjectOptional] IGamePause pause, [InjectOptional] ILevelEndActions levelEnd, [InjectOptional] GameplayCoreSceneSetupData setupData)
        {
            this.setupData = setupData;
            this.energyCounter = energyCounter;
            this.pause = pause;
            this.levelEnd = levelEnd;
        }

        public void Initialize()
        {
            // 設定頁的編輯面板不帶進關卡
            HudEditor.Close();
            var engine = Plugin.Engine;
            if (engine == null) return;
            var mods = setupData != null ? setupData.gameplayModifiers : null;
            if (Plugin.Cfg.DisableOnNoFail && mods != null && mods.noFailOn0Energy)
            {
                // 開了 No Fail:不通知 PC 程式有關卡開始,所以整關輸出都是 0(PC 程式維持待機)
                suppressed = true;
                Plugin.Log.Info("No Fail is on: DG-LAB output disabled for this level");
                if (Plugin.Cfg.ShowOverlay)
                {
                    hud = new Hud();
                    hud.ShowMessage(BSDglab.Core.L.T("hud_nofail"));
                }
                return;
            }
            engine.OnLevelStart(); // 基準等音樂開始後才取(見 Tick)
            if (Plugin.Cfg.DebugLog) Plugin.Log.Info("level start, energy=" + energyCounter.energy.ToString("0.000"));

            energyCounter.gameEnergyDidChangeEvent += OnEnergyChanged;
            if (pause != null)
            {
                pause.didPauseEvent += OnPause;
                pause.didResumeEvent += OnResume;
            }
            if (levelEnd != null)
            {
                levelEnd.levelFinishedEvent += OnFinished;
                levelEnd.levelFailedEvent += OnFailed;
            }
            if (Plugin.Cfg.ShowOverlay)
            {
                hud = new Hud();
                hud.Refresh(engine);
            }
        }

        public void Tick()
        {
            var eng = Plugin.Engine;
            if (suppressed) return;
            if (!began && eng != null)
            {
                sinceStart += UnityEngine.Time.unscaledDeltaTime;
                frames++;
                // 不等音樂開始(會漏掉前面的方塊),只等進場後的 2 幀,讓遊戲把血量初始化完再取基準
                if (frames >= 2)
                {
                    began = true;
                    eng.BeginTracking(energyCounter.energy);
                    if (Plugin.Cfg.DebugLog) Plugin.Log.Info("tracking begins, baseline energy=" + energyCounter.energy.ToString("0.000"));
                }
            }
            if (hud == null) return;
            float dt = UnityEngine.Time.unscaledDeltaTime;
            hud.Animate(dt);
            hudAcc += dt;
            if (hudAcc < 0.2f) return;
            hudAcc = 0f;
            hud.Refresh(Plugin.Engine);
        }

        void OnEnergyChanged(float energy)
        {
            var e = Plugin.Engine;
            if (e == null) return;
            if (Plugin.Cfg.DebugLog && logged < 300)
            {
                logged++;
                Plugin.Log.Info("energy " + energy.ToString("0.000") + " t+" + sinceStart.ToString("0.00") + "s tracking " + e.Tracking);
            }
            e.OnEnergy(energy);
        }

        void OnPause()
        {
            var e = Plugin.Engine;
            if (e != null) e.OnPause(true);
        }

        void OnResume()
        {
            var e = Plugin.Engine;
            if (e != null) e.OnPause(false);
        }

        void OnFinished()
        {
            var e = Plugin.Engine;
            if (e != null) e.OnLevelEnd("clear");
        }

        void OnFailed()
        {
            var e = Plugin.Engine;
            if (e != null) e.OnLevelEnd("fail");
        }

        public void Dispose()
        {
            energyCounter.gameEnergyDidChangeEvent -= OnEnergyChanged;
            if (pause != null)
            {
                pause.didPauseEvent -= OnPause;
                pause.didResumeEvent -= OnResume;
            }
            if (levelEnd != null)
            {
                levelEnd.levelFinishedEvent -= OnFinished;
                levelEnd.levelFailedEvent -= OnFailed;
            }
            // 沒有收到過關/失敗就離開場景(按「離開」、「重新開始」、遊戲關閉)→ 當成 quit
            var e = Plugin.Engine;
            if (e != null && e.Playing) e.OnLevelEnd("quit");
            if (hud != null) hud.Destroy();
            hud = null;
        }
    }
}
