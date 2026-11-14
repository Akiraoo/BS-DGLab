using System.Linq;
using BSDglab.Core;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace BSDglab.UI
{
    /// <summary>
    /// 遊戲內疊層(世界座標的 Canvas)。仿 DG-LAB App 的版面:每個通道一列,
    /// 顯示通道名、目前強度 / 天花板、強度條,以及會動的波形。
    /// 遊戲字型沒有中文,所以全部用英文。
    /// </summary>
    internal class Hud
    {
        const int Bars = 20;            // 波形顯示幾根直條(每根 = 100ms)
        public const float Width = 200f;
        const float HeaderH = 14f;
        const float RowH = 34f;
        const float BarW = 118f;        // 強度條寬度
        const float WaveX = 126f;       // 波形起點
        const float WaveMaxH = 18f;

        static readonly Color Accent = new Color(1f, 0.91f, 0.61f, 1f);       // DG-LAB App 的黃色
        static readonly Color Dim = new Color(1f, 1f, 1f, 0.22f);
        static readonly Color Warn = new Color(1f, 0.3f, 0.25f, 1f);

        public static float HeightFor(int rows) { return HeaderH + RowH * rows; }
        /// <summary>Canvas 單位換成公尺的倍率(和 BSML 的畫面相同,0.02)</summary>
        public static float WorldScale(float userScale) { return 0.02f * (userScale < 0.1f ? 0.1f : userScale); }

        class Row
        {
            public GameObject go;
            public TextMeshProUGUI label;
            public RectTransform fill, cap;
            public Image fillImg;
            public RectTransform[] wave;
            public Image[] waveImg;
            public bool active;
        }

        readonly GameObject root;
        readonly bool embedded; // 放在別人的 Canvas 裡(編輯模式的浮動面板),位置由外面管
        readonly TMP_FontAsset font;
        readonly Material noGlow;
        readonly TextMeshProUGUI header;
        Row[] rows = new Row[0];
        int[] shape = new int[0];
        float phase;
        int lastStep = -1;

        public Hud(Transform parent = null)
        {
            root = new GameObject("BSDglabHud");
            embedded = parent != null;
            if (embedded)
            {
                root.transform.SetParent(parent, false);
                root.AddComponent<RectTransform>();
            }
            else
            {
                var canvas = root.AddComponent<Canvas>();
                canvas.renderMode = RenderMode.WorldSpace;
            }
            font = FindFont();
            // 預設的 UI 材質在遊戲裡會過曝發光,用遊戲自帶的不發光材質
            noGlow = Resources.FindObjectsOfTypeAll<Material>().FirstOrDefault(m => m.name == "UINoGlow");
            header = MakeText(root.transform, 0f, 0f, Width, HeaderH, 8f);
            ApplyTransform();
            Resize();
        }

        /// <summary>
        /// 優先用 BSML 的主字型(它掛了系統字型當後備,才顯示得出中文);拿不到再退回遊戲的 Teko。
        /// 用反射取,避免 BSML 改版時編譯不過。
        /// </summary>
        static TMP_FontAsset FindFont()
        {
            try
            {
                var t = System.Type.GetType("BeatSaberMarkupLanguage.BeatSaberUI, BSML");
                var p = t != null ? t.GetProperty("MainTextFont", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static) : null;
                var f = p != null ? p.GetValue(null, null) as TMP_FontAsset : null;
                if (f != null) return f;
            }
            catch (System.Exception) { }
            return Resources.FindObjectsOfTypeAll<TMP_FontAsset>().FirstOrDefault(f => f.name == "Teko-Medium SDF");
        }

        /// <summary>依設定套用位置、大小、角度</summary>
        void ApplyTransform()
        {
            if (embedded) return;
            var c = Plugin.Cfg;
            root.transform.position = new Vector3(c.HudX, c.HudY, c.HudZ);
            root.transform.rotation = Quaternion.Euler(c.HudRotX, c.HudRotY, c.HudRotZ);
            root.transform.localScale = Vector3.one * WorldScale(c.HudScale);
        }

        public void Destroy()
        {
            if (root != null) Object.Destroy(root);
        }

        /// <summary>顯示一行訊息(沒連線、No Fail 等),不顯示通道</summary>
        public void ShowMessage(string msg)
        {
            header.text = msg;
            SetRows(0);
        }

        /// <summary>顯示通道狀態</summary>
        public void Show(Engine.AppStatus s, float loss)
        {
            string head = "<color=#FFE99D>DG-LAB</color>   " + L.T("hud_loss") + " " + loss.ToString("0") + "%";
            if (s.Emergency) head = "<color=#FF4D40>" + L.T("hud_estop") + "</color>";
            string waveName = Waveforms.LabelOf(s.WaveKey, s.Wave);
            header.text = head;

            var ch = s.Channels;
            SetRows(ch.Length);
            shape = s.Shape ?? new int[0];
            for (int i = 0; i < ch.Length; i++)
            {
                var r = rows[i];
                var c = ch[i];
                string wave = string.IsNullOrEmpty(s.Wave) && string.IsNullOrEmpty(s.WaveKey) ? "" : "   <size=60%><color=#FFFFFF99>" + waveName + "</color></size>";
                r.label.text = "<color=#FFE99D>" + c.Name + "</color>  " + c.Current
                    + " <size=60%><color=#FFFFFF99>/ " + c.Ceiling + "  " + L.T("hud_max") + " " + c.Limit + "</color></size>" + wave;
                float lim = c.Limit > 0 ? c.Limit : 1f;
                float f = Mathf.Clamp01(c.Current / lim);
                r.fill.sizeDelta = new Vector2(BarW * f, 3f);
                // 超過天花板(失敗滿檔那幾秒)時強度條變紅
                r.fillImg.color = c.Current > c.Ceiling ? Warn : Accent;
                r.cap.anchoredPosition = new Vector2(BarW * Mathf.Clamp01(c.Ceiling / lim), -24f);
                bool active = c.Current > 0 && !s.Emergency;
                if (active != r.active)
                {
                    r.active = active;
                    lastStep = -1; // 強制重畫波形
                }
            }
        }

        /// <summary>每幀呼叫:讓波形動起來</summary>
        public void Animate(float dt)
        {
            if (rows.Length == 0) return;
            phase += dt * 10f; // 每根直條 100ms,和實際波形同速
            int step = (int)phase;
            if (step == lastStep) return;
            lastStep = step;
            int n = shape.Length;
            for (int r = 0; r < rows.Length; r++)
            {
                var row = rows[r];
                for (int i = 0; i < Bars; i++)
                {
                    float v = n > 0 ? shape[(step + i) % n] / 100f : 0.5f;
                    // 沒有輸出時波形靜止、變暗
                    float h = row.active ? 1.5f + (WaveMaxH - 1.5f) * v : 1.5f;
                    row.wave[i].sizeDelta = new Vector2(2.2f, h);
                    row.waveImg[i].color = row.active ? Accent : Dim;
                }
            }
        }

        // ---------- 版面 ----------

        void SetRows(int count)
        {
            if (count == rows.Length) return;
            foreach (var r in rows) Object.Destroy(r.go);
            rows = new Row[count];
            for (int i = 0; i < count; i++) rows[i] = MakeRow(i);
            lastStep = -1;
            Resize();
        }

        void Resize()
        {
            var rt = root.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(Width, HeightFor(rows.Length));
        }

        Row MakeRow(int index)
        {
            var r = new Row();
            r.go = new GameObject("Channel");
            r.go.transform.SetParent(root.transform, false);
            var rt = r.go.AddComponent<RectTransform>();
            Place(rt, 0f, -(HeaderH + RowH * index), Width, RowH);

            r.label = MakeText(r.go.transform, 0f, 0f, Width, 22f, 12f);

            // 強度條:底、填滿、天花板標記
            MakeImage(r.go.transform, 0f, -27f, BarW, 3f, Dim);
            r.fillImg = MakeImage(r.go.transform, 0f, -27f, 0f, 3f, Accent);
            r.fill = r.fillImg.rectTransform;
            var capImg = MakeImage(r.go.transform, 0f, -24f, 1.2f, 9f, Color.white);
            r.cap = capImg.rectTransform;

            // 波形:一排直條,由下往上長
            r.wave = new RectTransform[Bars];
            r.waveImg = new Image[Bars];
            for (int i = 0; i < Bars; i++)
            {
                var img = MakeImage(r.go.transform, WaveX + i * 3.6f, -30f, 2.2f, 1.5f, Dim);
                img.rectTransform.pivot = new Vector2(0f, 0f);
                r.wave[i] = img.rectTransform;
                r.waveImg[i] = img;
            }
            return r;
        }

        /// <summary>以左上角為原點擺放(y 往下為負)</summary>
        static void Place(RectTransform rt, float x, float y, float w, float h)
        {
            rt.anchorMin = new Vector2(0f, 1f);
            rt.anchorMax = new Vector2(0f, 1f);
            rt.pivot = new Vector2(0f, 1f);
            rt.anchoredPosition = new Vector2(x, y);
            rt.sizeDelta = new Vector2(w, h);
        }

        TextMeshProUGUI MakeText(Transform parent, float x, float y, float w, float h, float size)
        {
            var go = new GameObject("Text");
            go.transform.SetParent(parent, false);
            var t = go.AddComponent<TextMeshProUGUI>();
            if (font != null) t.font = font;
            t.fontSize = size;
            t.alignment = TextAlignmentOptions.TopLeft;
            t.enableWordWrapping = false;
            t.raycastTarget = false;
            Place(t.rectTransform, x, y, w, h);
            return t;
        }

        Image MakeImage(Transform parent, float x, float y, float w, float h, Color color)
        {
            var go = new GameObject("Img");
            go.transform.SetParent(parent, false);
            var img = go.AddComponent<Image>();
            if (noGlow != null) img.material = noGlow;
            img.color = color;
            img.raycastTarget = false;
            Place(img.rectTransform, x, y, w, h);
            return img;
        }

        // ---------- 由引擎狀態決定顯示內容 ----------

        /// <summary>依引擎目前狀態更新疊層</summary>
        public void Refresh(Engine e)
        {
            if (e == null) { ShowMessage(L.T("hud_disabled")); return; }
            var s = e.Status;
            if (!e.LinkConnected) ShowMessage(L.T("hud_noapp"));
            else if (s == null) ShowMessage(L.T("hud_wait"));
            else if (!s.Paired) ShowMessage(L.T("hud_nophone"));
            else Show(s, e.Loss);
        }

        /// <summary>設定頁預覽用的假資料(沿用真實的通道與波形,數值是示意)</summary>
        public static Engine.AppStatus DemoStatus(Engine e)
        {
            var real = e != null ? e.Status : null;
            var d = new Engine.AppStatus { Paired = true, Wave = "Bubble", WaveKey = Plugin.Cfg.Waveform ?? "", Shape = new[] { 0, 100 } };
            if (real != null && real.Channels.Length > 0)
            {
                d.Wave = real.Wave;
                d.WaveKey = real.WaveKey;
                d.Shape = real.Shape;
                d.Channels = new Engine.ChannelStatus[real.Channels.Length];
                for (int i = 0; i < d.Channels.Length; i++)
                {
                    var c = real.Channels[i];
                    d.Channels[i] = new Engine.ChannelStatus { Name = c.Name, Ceiling = c.Ceiling, Limit = c.Limit, Current = c.Ceiling / 2 + 1 };
                }
            }
            else
            {
                d.Channels = new[] { new Engine.ChannelStatus { Name = "A", Current = 12, Ceiling = 34, Limit = 40 } };
            }
            return d;
        }
    }
}
