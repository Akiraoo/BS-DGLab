using System;
using UnityEngine;

namespace BSDglab.UI
{
    /// <summary>常駐物件:每幀驅動 Engine(選單中也要送心跳),並每秒通知一次 UI 更新</summary>
    internal class EngineRunner : MonoBehaviour
    {
        public event Action Second;
        float acc;

        void Update()
        {
            var e = Plugin.Engine;
            if (e != null) e.Tick(Time.unscaledDeltaTime);
            acc += Time.unscaledDeltaTime;
            if (acc >= 1f)
            {
                acc = 0f;
                var h = Second;
                if (h != null) h();
            }
        }
    }
}
