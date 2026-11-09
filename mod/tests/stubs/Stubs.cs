// 型別檢查用的「假遊戲 API」:只依照我記憶中的簽章寫,用來抓自己程式碼的筆誤與型別錯誤。
// 它不能證明真實的 Beat Saber / BSIPA / BSML / SiraUtil API 一定長這樣 —— 真正的驗證要在你的電腦上編譯。
using System;
using System.Collections.Generic;

namespace IPA
{
    public enum RuntimeOptions { SingleStartInit, DynamicInit }
    [AttributeUsage(AttributeTargets.Class)] public class PluginAttribute : Attribute { public PluginAttribute(RuntimeOptions o) { } }
    [AttributeUsage(AttributeTargets.Constructor | AttributeTargets.Method)] public class InitAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Method)] public class OnEnableAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Method)] public class OnDisableAttribute : Attribute { }
}
namespace IPA.Logging { public class Logger { public void Info(string s) { } public void Warn(string s) { } } }
namespace IPA.Config
{
    public class Config { }
}
namespace IPA.Config.Stores
{
    public static class GeneratedStore
    {
        public const string AssemblyVisibilityTarget = "IPA.Config.Stores.GeneratedStore";
        public static T Generated<T>(this IPA.Config.Config c) where T : class, new() { return new T(); }
    }
}
namespace SiraUtil.Zenject
{
    [Flags] public enum Location { Menu = 1, StandardPlayer = 2 }
    public class Zenjector { public Zenjector Install<T>(Location l) where T : global::Zenject.IInstaller { return this; } }
}
namespace Zenject
{
    public interface IInstaller { }
    public interface IInitializable { void Initialize(); }
    public interface ITickable { void Tick(); }
    [AttributeUsage(AttributeTargets.Parameter)] public class InjectOptionalAttribute : Attribute { }
    public class BindBuilder { public BindBuilder AsSingle() { return this; } }
    public class DiContainer { public BindBuilder BindInterfacesTo<T>() { return new BindBuilder(); } }
    public abstract class Installer : IInstaller { protected DiContainer Container = new DiContainer(); public abstract void InstallBindings(); }
}
namespace BeatSaberMarkupLanguage.Attributes
{
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field)] public class UIValueAttribute : Attribute { public UIValueAttribute(string n) { } }
    [AttributeUsage(AttributeTargets.Method)] public class UIActionAttribute : Attribute { public UIActionAttribute(string n) { } }
}
namespace BeatSaberMarkupLanguage.Settings
{
    public class BSMLSettings
    {
        public static BSMLSettings Instance = new BSMLSettings();
        public void AddSettingsMenu(string name, string resource, object host) { }
        public void RemoveSettingsMenu(object host) { }
    }
}
// ---- 遊戲型別 ----
public interface IGameEnergyCounter { float energy { get; } event Action<float> gameEnergyDidChangeEvent; event Action gameEnergyDidReach0Event; }
public interface IGamePause { event Action didPauseEvent; event Action didResumeEvent; }
public class GameplayModifiers { public bool noFailOn0Energy; }
public class GameplayCoreSceneSetupData { public GameplayModifiers gameplayModifiers; }
public interface IAudioTimeSource { float songTime { get; } }
public interface ILevelEndActions { event Action levelFinishedEvent; event Action levelFailedEvent; }
// ---- Unity / TMP ----
namespace UnityEngine
{
    public struct Vector2 { public float x, y; public Vector2(float x, float y) { this.x = x; this.y = y; } public static Vector2 zero = new Vector2(0, 0), one = new Vector2(1, 1); }
    public struct Vector3 { public float x, y, z; public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; } public static Vector3 one = new Vector3(1, 1, 1); public static Vector3 operator *(Vector3 a, float f) { return new Vector3(a.x * f, a.y * f, a.z * f); } }
    public class Object { public static void DontDestroyOnLoad(Object o) { } public static void Destroy(Object o) { } public string name; public static implicit operator bool(Object o) { return !ReferenceEquals(o, null); } }
    public class Component : Object { public Transform transform; public T GetComponent<T>() where T : class, new() { return new T(); } }
    public class Transform : Component { public Vector3 position, localScale; public void SetParent(Transform p, bool worldPositionStays) { } }
    public class RectTransform : Transform { public Vector2 sizeDelta, anchorMin, anchorMax, offsetMin, offsetMax; }
    public class GameObject : Object
    {
        public Transform transform = new Transform();
        public GameObject(string n) { }
        public T AddComponent<T>() where T : class, new() { return new T(); }
        public T GetComponent<T>() where T : class, new() { return new T(); }
    }
    public class MonoBehaviour : Component { }
    public enum RenderMode { WorldSpace }
    public class Canvas : Component { public RenderMode renderMode; }
    public static class Time { public static float unscaledDeltaTime; }
    public static class Resources { public static T[] FindObjectsOfTypeAll<T>() where T : class { return new T[0]; } }
}
namespace TMPro
{
    public enum TextAlignmentOptions { TopLeft }
    public class TMP_FontAsset : UnityEngine.Object { }
    public class TextMeshProUGUI : UnityEngine.Component
    {
        public TMP_FontAsset font; public float fontSize; public TextAlignmentOptions alignment; public bool enableWordWrapping; public string text;
        public UnityEngine.RectTransform rectTransform = new UnityEngine.RectTransform();
    }
}
