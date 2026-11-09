using System.Linq;
using BSDglab.Core;
using TMPro;
using UnityEngine;

namespace BSDglab.UI
{
    /// <summary>遊戲內疊層:世界座標的小文字(遊戲字型沒有中文,所以全部用英文)</summary>
    internal class Hud
    {
        readonly GameObject root;
        readonly TextMeshProUGUI text;

        public Hud(float x, float y, float z)
        {
            root = new GameObject("BSDglabHud");
            var canvas = root.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var rt = root.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(160f, 60f);
            root.transform.position = new Vector3(x, y, z);
            root.transform.localScale = Vector3.one * 0.01f;

            var go = new GameObject("Text");
            go.transform.SetParent(root.transform, false);
            text = go.AddComponent<TextMeshProUGUI>();
            var font = Resources.FindObjectsOfTypeAll<TMP_FontAsset>().FirstOrDefault(f => f.name == "Teko-Medium SDF");
            if (font != null) text.font = font;
            text.fontSize = 14f;
            text.alignment = TextAlignmentOptions.TopLeft;
            text.enableWordWrapping = false;
            var trt = text.rectTransform;
            trt.anchorMin = Vector2.zero;
            trt.anchorMax = Vector2.one;
            trt.offsetMin = Vector2.zero;
            trt.offsetMax = Vector2.zero;
        }

        public void SetText(string s)
        {
            if (text != null) text.text = s;
        }

        public void Destroy()
        {
            if (root != null) Object.Destroy(root);
        }

        public static string Format(Engine e)
        {
            var s = e.Status;
            if (!e.LinkConnected) return "DG-LAB: PC app not connected";
            if (s == null) return "DG-LAB: waiting for PC app...";
            if (!s.Paired) return "DG-LAB: phone not connected";
            string head = s.Emergency ? "DG-LAB  EMERGENCY STOP" : "DG-LAB";
            string cap = s.Ceiling > 0 ? " / " + s.Ceiling : "";
            return head + "\nStrength " + s.Current + cap + "  (app limit " + s.Limit + ")\nLoss " + e.Loss.ToString("0") + "%";
        }
    }
}
