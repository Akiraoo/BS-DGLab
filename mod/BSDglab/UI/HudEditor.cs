using BeatSaberMarkupLanguage.FloatingScreen;
using BSDglab.Core;
using UnityEngine;

namespace BSDglab.UI
{
    /// <summary>
    /// 疊層的編輯模式:在選單裡放一個帶把手的浮動面板(BSML 的 FloatingScreen),
    /// 用控制器的射線按住把手就能拖動 / 轉向,放開後位置會存進設定。
    /// </summary>
    internal class HudEditor
    {
        /// <summary>目前開著的編輯面板(進關卡時要關掉)</summary>
        public static HudEditor Active;

        readonly FloatingScreen screen;
        readonly Hud hud;
        Vector3 lastPos;
        Vector3 lastRot;
        float demoAcc;

        public static void Open()
        {
            if (Active == null) Active = new HudEditor();
        }

        public static void Close()
        {
            if (Active == null) return;
            Active.Destroy();
            Active = null;
        }

        HudEditor()
        {
            var c = Plugin.Cfg;
            screen = FloatingScreen.CreateFloatingScreen(new Vector2(Hud.Width, Hud.HeightFor(2)), true,
                new Vector3(c.HudX, c.HudY, c.HudZ), Quaternion.Euler(c.HudRotX, c.HudRotY, c.HudRotZ), 0f, true);
            screen.ShowHandle = true;
            hud = new Hud(screen.transform);
            hud.Show(Hud.DemoStatus(Plugin.Engine), 24f);
            ApplyFromConfig();
        }

        void Destroy()
        {
            if (screen != null) Object.Destroy(screen.gameObject);
        }

        /// <summary>設定值改了(拖滑桿、重設)→ 把面板移過去</summary>
        public void ApplyFromConfig()
        {
            var c = Plugin.Cfg;
            var t = screen.transform;
            t.position = new Vector3(c.HudX, c.HudY, c.HudZ);
            t.rotation = Quaternion.Euler(c.HudRotX, c.HudRotY, c.HudRotZ);
            t.localScale = Vector3.one * Hud.WorldScale(c.HudScale);
            lastPos = t.position;
            lastRot = t.eulerAngles;
        }

        /// <summary>每幀呼叫。面板被拖動過就把新位置寫進設定,回傳 true。</summary>
        public bool Tick(float dt)
        {
            hud.Animate(dt);
            demoAcc += dt;
            if (demoAcc >= 1f)
            {
                demoAcc = 0f;
                hud.Show(Hud.DemoStatus(Plugin.Engine), 24f);
            }

            var t = screen.transform;
            Vector3 p = t.position, r = t.eulerAngles;
            if (Near(p, lastPos, 0.0005f) && Near(r, lastRot, 0.05f)) return false;
            lastPos = p;
            lastRot = r;
            var c = Plugin.Cfg;
            c.HudX = p.x; c.HudY = p.y; c.HudZ = p.z;
            c.HudRotX = r.x; c.HudRotY = r.y; c.HudRotZ = r.z;
            return true;
        }

        static bool Near(Vector3 a, Vector3 b, float eps)
        {
            return Mathf.Abs(a.x - b.x) < eps && Mathf.Abs(a.y - b.y) < eps && Mathf.Abs(a.z - b.z) < eps;
        }
    }
}
